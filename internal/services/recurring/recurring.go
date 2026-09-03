package recurring

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/transactiontemplates"
	"github.com/mishamsk/mina/internal/services/values"
	"github.com/mishamsk/mina/internal/x/fuzzyrank"
	"github.com/mishamsk/mina/internal/x/lease"
)

const maxFutureProjections = 10_000

// ScheduleClass identifies the recurring schedule class derived from schedule_rule.kind.
type ScheduleClass string

const (
	// ScheduleClassInterval identifies fixed interval schedules.
	ScheduleClassInterval ScheduleClass = "interval"
	// ScheduleClassDateRule identifies calendar date-rule schedules.
	ScheduleClassDateRule ScheduleClass = "date_rule"
)

// Definition is a recurring transaction definition with nested active record shape.
type Definition struct {
	ID                int64
	FQN               string
	ScheduleRule      json.RawMessage
	ScheduleClass     ScheduleClass
	AnchorDate        values.CivilDate
	DefinitionVersion int64
	PausedAt          *time.Time
	ParentFQN         *string
	Name              string
	Level             int
	NextDueDate       *values.CivilDate
	Class             transactions.TransactionClass
	DisplayAmounts    []transactions.DisplayAmount
	CreatedAt         time.Time
	UpdatedAt         time.Time
	TombstonedAt      *time.Time
	Records           []DefinitionRecord
}

// ActiveFQN is the active recurring definition path data needed for hierarchy checks.
type ActiveFQN struct {
	ID  int64
	FQN string
}

// DefinitionRecord is one complete journal-record shape copied to generated transactions.
type DefinitionRecord struct {
	ID                    int64
	RecurringDefinitionID int64
	AccountID             int64
	MemberID              *int64
	Currency              string
	Amount                values.Decimal
	CategoryID            *int64
	TagIDs                []int64
	Memo                  *string
	CreatedAt             time.Time
	UpdatedAt             time.Time
	TombstonedAt          *time.Time
}

// WriteInput contains the shared fields for creating or replacing a recurring definition.
type WriteInput struct {
	FQN          string
	ScheduleRule json.RawMessage
	TemplateID   *int64
	Records      []RecordInput
}

// CreateInput contains fields for creating a recurring definition.
type CreateInput struct {
	WriteInput
	AnchorDate values.CivilDate
}

// ReplaceInput contains fields and the revision precondition for replacing a recurring definition.
type ReplaceInput struct {
	WriteInput
	AnchorDate   *values.CivilDate
	ExpectedETag string
}

// DefinitionListOptions controls recurring-definition filtering, sorting, and pagination.
type DefinitionListOptions struct {
	Query string
	List  services.ListOptions
}

// RecordInput is one possibly-template-seeded record shape in a write request.
type RecordInput struct {
	AccountID  *int64
	MemberID   OptionalInt64
	Currency   *string
	Amount     *values.Decimal
	CategoryID OptionalInt64
	TagIDs     OptionalInt64Slice
	Memo       OptionalString
}

// DeferInput contains an optional client-selected schedule offset.
type DeferInput struct {
	Every *int64
	Unit  *string
}

// ConfirmExpectedInput contains the actual transaction date and settlement intent for expected-transaction review.
type ConfirmExpectedInput struct {
	ActualDate *values.CivilDate
	Settlement transactions.SettlementIntent
}

// OptionalInt64Slice carries an optional array field where an empty array is meaningful.
type OptionalInt64Slice struct {
	Specified bool
	Values    []int64
}

// OptionalInt64 carries an optional nullable int64 field where null is meaningful.
type OptionalInt64 struct {
	Specified bool
	Value     *int64
}

// OptionalString carries an optional nullable string field where null is meaningful.
type OptionalString struct {
	Specified bool
	Value     *string
}

// SaveInput contains fully validated fields persisted by the recurring repository.
type SaveInput struct {
	FQN               string
	ScheduleRule      json.RawMessage
	AnchorDate        values.CivilDate
	ExpectedUpdatedAt *time.Time
	Records           []DefinitionRecordInput
}

// DefinitionRecordInput is one complete record shape persisted for a recurring definition.
type DefinitionRecordInput struct {
	AccountID  int64
	MemberID   *int64
	Currency   string
	Amount     values.Decimal
	CategoryID *int64
	TagIDs     []int64
	Memo       *string
}

// ExpectedConfirmationRecord contains the persisted amount inputs needed to revalue an expected transaction.
type ExpectedConfirmationRecord struct {
	ID       int64
	Currency string
	Amount   values.Decimal
}

// ExpectedConfirmation contains an expected recurring transaction and its active records.
type ExpectedConfirmation struct {
	ScheduledDate values.CivilDate
	Records       []ExpectedConfirmationRecord
}

// ExpectedRecordValuation carries one actual-date USD valuation into atomic confirmation.
type ExpectedRecordValuation struct {
	ID        int64
	AmountUSD *values.Decimal
}

// ExpectedTransactionInput contains one catch-up slot and generated record shape.
type ExpectedTransactionInput struct {
	ScheduledDate values.CivilDate
	Records       []transactions.PersistJournalRecordInput
}

// CatchUpInput contains every due transaction for one definition and its resulting next anchor.
type CatchUpInput struct {
	Definition   Definition
	Transactions []ExpectedTransactionInput
	NextAnchor   values.CivilDate
}

// Repository persists recurring definition state.
type Repository interface {
	Create(context.Context, SaveInput) (Definition, error)
	Get(context.Context, int64) (Definition, error)
	List(context.Context, services.ListOptions) (services.PaginatedList[Definition], error)
	ListActiveFQNs(context.Context) ([]ActiveFQN, error)
	Replace(context.Context, int64, SaveInput) (Definition, error)
	Tombstone(context.Context, int64) error
	ListMaterializationDefinitions(context.Context) ([]Definition, error)
	MaterializeExpectedTransactions(context.Context, []CatchUpInput) error
	CreateConfirmedTransaction(context.Context, Definition, values.CivilDate, values.CivilDate, []transactions.PersistJournalRecordInput) (transactions.Transaction, error)
	GetExpectedConfirmation(context.Context, int64) (ExpectedConfirmation, error)
	ConfirmExpectedTransaction(context.Context, int64, values.CivilDate, []ExpectedRecordValuation, *time.Time, *time.Time, time.Time) (transactions.Transaction, error)
	DismissExpectedTransaction(context.Context, int64, time.Time) error
	ShiftAnchor(context.Context, Definition, values.CivilDate) (Definition, error)
	PauseDefinition(context.Context, int64) (Definition, error)
	ResumeDefinition(context.Context, Definition, values.CivilDate) (Definition, error)
}

// AccountReferenceValidator resolves active account references for definition validation.
type AccountReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, accounts.ReferenceOptions) (map[int64]accounts.Reference, error)
	ValidateActiveRecordReferences(context.Context, []accounts.RecordReference, accounts.ReferenceOptions) (map[int64]accounts.Reference, error)
}

// CategoryReferenceValidator resolves active category references for definition validation.
type CategoryReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, categories.ReferenceOptions) (map[int64]categories.Reference, error)
}

// TagReferenceValidator resolves active tag references for definition validation.
type TagReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, tags.ReferenceOptions) (map[int64]tags.Reference, error)
}

// MemberReferenceValidator resolves active household-member references for definition validation.
type MemberReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, members.ReferenceOptions) (map[int64]members.Reference, error)
}

// TemplateReader reads transaction templates for copy-only definition seeding.
type TemplateReader interface {
	Get(context.Context, int64) (transactiontemplates.Template, error)
}

// AmountUSDDeriver derives signed USD amounts for generated journal records.
type AmountUSDDeriver interface {
	SignedAmountUSD(context.Context, string, values.Decimal, values.CivilDate) (*values.Decimal, error)
}

// ReferenceCoordinator coordinates definition mutations with dependent writes.
type ReferenceCoordinator interface {
	WithSharedLease(context.Context, func(context.Context) error) error
	WithExclusiveLease(context.Context, func(context.Context) error) error
}

// StateCoordinator serializes recurring anchor and generated-transaction changes.
type StateCoordinator interface {
	WithSharedLease(context.Context, func(context.Context) error) error
	WithExclusiveLease(context.Context, func(context.Context) error) error
}

// Service owns recurring definition use cases and validation.
type Service struct {
	repo                 Repository
	accounts             AccountReferenceValidator
	categories           CategoryReferenceValidator
	tags                 TagReferenceValidator
	members              MemberReferenceValidator
	templates            TemplateReader
	amountUSD            AmountUSDDeriver
	refs                 ReferenceCoordinator
	state                StateCoordinator
	clock                transactions.Clock
	currencyUsageChanged func()
}

// NewService creates a recurring definition service backed by repositories.
func NewService(
	repo Repository,
	accounts AccountReferenceValidator,
	categories CategoryReferenceValidator,
	tags TagReferenceValidator,
	members MemberReferenceValidator,
	templates TemplateReader,
	amountUSD AmountUSDDeriver,
	refs ReferenceCoordinator,
	state StateCoordinator,
	clock transactions.Clock,
	currencyUsageChanged func(),
) *Service {
	return &Service{
		repo:                 repo,
		accounts:             accounts,
		categories:           categories,
		tags:                 tags,
		members:              members,
		templates:            templates,
		amountUSD:            amountUSD,
		refs:                 refs,
		state:                state,
		clock:                clock,
		currencyUsageChanged: currencyUsageChanged,
	}
}

// Create validates and creates a recurring definition.
func (s *Service) Create(ctx context.Context, input CreateInput) (Definition, error) {
	var definition Definition
	if err := lease.Combine(ctx, []lease.Func{s.refs.WithExclusiveLease, s.state.WithExclusiveLease}, func(ctx context.Context) error {
		save, err := s.prepareCreateInput(ctx, input)
		if err != nil {
			return err
		}
		if err := s.ensureFQNAvailable(ctx, 0, save.FQN); err != nil {
			return err
		}

		created, err := s.repo.Create(ctx, save)
		if errors.Is(err, services.ErrConflict) {
			return services.Conflict("active recurring definition fqn already exists")
		}
		if errors.Is(err, services.ErrInvalidReference) || errors.Is(err, services.ErrNotFound) {
			return invalidReferenceError()
		}
		if err != nil {
			return err
		}
		withDueDate := withNextDueDate(created)
		withDisplay, err := s.withDisplayAmounts(ctx, withDueDate)
		if err != nil {
			return err
		}
		definition = withDisplay
		return nil
	}); err != nil {
		return Definition{}, err
	}

	return definition, nil
}

// Get returns an active recurring definition with nested active records by ID.
func (s *Service) Get(ctx context.Context, id int64) (Definition, error) {
	if id <= 0 {
		return Definition{}, services.InvalidRequest("recurring_definition_id must be positive")
	}

	var result Definition
	if err := s.state.WithSharedLease(ctx, func(ctx context.Context) error {
		definition, err := s.repo.Get(ctx, id)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		withDueDate := withNextDueDate(definition)
		withDisplay, err := s.withDisplayAmounts(ctx, withDueDate)
		if err != nil {
			return err
		}
		result = withDisplay
		return nil
	}); err != nil {
		return Definition{}, err
	}

	return result, nil
}

// List returns active recurring definitions with nested active record shapes.
func (s *Service) List(ctx context.Context, opts DefinitionListOptions) (services.PaginatedList[Definition], error) {
	if err := validateListOptions(opts.List); err != nil {
		return services.PaginatedList[Definition]{}, err
	}

	requestedList := opts.List
	repoOpts := opts.List
	if opts.Query != "" || opts.List.SortKey == services.SortKeyNextDueDate {
		repoOpts = repoOpts.Unpaged()
	}
	if opts.List.SortKey == services.SortKeyNextDueDate {
		repoOpts.SortKey = services.SortKeyFQN
		repoOpts.SortDirection = services.SortDirectionAsc
	}
	var result services.PaginatedList[Definition]
	if err := s.state.WithSharedLease(ctx, func(ctx context.Context) error {
		list, err := s.repo.List(ctx, repoOpts)
		if err != nil {
			return err
		}
		if opts.Query != "" {
			list.Items = filterDefinitionsByQuery(list.Items, opts.Query)
		}
		withListNextDueDates(list.Items)
		if opts.List.SortKey == services.SortKeyNextDueDate {
			sortDefinitionsByNextDueDate(list.Items, opts.List.SortDirection)
		}
		if opts.Query != "" || opts.List.SortKey == services.SortKeyNextDueDate {
			list = services.Page(list.Items, requestedList)
		}
		if err := s.withListDisplayAmounts(ctx, list.Items); err != nil {
			return err
		}
		result = list
		return nil
	}); err != nil {
		return services.PaginatedList[Definition]{}, err
	}

	return result, nil
}

func filterDefinitionsByQuery(items []Definition, query string) []Definition {
	matchedGroups := map[string]bool{}
	for _, item := range items {
		for index, value := range item.FQN {
			if value != ':' {
				continue
			}
			group := item.FQN[:index]
			if fuzzyrank.Matches(query, fuzzyrank.EntityTerms(services.FQNLeaf(group), group)) {
				matchedGroups[group] = true
			}
		}
	}
	matched := make([]Definition, 0, len(items))
	for _, item := range items {
		if fuzzyrank.Matches(query, fuzzyrank.EntityTerms(item.Name, item.FQN)) || definitionHasMatchedAncestor(item.FQN, matchedGroups) {
			matched = append(matched, item)
		}
	}
	return matched
}

func definitionHasMatchedAncestor(fqn string, groups map[string]bool) bool {
	for index, value := range fqn {
		if value == ':' && groups[fqn[:index]] {
			return true
		}
	}
	return false
}

// WithProjectedTransactions supplies optional read-only future rows under one recurring-state snapshot.
func (s *Service) WithProjectedTransactions(ctx context.Context, through *values.CivilDate, opts transactions.ListOptions, use func(context.Context, []transactions.Transaction) error) error {
	return lease.Combine(ctx, []lease.Func{s.refs.WithSharedLease, s.state.WithSharedLease}, func(ctx context.Context) error {
		today := values.LocalCivilDateFromTime(s.clock.Now())
		projected := []transactions.Transaction{}
		var err error
		if through != nil && through.Time().After(today.Time()) {
			projected, err = s.projectTransactionsWithReferences(ctx, *through, today, opts)
		}
		if err != nil {
			return err
		}
		return use(ctx, projected)
	})
}

func (s *Service) projectTransactionsWithReferences(ctx context.Context, through values.CivilDate, today values.CivilDate, opts transactions.ListOptions) ([]transactions.Transaction, error) {
	if !through.Time().After(today.Time()) {
		return []transactions.Transaction{}, nil
	}
	definitions, err := s.repo.ListMaterializationDefinitions(ctx)
	if err != nil {
		return nil, err
	}
	projected := []transactions.Transaction{}
	projectionCount := 0
	for _, definition := range definitions {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		refs, err := s.projectionReferences(ctx, definition)
		if err != nil {
			return nil, err
		}
		nextProjectionFound := false
		err = visitDueSlotsUntil(ctx, definition.ScheduleRule, definition.AnchorDate, through, func(slot values.CivilDate) error {
			isNext := !nextProjectionFound
			nextProjectionFound = true
			if !slot.Time().After(today.Time()) {
				return nil
			}
			projectionCount++
			if projectionCount > maxFutureProjections {
				return services.InvalidRequest("future recurring projection exceeds the 10000-projection request limit")
			}
			transaction, err := projectedTransaction(definition, slot, refs, isNext)
			if err != nil {
				return err
			}
			if projectedTransactionMatches(transaction, opts, refs) {
				projected = append(projected, transaction)
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	return projected, nil
}

type transactionProjectionReferences struct {
	accounts   map[int64]accounts.Reference
	categories map[int64]categories.Reference
	tags       map[int64]tags.Reference
	members    map[int64]members.Reference
}

func (s *Service) projectionReferences(ctx context.Context, definition Definition) (transactionProjectionReferences, error) {
	accountRefs, err := s.validateDefinitionAccountReferences(ctx, definition)
	if err != nil {
		return transactionProjectionReferences{}, err
	}
	categoryIDs := []int64{}
	tagIDs := []int64{}
	memberIDs := []int64{}
	for _, record := range definition.Records {
		if record.CategoryID != nil {
			categoryIDs = append(categoryIDs, *record.CategoryID)
		}
		if record.MemberID != nil {
			memberIDs = append(memberIDs, *record.MemberID)
		}
		tagIDs = append(tagIDs, record.TagIDs...)
	}
	categoryRefs, err := s.categories.ValidateActiveReferences(ctx, categoryIDs, categories.ReferenceOptions{AllowHidden: true})
	if err != nil {
		return transactionProjectionReferences{}, err
	}
	tagRefs, err := s.tags.ValidateActiveReferences(ctx, tagIDs, tags.ReferenceOptions{AllowHidden: true})
	if err != nil {
		return transactionProjectionReferences{}, err
	}
	memberRefs, err := s.members.ValidateActiveReferences(ctx, memberIDs, members.ReferenceOptions{AllowHidden: true})
	if err != nil {
		return transactionProjectionReferences{}, err
	}
	return transactionProjectionReferences{
		accounts:   accountRefs,
		categories: categoryRefs,
		tags:       tagRefs,
		members:    memberRefs,
	}, nil
}

func projectedTransaction(definition Definition, slot values.CivilDate, refs transactionProjectionReferences, isNext bool) (transactions.Transaction, error) {
	id := recurringProjectionID("transaction", definition.ID, slot, 0)
	recurringDefinitionID := definition.ID
	records := make([]transactions.JournalRecord, 0, len(definition.Records))
	for index, definitionRecord := range definition.Records {
		accountRef := refs.accounts[definitionRecord.AccountID]
		var economicIntent categories.CategoryEconomicIntent
		if definitionRecord.CategoryID != nil {
			economicIntent = refs.categories[*definitionRecord.CategoryID].EconomicIntent
		}
		records = append(records, transactions.JournalRecord{
			ID:                          recurringProjectionID("record", definition.ID, slot, index),
			TransactionID:               id,
			InitiatedDate:               slot,
			AccountID:                   definitionRecord.AccountID,
			AccountDisplayLabelOverride: accountRef.DisplayLabelOverride,
			AccountFQN:                  accountRef.FQN,
			AccountType:                 accountRef.AccountType,
			MemberID:                    definitionRecord.MemberID,
			Currency:                    definitionRecord.Currency,
			Amount:                      definitionRecord.Amount,
			CategoryID:                  definitionRecord.CategoryID,
			EconomicIntent:              economicIntent,
			TagIDs:                      slices.Clone(definitionRecord.TagIDs),
			Memo:                        definitionRecord.Memo,
			ReconciliationStatus:        transactions.ReconciliationStatusReconciled,
			Source:                      transactions.SourceRecurringTemplate,
			CreatedAt:                   slot.Time(),
			UpdatedAt:                   slot.Time(),
		})
	}
	return transactions.ClassifyTransaction(transactions.Transaction{
		ID:                        id,
		InitiatedDate:             slot,
		RecurringDefinitionID:     &recurringDefinitionID,
		RecurringDefinitionFQN:    &definition.FQN,
		RecurringDefinitionActive: recurringBoolPtr(true),
		RecurringProjectionIsNext: &isNext,
		LifecycleStatus:           transactions.LifecycleStatusExpected,
		CreatedAt:                 slot.Time(),
		UpdatedAt:                 slot.Time(),
		Records:                   records,
	})
}

func recurringBoolPtr(value bool) *bool { return &value }

func recurringProjectionID(kind string, definitionID int64, slot values.CivilDate, index int) int64 {
	hash := fnv.New64a()
	_, _ = fmt.Fprintf(hash, "%s:%d:%s:%d", kind, definitionID, slot.String(), index)
	id := int64(hash.Sum64() & uint64(^uint64(0)>>1))
	if id == 0 {
		id = 1
	}
	return -id
}

func projectedTransactionMatches(transaction transactions.Transaction, opts transactions.ListOptions, refs transactionProjectionReferences) bool {
	if opts.Filter == nil {
		return false
	}
	if !transactions.FilterMatchesTransaction(transaction, opts.Filter, func(field transactions.FilterField, id int64) string {
		switch field {
		case transactions.FilterFieldCategory:
			return refs.categories[id].FQN
		default:
			return refs.tags[id].FQN
		}
	}) {
		return false
	}
	if len(opts.TransactionClasses) > 0 && !slices.Contains(opts.TransactionClasses, transaction.Class) {
		return false
	}
	return opts.Search == nil || projectedSearchMatches(transaction.Records, strings.ToLower(*opts.Search), refs)
}

func projectedSearchMatches(records []transactions.JournalRecord, term string, refs transactionProjectionReferences) bool {
	return slices.ContainsFunc(records, func(record transactions.JournalRecord) bool {
		accountRef := refs.accounts[record.AccountID]
		if strings.EqualFold(record.Currency, term) || strings.Contains(strings.ToLower(accountRef.FQN), term) || accountRef.ExternalID != nil && strings.Contains(strings.ToLower(*accountRef.ExternalID), term) || record.Memo != nil && strings.Contains(strings.ToLower(*record.Memo), term) {
			return true
		}
		if record.CategoryID != nil && strings.Contains(strings.ToLower(refs.categories[*record.CategoryID].FQN), term) {
			return true
		}
		if record.MemberID != nil && strings.Contains(strings.ToLower(refs.members[*record.MemberID].Name), term) {
			return true
		}
		return slices.ContainsFunc(record.TagIDs, func(id int64) bool { return strings.Contains(strings.ToLower(refs.tags[id].FQN), term) })
	})
}

// ConfirmExpected activates an expected recurring transaction on its actual date.
func (s *Service) ConfirmExpected(ctx context.Context, id int64, input ConfirmExpectedInput) (transactions.Transaction, error) {
	if id <= 0 {
		return transactions.Transaction{}, services.InvalidRequest("transaction_id must be positive")
	}
	clockNow := s.clock.Now()
	now := clockNow.UTC()
	today := values.LocalCivilDateFromTime(clockNow)
	if input.ActualDate != nil && input.ActualDate.Time().After(today.Time()) {
		return transactions.Transaction{}, services.InvalidRequest("actual_date must not be after the current date")
	}
	pendingDate, postedDate, err := transactions.NormalizeSettlementIntent("settlement", input.Settlement, now)
	if err != nil {
		return transactions.Transaction{}, err
	}
	var confirmed transactions.Transaction
	if err := s.state.WithExclusiveLease(ctx, func(ctx context.Context) error {
		confirmation, err := s.repo.GetExpectedConfirmation(ctx, id)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("expected transaction not found")
		}
		if errors.Is(err, services.ErrConflict) {
			return services.InvalidRequest("transaction must be an expected recurring transaction")
		}
		if err != nil {
			return err
		}
		actualDate := confirmation.ScheduledDate
		if input.ActualDate != nil {
			actualDate = *input.ActualDate
		}
		if input.ActualDate != nil &&
			!actualDate.Time().Equal(confirmation.ScheduledDate.Time()) &&
			input.Settlement.Status == transactions.SettlementStatusPosted &&
			input.Settlement.PostedDate == nil {
			actualPostedDate := transactions.SettlementTimestampFromInitiatedDate(actualDate)
			if pendingDate != nil && actualPostedDate.Before(*pendingDate) {
				actualPostedDate = *pendingDate
			}
			postedDate = &actualPostedDate
		}
		var valuations []ExpectedRecordValuation
		if input.ActualDate != nil {
			valuations = make([]ExpectedRecordValuation, 0, len(confirmation.Records))
			for _, record := range confirmation.Records {
				amountUSD, err := s.amountUSD.SignedAmountUSD(ctx, record.Currency, record.Amount, actualDate)
				if err != nil {
					return err
				}
				valuations = append(valuations, ExpectedRecordValuation{ID: record.ID, AmountUSD: amountUSD})
			}
		}
		confirmed, err = s.repo.ConfirmExpectedTransaction(ctx, id, actualDate, valuations, pendingDate, postedDate, now)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("expected transaction not found")
		}
		if errors.Is(err, services.ErrConflict) {
			return services.InvalidRequest("transaction must be an expected recurring transaction")
		}
		return err
	}); err != nil {
		return transactions.Transaction{}, err
	}
	s.notifyCurrencyUsageChanged()

	return transactions.ClassifyTransaction(confirmed)
}

// DismissExpected tombstones an expected recurring transaction.
func (s *Service) DismissExpected(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("transaction_id must be positive")
	}
	if err := s.state.WithExclusiveLease(ctx, func(ctx context.Context) error {
		err := s.repo.DismissExpectedTransaction(ctx, id, s.clock.Now().UTC())
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("expected transaction not found")
		}
		if errors.Is(err, services.ErrConflict) {
			return services.InvalidRequest("transaction must be an expected recurring transaction")
		}
		return err
	}); err != nil {
		return err
	}

	return nil
}

// ConfirmNext materializes the current virtual slot as active and advances the anchor.
func (s *Service) ConfirmNext(ctx context.Context, definitionID int64, today values.CivilDate, settlement transactions.SettlementIntent) (transactions.Transaction, error) {
	if definitionID <= 0 {
		return transactions.Transaction{}, services.InvalidRequest("recurring_definition_id must be positive")
	}
	var transaction transactions.Transaction
	if err := lease.Combine(ctx, []lease.Func{
		s.refs.WithSharedLease,
		s.state.WithExclusiveLease,
	}, func(ctx context.Context) error {
		definition, err := s.repo.Get(ctx, definitionID)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		if definition.PausedAt != nil {
			return services.InvalidRequest("recurring definition is paused")
		}
		nextAnchor, err := nextScheduleSlot(definition.ScheduleRule, definition.AnchorDate)
		if err != nil {
			return err
		}
		now := s.clock.Now().UTC()
		records, err := s.confirmedJournalRecords(ctx, definition, today, settlement, now)
		if err != nil {
			return err
		}
		created, err := s.repo.CreateConfirmedTransaction(ctx, definition, today, nextAnchor, records)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		transaction = created
		return nil
	}); err != nil {
		return transactions.Transaction{}, err
	}
	s.notifyCurrencyUsageChanged()

	return transactions.ClassifyTransaction(transaction)
}

// Defer consumes the current virtual slot and advances the definition anchor.
func (s *Service) Defer(ctx context.Context, definitionID int64, today values.CivilDate, input DeferInput) (Definition, error) {
	if definitionID <= 0 {
		return Definition{}, services.InvalidRequest("recurring_definition_id must be positive")
	}
	var result Definition
	if err := lease.Combine(ctx, []lease.Func{
		s.refs.WithExclusiveLease,
		s.state.WithExclusiveLease,
	}, func(ctx context.Context) error {
		definition, err := s.repo.Get(ctx, definitionID)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		if definition.PausedAt != nil {
			return services.InvalidRequest("recurring definition is paused")
		}
		scheduledDate := definition.AnchorDate
		newAnchor, err := deferredAnchor(definition, scheduledDate, input)
		if err != nil {
			return err
		}
		display, err := s.withDisplayAmounts(ctx, definition)
		if err != nil {
			return err
		}
		deferred, err := s.repo.ShiftAnchor(ctx, definition, newAnchor)
		if errors.Is(err, services.ErrConflict) {
			return services.Conflict("recurring definition anchor changed concurrently")
		}
		if err != nil {
			return err
		}
		deferred.Class = display.Class
		deferred.DisplayAmounts = display.DisplayAmounts
		result = withNextDueDate(deferred)
		return nil
	}); err != nil {
		return Definition{}, err
	}

	return result, nil
}

// Pause marks a definition paused so materialization skips it.
func (s *Service) Pause(ctx context.Context, definitionID int64) (Definition, error) {
	if definitionID <= 0 {
		return Definition{}, services.InvalidRequest("recurring_definition_id must be positive")
	}
	var definition Definition
	if err := lease.Combine(ctx, []lease.Func{s.refs.WithExclusiveLease, s.state.WithExclusiveLease}, func(ctx context.Context) error {
		paused, err := s.repo.PauseDefinition(ctx, definitionID)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		withDueDate := withNextDueDate(paused)
		withDisplay, err := s.withDisplayAmounts(ctx, withDueDate)
		if err != nil {
			return err
		}
		definition = withDisplay
		return nil
	}); err != nil {
		return Definition{}, err
	}

	return definition, nil
}

// Resume clears pause state and prevents backlog across the paused window.
func (s *Service) Resume(ctx context.Context, definitionID int64, today values.CivilDate) (Definition, error) {
	if definitionID <= 0 {
		return Definition{}, services.InvalidRequest("recurring_definition_id must be positive")
	}
	var resumed Definition
	if err := lease.Combine(ctx, []lease.Func{
		s.refs.WithExclusiveLease,
		s.state.WithExclusiveLease,
	}, func(ctx context.Context) error {
		definition, err := s.repo.Get(ctx, definitionID)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		resumed = definition
		if definition.PausedAt != nil {
			var newAnchor values.CivilDate
			if definition.ScheduleClass == ScheduleClassInterval {
				newAnchor = today
			} else {
				newAnchor, err = firstScheduleSlot(definition.ScheduleRule, today)
				if err != nil {
					return err
				}
			}
			updated, err := s.repo.ResumeDefinition(ctx, definition, newAnchor)
			if errors.Is(err, services.ErrNotFound) {
				return services.NotFound("recurring definition not found")
			}
			if err != nil {
				return err
			}
			resumed = updated
		}
		withDueDate := withNextDueDate(resumed)
		withDisplay, err := s.withDisplayAmounts(ctx, withDueDate)
		if err != nil {
			return err
		}
		resumed = withDisplay
		return nil
	}); err != nil {
		return Definition{}, err
	}
	return resumed, nil
}

// Replace validates and atomically updates a recurring definition's schedule and active records.
func (s *Service) Replace(ctx context.Context, id int64, input ReplaceInput) (Definition, error) {
	if id <= 0 {
		return Definition{}, services.InvalidRequest("recurring_definition_id must be positive")
	}
	expectedUpdatedAt, err := services.UpdatedAtFromETag(input.ExpectedETag, "recurring definition")
	if err != nil {
		return Definition{}, err
	}

	var definition Definition
	if err := lease.Combine(ctx, []lease.Func{s.refs.WithExclusiveLease, s.state.WithExclusiveLease}, func(ctx context.Context) error {
		current, err := s.repo.Get(ctx, id)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		if services.ETag(current.UpdatedAt) != input.ExpectedETag {
			return services.PreconditionFailed("recurring definition changed since it was read")
		}
		anchorDate := current.AnchorDate
		if input.AnchorDate != nil {
			anchorDate = *input.AnchorDate
		}
		if !anchorDate.Time().Equal(current.AnchorDate.Time()) {
			today := values.LocalCivilDateFromTime(s.clock.Now())
			if anchorDate.Time().Before(today.Time()) {
				return services.InvalidRequest("anchor_date must be on or after the current date when changed")
			}
		}
		save, err := s.prepareInput(ctx, input.WriteInput, anchorDate)
		if err != nil {
			return err
		}
		save.ExpectedUpdatedAt = &expectedUpdatedAt
		if save.FQN != current.FQN {
			if err := s.ensureFQNAvailable(ctx, id, save.FQN); err != nil {
				return err
			}
		}

		replaced, err := s.repo.Replace(ctx, id, save)
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidReferenceError()
		}
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if errors.Is(err, services.ErrPreconditionFailed) {
			return services.PreconditionFailed("recurring definition changed since it was read")
		}
		if err != nil {
			return err
		}
		withDueDate := withNextDueDate(replaced)
		withDisplay, err := s.withDisplayAmounts(ctx, withDueDate)
		if err != nil {
			return err
		}
		definition = withDisplay
		return nil
	}); err != nil {
		return Definition{}, err
	}

	return definition, nil
}

// Cancel tombstones a recurring definition. Generated history is untouched.
func (s *Service) Cancel(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("recurring_definition_id must be positive")
	}

	if err := lease.Combine(ctx, []lease.Func{s.refs.WithExclusiveLease, s.state.WithExclusiveLease}, func(ctx context.Context) error {
		if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		} else if err != nil {
			return err
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}

// CatchUp materializes every due slot through today and advances affected anchors.
func (s *Service) CatchUp(ctx context.Context, today values.CivilDate) error {
	return lease.Combine(ctx, []lease.Func{
		s.refs.WithSharedLease,
		s.state.WithExclusiveLease,
	}, func(ctx context.Context) error {
		definitions, err := s.repo.ListMaterializationDefinitions(ctx)
		if err != nil {
			return err
		}
		catchUps := []CatchUpInput{}
		for _, definition := range definitions {
			slots, err := DueSlotsUntil(ctx, definition.ScheduleRule, definition.AnchorDate, today)
			if err != nil {
				return err
			}
			if len(slots) == 0 {
				continue
			}
			accountRefs, err := s.validateDefinitionAccountReferences(ctx, definition)
			if err != nil {
				return err
			}
			generated := make([]ExpectedTransactionInput, 0, len(slots))
			for _, slot := range slots {
				records, err := s.generatedJournalRecordsFromValidatedDefinition(ctx, definition, slot, accountRefs, nil, nil)
				if err != nil {
					return err
				}
				generated = append(generated, ExpectedTransactionInput{
					ScheduledDate: slot,
					Records:       records,
				})
			}
			lastSlot := slots[len(slots)-1]
			nextAnchor, err := nextScheduleSlot(definition.ScheduleRule, lastSlot)
			if err != nil {
				return err
			}
			catchUps = append(catchUps, CatchUpInput{Definition: definition, Transactions: generated, NextAnchor: nextAnchor})
		}
		if len(catchUps) == 0 {
			return nil
		}

		if err := s.repo.MaterializeExpectedTransactions(ctx, catchUps); err != nil {
			return err
		}
		s.notifyCurrencyUsageChanged()

		return nil
	})
}

func (s *Service) notifyCurrencyUsageChanged() {
	if s.currencyUsageChanged != nil {
		s.currencyUsageChanged()
	}
}

func (s *Service) confirmedJournalRecords(ctx context.Context, definition Definition, initiatedDate values.CivilDate, intent transactions.SettlementIntent, now time.Time) ([]transactions.PersistJournalRecordInput, error) {
	accountRefs, err := s.validateDefinitionAccountReferences(ctx, definition)
	if err != nil {
		return nil, err
	}
	pendingDate, postedDate, err := transactions.NormalizeSettlementIntent("settlement", intent, now)
	if err != nil {
		return nil, err
	}
	return s.generatedJournalRecordsFromValidatedDefinition(ctx, definition, initiatedDate, accountRefs, pendingDate, postedDate)
}

func (s *Service) generatedJournalRecordsFromValidatedDefinition(ctx context.Context, definition Definition, scheduledDate values.CivilDate, accountRefs map[int64]accounts.Reference, pendingDate *time.Time, postedDate *time.Time) ([]transactions.PersistJournalRecordInput, error) {
	records := make([]transactions.PersistJournalRecordInput, 0, len(definition.Records))
	for _, record := range definition.Records {
		amountUSD, err := s.amountUSD.SignedAmountUSD(ctx, record.Currency, record.Amount, scheduledDate)
		if err != nil {
			return nil, err
		}
		var recordPendingDate *time.Time
		var recordPostedDate *time.Time
		accountType := accountRefs[record.AccountID].AccountType
		if accountType == accounts.AccountTypeOwned || accountType == accounts.AccountTypeParty {
			recordPendingDate = pendingDate
			recordPostedDate = postedDate
		}
		records = append(records, transactions.PersistJournalRecordInput{
			AccountID:            record.AccountID,
			MemberID:             record.MemberID,
			Currency:             record.Currency,
			Amount:               record.Amount,
			AmountUSD:            amountUSD,
			CategoryID:           record.CategoryID,
			TagIDs:               slices.Clone(record.TagIDs),
			Memo:                 record.Memo,
			PendingDate:          recordPendingDate,
			PostedDate:           recordPostedDate,
			ReconciliationStatus: transactions.ReconciliationStatusReconciled,
			Source:               transactions.SourceRecurringTemplate,
		})
	}

	return records, nil
}

func (s *Service) withDisplayAmounts(ctx context.Context, definition Definition) (Definition, error) {
	definitions := []Definition{definition}
	if err := s.withListDisplayAmounts(ctx, definitions); err != nil {
		return Definition{}, err
	}

	return definitions[0], nil
}

func (s *Service) withListDisplayAmounts(ctx context.Context, definitions []Definition) error {
	for index := range definitions {
		class, amounts, err := s.definitionDisplayAmounts(ctx, definitions[index])
		if err != nil {
			return err
		}
		definitions[index].Class = class
		definitions[index].DisplayAmounts = amounts
	}

	return nil
}

func (s *Service) definitionDisplayAmounts(ctx context.Context, definition Definition) (transactions.TransactionClass, []transactions.DisplayAmount, error) {
	accountRefs, err := s.resolveDefinitionAccountReferences(ctx, definition)
	if err != nil {
		return "", nil, err
	}

	return s.definitionDisplayAmountsWithAccountRefs(ctx, definition, accountRefs)
}

func (s *Service) definitionDisplayAmountsWithAccountRefs(
	ctx context.Context,
	definition Definition,
	accountRefs map[int64]accounts.Reference,
) (transactions.TransactionClass, []transactions.DisplayAmount, error) {
	categoryIDs := make([]int64, 0, len(definition.Records))
	for _, record := range definition.Records {
		if record.CategoryID != nil {
			categoryIDs = append(categoryIDs, *record.CategoryID)
		}
	}
	categoryRefs, err := s.categories.ValidateActiveReferences(ctx, categoryIDs, categories.ReferenceOptions{AllowHidden: true})
	if errors.Is(err, services.ErrInvalidReference) {
		return "", nil, invalidReferenceError()
	}
	if err != nil {
		return "", nil, err
	}

	records := make([]transactions.SemanticRecord, 0, len(definition.Records))
	for _, record := range definition.Records {
		var economicIntent categories.CategoryEconomicIntent
		if record.CategoryID != nil {
			economicIntent = categoryRefs[*record.CategoryID].EconomicIntent
		}
		records = append(records, transactions.SemanticRecord{
			Currency:       record.Currency,
			Amount:         record.Amount,
			AccountFQN:     accountRefs[record.AccountID].FQN,
			AccountType:    accountRefs[record.AccountID].AccountType,
			CategoryID:     record.CategoryID,
			EconomicIntent: economicIntent,
		})
	}

	return transactions.LineDisplayAmountsForSemanticRecords(records)
}

func (s *Service) resolveDefinitionAccountReferences(
	ctx context.Context,
	definition Definition,
) (map[int64]accounts.Reference, error) {
	accountIDs := make([]int64, 0, len(definition.Records))
	for _, record := range definition.Records {
		accountIDs = append(accountIDs, record.AccountID)
	}
	accountRefs, err := s.accounts.ValidateActiveReferences(
		ctx,
		accountIDs,
		accounts.ReferenceOptions{AllowHidden: true},
	)
	if errors.Is(err, services.ErrInvalidReference) {
		return nil, invalidReferenceError()
	}
	if err != nil {
		return nil, err
	}

	return accountRefs, nil
}

func (s *Service) validateDefinitionAccountReferences(
	ctx context.Context,
	definition Definition,
) (map[int64]accounts.Reference, error) {
	recordReferences := make([]accounts.RecordReference, 0, len(definition.Records))
	for _, record := range definition.Records {
		recordReferences = append(recordReferences, accounts.RecordReference{
			AccountID: record.AccountID,
			Currency:  record.Currency,
		})
	}
	accountRefs, err := s.accounts.ValidateActiveRecordReferences(
		ctx,
		recordReferences,
		accounts.ReferenceOptions{AllowHidden: true},
	)
	if errors.Is(err, services.ErrInvalidReference) {
		return nil, invalidReferenceError()
	}
	if err != nil {
		return nil, err
	}

	return accountRefs, nil
}

func (s *Service) prepareCreateInput(ctx context.Context, input CreateInput) (SaveInput, error) {
	if input.TemplateID != nil && *input.TemplateID <= 0 {
		return SaveInput{}, services.InvalidRequest("template_id must be positive")
	}
	return s.prepareInput(ctx, input.WriteInput, input.AnchorDate)
}

func (s *Service) prepareInput(ctx context.Context, input WriteInput, anchorDate values.CivilDate) (SaveInput, error) {
	if err := services.ValidateFQN(input.FQN); err != nil {
		return SaveInput{}, err
	}
	rule, err := validateScheduleRule(input.ScheduleRule)
	if err != nil {
		return SaveInput{}, err
	}
	anchor, err := firstScheduleSlot(rule, anchorDate)
	if err != nil {
		return SaveInput{}, err
	}
	records, err := s.completeRecordInputs(ctx, input)
	if err != nil {
		return SaveInput{}, err
	}
	save := SaveInput{
		FQN:          input.FQN,
		ScheduleRule: rule,
		AnchorDate:   anchor,
		Records:      records,
	}
	if err := validateCompleteRecords(save.Records); err != nil {
		return SaveInput{}, err
	}
	if err := s.validateMemberAndTagReferences(ctx, save.Records); err != nil {
		return SaveInput{}, err
	}
	definitionRecords := make([]DefinitionRecord, 0, len(save.Records))
	for _, record := range save.Records {
		definitionRecords = append(definitionRecords, DefinitionRecord{
			AccountID:  record.AccountID,
			MemberID:   record.MemberID,
			Currency:   record.Currency,
			Amount:     record.Amount,
			CategoryID: record.CategoryID,
			TagIDs:     record.TagIDs,
			Memo:       record.Memo,
		})
	}
	definition := Definition{Records: definitionRecords}
	accountRefs, err := s.validateDefinitionAccountReferences(ctx, definition)
	if err != nil {
		return SaveInput{}, err
	}
	if _, _, err := s.definitionDisplayAmountsWithAccountRefs(ctx, definition, accountRefs); err != nil {
		return SaveInput{}, err
	}

	return save, nil
}

func (s *Service) completeRecordInputs(ctx context.Context, input WriteInput) ([]DefinitionRecordInput, error) {
	records := input.Records
	if input.TemplateID != nil {
		template, err := s.templates.Get(ctx, *input.TemplateID)
		if errors.Is(err, services.ErrNotFound) {
			return nil, services.InvalidRequest("template_id references missing or inactive transaction template")
		}
		if err != nil {
			return nil, err
		}
		records = mergeTemplateRecordDefaults(template.Records, input.Records)
	}

	complete := make([]DefinitionRecordInput, 0, len(records))
	for index, record := range records {
		if record.AccountID == nil {
			return nil, services.InvalidRequest(indexedField(index, "account_id") + " is required")
		}
		if record.Currency == nil {
			return nil, services.InvalidRequest(indexedField(index, "currency") + " is required")
		}
		if record.Amount == nil {
			return nil, services.InvalidRequest(indexedField(index, "amount") + " is required")
		}
		tagIDs := []int64{}
		if record.TagIDs.Specified {
			tagIDs = slices.Clone(record.TagIDs.Values)
		}
		complete = append(complete, DefinitionRecordInput{
			AccountID:  *record.AccountID,
			MemberID:   record.MemberID.Value,
			Currency:   *record.Currency,
			Amount:     *record.Amount,
			CategoryID: record.CategoryID.Value,
			TagIDs:     tagIDs,
			Memo:       record.Memo.Value,
		})
	}

	return complete, nil
}

func mergeTemplateRecordDefaults(templateRecords []transactiontemplates.TemplateRecord, requestRecords []RecordInput) []RecordInput {
	merged := make([]RecordInput, 0, max(len(templateRecords), len(requestRecords)))
	for _, record := range templateRecords {
		merged = append(merged, recordInputFromTemplate(record))
	}
	for index, requestRecord := range requestRecords {
		if index >= len(merged) {
			merged = append(merged, requestRecord)
			continue
		}
		merged[index] = mergeRecordInput(merged[index], requestRecord)
	}

	return merged
}

func recordInputFromTemplate(record transactiontemplates.TemplateRecord) RecordInput {
	return RecordInput{
		AccountID:  record.AccountID,
		MemberID:   OptionalInt64{Specified: true, Value: record.MemberID},
		Currency:   record.Currency,
		Amount:     record.Amount,
		CategoryID: OptionalInt64{Specified: true, Value: record.CategoryID},
		TagIDs: OptionalInt64Slice{
			Specified: true,
			Values:    slices.Clone(record.TagIDs),
		},
		Memo: OptionalString{Specified: true, Value: record.Memo},
	}
}

func mergeRecordInput(base RecordInput, override RecordInput) RecordInput {
	if override.AccountID != nil {
		base.AccountID = override.AccountID
	}
	if override.MemberID.Specified {
		base.MemberID = override.MemberID
	}
	if override.Currency != nil {
		base.Currency = override.Currency
	}
	if override.Amount != nil {
		base.Amount = override.Amount
	}
	if override.CategoryID.Specified {
		base.CategoryID = override.CategoryID
	}
	if override.TagIDs.Specified {
		base.TagIDs = override.TagIDs
	}
	if override.Memo.Specified {
		base.Memo = override.Memo
	}

	return base
}

func validateCompleteRecords(records []DefinitionRecordInput) error {
	if len(records) < 2 {
		return services.InvalidRequest("records must contain at least two records")
	}
	balances := map[string]values.Decimal{}
	for index, record := range records {
		if record.AccountID <= 0 {
			return services.InvalidRequest(indexedField(index, "account_id") + " must be positive")
		}
		if record.MemberID != nil && *record.MemberID <= 0 {
			return services.InvalidRequest(indexedField(index, "member_id") + " must be positive")
		}
		if !values.ValidCurrencyCode(record.Currency) {
			return services.InvalidRequest(indexedField(index, "currency") + " must be an ISO 4217 code or crypto code prefixed with C::")
		}
		if record.Amount.IsZero() {
			return services.InvalidRequest(indexedField(index, "amount") + " must be non-zero")
		}
		if record.CategoryID != nil && *record.CategoryID <= 0 {
			return services.InvalidRequest(indexedField(index, "category_id") + " must be positive")
		}
		if err := validateTagIDs(index, record.TagIDs); err != nil {
			return err
		}
		if record.Memo != nil && strings.TrimSpace(*record.Memo) != *record.Memo {
			return services.InvalidRequest(indexedField(index, "memo") + " must not have leading or trailing whitespace")
		}
		current, ok := balances[record.Currency]
		if !ok {
			balances[record.Currency] = record.Amount
			continue
		}
		sum, err := current.Add(record.Amount)
		if err != nil {
			return services.InvalidRequest("records must balance to zero per currency")
		}
		balances[record.Currency] = sum
	}
	for currency, balance := range balances {
		if !balance.IsZero() {
			return services.InvalidRequest("records must balance to zero per currency; " + currency + " is unbalanced")
		}
	}

	return nil
}

func (s *Service) validateMemberAndTagReferences(ctx context.Context, records []DefinitionRecordInput) error {
	memberIDs := []int64{}
	tagIDs := []int64{}
	for _, record := range records {
		if record.MemberID != nil {
			memberIDs = append(memberIDs, *record.MemberID)
		}
		tagIDs = append(tagIDs, record.TagIDs...)
	}

	if _, err := s.members.ValidateActiveReferences(ctx, memberIDs, members.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidReferenceError()
		}
		return err
	}
	if _, err := s.tags.ValidateActiveReferences(ctx, tagIDs, tags.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidReferenceError()
		}
		return err
	}

	return nil
}

func validateScheduleRule(raw json.RawMessage) (json.RawMessage, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, services.InvalidRequest("schedule_rule is required")
	}
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return nil, services.InvalidRequest("schedule_rule must be a JSON object")
	}
	if len(payload) == 0 {
		return nil, services.InvalidRequest("schedule_rule must be a JSON object")
	}
	versionNumber, ok := payload["version"].(json.Number)
	if !ok {
		return nil, services.InvalidRequest("schedule_rule.version is required")
	}
	version, err := versionNumber.Int64()
	if err != nil || version != 1 {
		return nil, services.InvalidRequest("schedule_rule.version must be 1")
	}
	kind, ok := payload["kind"].(string)
	if !ok || kind == "" {
		return nil, services.InvalidRequest("schedule_rule.kind is required")
	}

	switch kind {
	case "interval":
		if err := validateIntervalRule(payload); err != nil {
			return nil, err
		}
		return normalizeJSON(payload), nil
	case "day_of_month":
		if err := validateDayOfMonthRule(payload); err != nil {
			return nil, err
		}
		return normalizeJSON(payload), nil
	case "last_day_of_month":
		return normalizeJSON(payload), nil
	default:
		return nil, services.InvalidRequest("schedule_rule.kind must be interval, day_of_month, or last_day_of_month")
	}
}

func validateIntervalRule(payload map[string]any) error {
	everyNumber, ok := payload["every"].(json.Number)
	if !ok {
		return services.InvalidRequest("schedule_rule.every is required for interval schedules")
	}
	every, err := everyNumber.Int64()
	if err != nil || every < 1 {
		return services.InvalidRequest("schedule_rule.every must be greater than or equal to 1")
	}
	unit, ok := payload["unit"].(string)
	if !ok {
		return services.InvalidRequest("schedule_rule.unit is required for interval schedules")
	}
	switch unit {
	case "DAY", "WEEK", "MONTH", "YEAR":
		return nil
	default:
		return services.InvalidRequest("schedule_rule.unit must be DAY, WEEK, MONTH, or YEAR")
	}
}

func validateDayOfMonthRule(payload map[string]any) error {
	dayNumber, ok := payload["day"].(json.Number)
	if !ok {
		return services.InvalidRequest("schedule_rule.day is required for day_of_month schedules")
	}
	day, err := dayNumber.Int64()
	if err != nil || day < 1 || day > 31 {
		return services.InvalidRequest("schedule_rule.day must be between 1 and 31")
	}

	return nil
}

func normalizeJSON(payload map[string]any) json.RawMessage {
	encoded, err := json.Marshal(payload)
	if err != nil {
		panic(fmt.Sprintf("validated schedule payload failed to marshal: %v", err))
	}

	return encoded
}

func (s *Service) ensureFQNAvailable(ctx context.Context, currentID int64, fqn string) error {
	refs, err := s.repo.ListActiveFQNs(ctx)
	if err != nil {
		return err
	}
	for _, ref := range refs {
		if ref.ID == currentID || !services.FQNPathConflict(fqn, ref.FQN) {
			continue
		}
		if fqn == ref.FQN {
			return services.Conflict("active recurring definition fqn already exists")
		}
		return services.Conflict("active recurring definition fqn conflicts with existing recurring definition hierarchy")
	}

	return nil
}

func withNextDueDate(definition Definition) Definition {
	if definition.PausedAt != nil || definition.TombstonedAt != nil {
		definition.NextDueDate = nil
		return definition
	}
	next := definition.AnchorDate
	definition.NextDueDate = &next

	return definition
}

func withListNextDueDates(definitions []Definition) {
	for index := range definitions {
		definitions[index] = withNextDueDate(definitions[index])
	}
}

func sortDefinitionsByNextDueDate(definitions []Definition, direction services.SortDirection) {
	slices.SortFunc(definitions, func(left Definition, right Definition) int {
		if left.NextDueDate == nil {
			if right.NextDueDate != nil {
				return 1
			}
		} else if right.NextDueDate == nil {
			return -1
		} else if dateOrder := left.NextDueDate.Time().Compare(right.NextDueDate.Time()); dateOrder != 0 {
			if direction == services.SortDirectionDesc {
				return -dateOrder
			}
			return dateOrder
		}
		if fqnOrder := strings.Compare(left.FQN, right.FQN); fqnOrder != 0 {
			return fqnOrder
		}
		switch {
		case left.ID < right.ID:
			return -1
		case left.ID > right.ID:
			return 1
		default:
			return 0
		}
	})
}

// DueSlotsUntil returns every schedule slot between anchor and today inclusive.
func DueSlotsUntil(ctx context.Context, raw json.RawMessage, anchor values.CivilDate, today values.CivilDate) ([]values.CivilDate, error) {
	slots := []values.CivilDate{}
	err := visitDueSlotsUntil(ctx, raw, anchor, today, func(slot values.CivilDate) error {
		slots = append(slots, slot)
		return nil
	})
	return slots, err
}

func visitDueSlotsUntil(ctx context.Context, raw json.RawMessage, anchor values.CivilDate, today values.CivilDate, visit func(values.CivilDate) error) error {
	next, err := firstScheduleSlot(raw, anchor)
	if err != nil {
		return err
	}
	for !next.Time().After(today.Time()) {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := visit(next); err != nil {
			return err
		}
		next, err = nextScheduleSlot(raw, next)
		if err != nil {
			return err
		}
	}
	return nil
}

func deferOffset(input DeferInput, raw json.RawMessage) (int, string, error) {
	defaultEvery, defaultUnit, err := intervalRuleOffset(raw)
	if err != nil {
		return 0, "", err
	}
	every := defaultEvery
	unit := defaultUnit
	if input.Every != nil {
		if *input.Every < 1 {
			return 0, "", services.InvalidRequest("every must be greater than or equal to 1")
		}
		every = int(*input.Every)
	}
	if input.Unit != nil {
		switch *input.Unit {
		case "DAY", "WEEK", "MONTH", "YEAR":
			unit = *input.Unit
		default:
			return 0, "", services.InvalidRequest("unit must be DAY, WEEK, MONTH, or YEAR")
		}
	}

	return every, unit, nil
}

func deferredAnchor(definition Definition, scheduledDate values.CivilDate, input DeferInput) (values.CivilDate, error) {
	if definition.ScheduleClass == ScheduleClassInterval {
		every, unit, err := deferOffset(input, definition.ScheduleRule)
		if err != nil {
			return values.CivilDate{}, err
		}
		return IntervalDueDate(scheduledDate, every, unit), nil
	}
	if input.Unit != nil {
		return values.CivilDate{}, services.InvalidRequest("unit must be omitted for date-rule recurring definitions")
	}
	periods := int64(1)
	if input.Every != nil {
		if *input.Every < 1 {
			return values.CivilDate{}, services.InvalidRequest("every must be greater than or equal to 1")
		}
		periods = *input.Every
	}
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(definition.ScheduleRule))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return values.CivilDate{}, err
	}
	scheduledTime := scheduledDate.Time()
	maxPeriods := int64((9999-scheduledTime.Year())*12 + int(time.December-scheduledTime.Month()))
	if periods > maxPeriods {
		return values.CivilDate{}, services.InvalidRequest("every moves the anchor outside the supported date range")
	}
	targetMonth := firstOfMonth(scheduledTime).AddDate(0, int(periods), 0)
	switch kind, _ := payload["kind"].(string); kind {
	case "day_of_month":
		dayNumber, _ := payload["day"].(json.Number)
		day, err := strconv.Atoi(dayNumber.String())
		if err != nil {
			return values.CivilDate{}, err
		}
		return values.CivilDateFromTime(dateWithClampedDay(targetMonth.Year(), targetMonth.Month(), day)), nil
	case "last_day_of_month":
		return values.CivilDateFromTime(lastDayOfMonth(targetMonth.Year(), targetMonth.Month())), nil
	default:
		return values.CivilDate{}, fmt.Errorf("unknown date-rule schedule kind %q", kind)
	}
}

func intervalRuleOffset(raw json.RawMessage) (int, string, error) {
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return 0, "", err
	}
	everyNumber, _ := payload["every"].(json.Number)
	every, err := strconv.Atoi(everyNumber.String())
	if err != nil {
		return 0, "", err
	}
	unit, _ := payload["unit"].(string)

	return every, unit, nil
}

func firstScheduleSlot(raw json.RawMessage, anchor values.CivilDate) (values.CivilDate, error) {
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return values.CivilDate{}, err
	}
	kind, _ := payload["kind"].(string)
	switch kind {
	case "interval":
		return anchor, nil
	case "day_of_month":
		dayNumber, _ := payload["day"].(json.Number)
		day, _ := strconv.Atoi(dayNumber.String())
		return firstDayOfMonthDue(anchor, day), nil
	case "last_day_of_month":
		return firstLastDayOfMonthDue(anchor), nil
	default:
		return values.CivilDate{}, fmt.Errorf("unknown schedule kind %q", kind)
	}
}

func nextScheduleSlot(raw json.RawMessage, current values.CivilDate) (values.CivilDate, error) {
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return values.CivilDate{}, err
	}
	kind, _ := payload["kind"].(string)
	var next values.CivilDate
	var err error
	switch kind {
	case "interval":
		everyNumber, _ := payload["every"].(json.Number)
		every, parseErr := strconv.Atoi(everyNumber.String())
		if parseErr != nil {
			return values.CivilDate{}, parseErr
		}
		unit, _ := payload["unit"].(string)
		next = IntervalDueDate(current, every, unit)
	case "day_of_month":
		dayNumber, _ := payload["day"].(json.Number)
		day, _ := strconv.Atoi(dayNumber.String())
		nextMonth := firstOfMonth(current.Time()).AddDate(0, 1, 0)
		next = values.CivilDateFromTime(dateWithClampedDay(nextMonth.Year(), nextMonth.Month(), day))
	case "last_day_of_month":
		nextMonth := firstOfMonth(current.Time()).AddDate(0, 1, 0)
		next = values.CivilDateFromTime(lastDayOfMonth(nextMonth.Year(), nextMonth.Month()))
	default:
		return values.CivilDate{}, fmt.Errorf("unknown schedule kind %q", kind)
	}
	if err != nil {
		return values.CivilDate{}, err
	}
	if year := next.Time().Year(); year < 1 || year > 9999 {
		return values.CivilDate{}, services.InvalidRequest("schedule moves the anchor outside the supported date range")
	}
	return next, nil
}

// IntervalDueDate returns the date count intervals before or after anchor.
func IntervalDueDate(anchor values.CivilDate, count int, unit string) values.CivilDate {
	t := anchor.Time()
	switch unit {
	case "DAY":
		return values.CivilDateFromTime(t.AddDate(0, 0, count))
	case "WEEK":
		return values.CivilDateFromTime(t.AddDate(0, 0, count*7))
	case "MONTH":
		return values.CivilDateFromTime(addMonthsClamped(t, count))
	case "YEAR":
		return values.CivilDateFromTime(addMonthsClamped(t, count*12))
	default:
		return anchor
	}
}

func addMonthsClamped(t time.Time, months int) time.Time {
	year := t.Year()
	monthIndex := int(t.Month()) - 1 + months
	year += monthIndex / 12
	monthIndex %= 12
	if monthIndex < 0 {
		monthIndex += 12
		year--
	}
	return dateWithClampedDay(year, time.Month(monthIndex+1), t.Day())
}

func firstDayOfMonthDue(anchor values.CivilDate, day int) values.CivilDate {
	t := anchor.Time()
	candidate := dateWithClampedDay(t.Year(), t.Month(), day)
	if candidate.Before(t) {
		next := t.AddDate(0, 1, 0)
		candidate = dateWithClampedDay(next.Year(), next.Month(), day)
	}

	return values.CivilDateFromTime(candidate)
}

func firstLastDayOfMonthDue(anchor values.CivilDate) values.CivilDate {
	t := anchor.Time()
	candidate := lastDayOfMonth(t.Year(), t.Month())
	if candidate.Before(t) {
		next := t.AddDate(0, 1, 0)
		candidate = lastDayOfMonth(next.Year(), next.Month())
	}

	return values.CivilDateFromTime(candidate)
}

func firstOfMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func dateWithClampedDay(year int, month time.Month, day int) time.Time {
	lastDay := lastDayOfMonth(year, month).Day()
	if day > lastDay {
		day = lastDay
	}

	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func lastDayOfMonth(year int, month time.Month) time.Time {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC)
}

func validateTagIDs(index int, tagIDs []int64) error {
	seen := map[int64]struct{}{}
	for _, tagID := range tagIDs {
		if tagID <= 0 {
			return services.InvalidRequest(indexedField(index, "tag_ids") + " values must be positive")
		}
		if _, ok := seen[tagID]; ok {
			return services.InvalidRequest(indexedField(index, "tag_ids") + " values must be unique")
		}
		seen[tagID] = struct{}{}
	}

	return nil
}

func validateListOptions(opts services.ListOptions) error {
	switch opts.SortKey {
	case "", services.SortKeyFQN, services.SortKeyNextDueDate, services.SortKeyCreatedAt, services.SortKeyUpdatedAt:
	default:
		return services.InvalidRequest("sort must be fqn, next_due_date, created_at, or updated_at")
	}
	switch opts.SortDirection {
	case "", services.SortDirectionAsc, services.SortDirectionDesc:
	default:
		return services.InvalidRequest("sort_dir must be asc or desc")
	}
	if opts.Limit != nil && *opts.Limit <= 0 {
		return services.InvalidRequest("limit must be positive")
	}
	if opts.Offset < 0 {
		return services.InvalidRequest("offset must be non-negative")
	}

	return nil
}

func indexedField(index int, name string) string {
	return "records[" + strconv.Itoa(index) + "]." + name
}

func invalidReferenceError() error {
	return services.InvalidRequest("recurring definition references missing or inactive resource")
}
