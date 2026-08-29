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
	ID                 int64
	FQN                string
	ScheduleRule       json.RawMessage
	ScheduleClass      ScheduleClass
	AnchorDate         values.CivilDate
	DefinitionVersion  int64
	PausedAt           *time.Time
	LastOccurrenceDate *values.CivilDate
	ParentFQN          *string
	Name               string
	Level              int
	NextDueDate        *values.CivilDate
	Class              transactions.TransactionClass
	DisplayAmounts     []transactions.DisplayAmount
	CreatedAt          time.Time
	UpdatedAt          time.Time
	TombstonedAt       *time.Time
	Records            []DefinitionRecord
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

// WriteInput contains fields for creating or replacing a recurring definition.
type WriteInput struct {
	FQN          string
	ScheduleRule json.RawMessage
	AnchorDate   values.CivilDate
	TemplateID   *int64
	Records      []RecordInput
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

// ConfirmOccurrenceInput contains the actual transaction date and settlement intent for occurrence review.
type ConfirmOccurrenceInput struct {
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
	FQN          string
	ScheduleRule json.RawMessage
	AnchorDate   values.CivilDate
	Records      []DefinitionRecordInput
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

// OccurrenceStatus is a recurring occurrence lifecycle state.
type OccurrenceStatus string

const (
	// OccurrenceStatusExpected identifies a materialized occurrence awaiting review.
	OccurrenceStatusExpected OccurrenceStatus = "expected"
	// OccurrenceStatusConfirmed identifies a reviewed and posted occurrence.
	OccurrenceStatusConfirmed OccurrenceStatus = "confirmed"
	// OccurrenceStatusDismissed identifies a reviewed and discarded occurrence.
	OccurrenceStatusDismissed OccurrenceStatus = "dismissed"
	// OccurrenceStatusDeferred identifies a skipped audit occurrence slot.
	OccurrenceStatusDeferred OccurrenceStatus = "deferred"
)

// Occurrence is one scheduled slot for a recurring definition.
type Occurrence struct {
	ID                            int64
	RecurringDefinitionID         int64
	RecurringDefinitionFQN        string
	RecurringDefinitionActive     bool
	ScheduledDate                 values.CivilDate
	Status                        OccurrenceStatus
	MaterializedDefinitionVersion int64
	MaterializedAt                time.Time
	ReviewedAt                    *time.Time
	GeneratedTransactionID        *int64
	CreatedAt                     time.Time
	UpdatedAt                     time.Time
}

// OccurrenceConfirmationRecord contains the persisted amount inputs needed to revalue a materialized occurrence.
type OccurrenceConfirmationRecord struct {
	ID       int64
	Currency string
	Amount   values.Decimal
}

// OccurrenceConfirmation contains an occurrence and its generated transaction's active records.
type OccurrenceConfirmation struct {
	Occurrence Occurrence
	Records    []OccurrenceConfirmationRecord
}

// OccurrenceRecordValuation carries one actual-date USD valuation into atomic confirmation.
type OccurrenceRecordValuation struct {
	ID        int64
	AmountUSD *values.Decimal
}

// MaterializationDefinition is an active definition plus existing occurrence slots.
type MaterializationDefinition struct {
	Definition
	OccurrenceDates []values.CivilDate
}

// ExpectedOccurrenceInput contains one catch-up occurrence and generated record shape.
type ExpectedOccurrenceInput struct {
	Definition    Definition
	ScheduledDate values.CivilDate
	Records       []transactions.PersistJournalRecordInput
}

// OccurrenceListOptions controls occurrence filtering and pagination.
type OccurrenceListOptions struct {
	services.ListOptions
	Today                 values.CivilDate
	RecurringDefinitionID *int64
	Statuses              []OccurrenceStatus
}

// Repository persists recurring definition state.
type Repository interface {
	Create(context.Context, SaveInput) (Definition, error)
	Get(context.Context, int64) (Definition, error)
	List(context.Context, services.ListOptions) (services.PaginatedList[Definition], error)
	ListActiveFQNs(context.Context) ([]ActiveFQN, error)
	Replace(context.Context, int64, SaveInput) (Definition, error)
	Tombstone(context.Context, int64) error
	ListMaterializationDefinitions(context.Context, values.CivilDate) ([]MaterializationDefinition, error)
	CreateExpectedOccurrences(context.Context, []ExpectedOccurrenceInput) error
	CreateConfirmedOccurrence(context.Context, Definition, values.CivilDate, values.CivilDate, []transactions.PersistJournalRecordInput, time.Time) (Occurrence, error)
	GetOccurrence(context.Context, int64) (Occurrence, error)
	ListOccurrences(context.Context, OccurrenceListOptions) (services.PaginatedList[Occurrence], error)
	ListOccurrenceDates(context.Context, int64, values.CivilDate) ([]values.CivilDate, error)
	ListOccurrenceDatesByDefinitionIDs(context.Context, []int64, values.CivilDate) (map[int64][]values.CivilDate, error)
	GetOccurrenceConfirmation(context.Context, int64) (OccurrenceConfirmation, error)
	ConfirmOccurrence(context.Context, int64, values.CivilDate, []OccurrenceRecordValuation, *time.Time, *time.Time, time.Time) (Occurrence, error)
	DismissOccurrence(context.Context, int64, time.Time) (Occurrence, error)
	DeferOccurrenceAndShiftAnchor(context.Context, Definition, values.CivilDate, values.CivilDate) (Occurrence, error)
	PauseDefinition(context.Context, int64) (Definition, error)
	ResumeDefinition(context.Context, Definition, values.CivilDate, []values.CivilDate) (Definition, error)
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

// OccurrenceWriter serializes recurring occurrence slot and lifecycle writes.
type OccurrenceWriter interface {
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
	occurrences          OccurrenceWriter
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
	occurrences OccurrenceWriter,
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
		occurrences:          occurrences,
		clock:                clock,
		currencyUsageChanged: currencyUsageChanged,
	}
}

// Create validates and creates a recurring definition.
func (s *Service) Create(ctx context.Context, input WriteInput) (Definition, error) {
	var definition Definition
	if err := s.refs.WithExclusiveLease(ctx, func(ctx context.Context) error {
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
		withDueDate, err := s.withNextDueDate(ctx, created)
		if err != nil {
			return err
		}
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
	if err := s.occurrences.WithSharedLease(ctx, func(ctx context.Context) error {
		definition, err := s.repo.Get(ctx, id)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		withDueDate, err := s.withNextDueDate(ctx, definition)
		if err != nil {
			return err
		}
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
func (s *Service) List(ctx context.Context, opts services.ListOptions) (services.PaginatedList[Definition], error) {
	if err := validateListOptions(opts); err != nil {
		return services.PaginatedList[Definition]{}, err
	}

	repoOpts := opts
	if opts.SortKey == services.SortKeyNextDueDate {
		repoOpts.SortKey = services.SortKeyFQN
		repoOpts.SortDirection = services.SortDirectionAsc
		repoOpts.Limit = nil
		repoOpts.Offset = 0
	}
	var result services.PaginatedList[Definition]
	if err := s.occurrences.WithSharedLease(ctx, func(ctx context.Context) error {
		list, err := s.repo.List(ctx, repoOpts)
		if err != nil {
			return err
		}
		if err := s.withListNextDueDates(ctx, list.Items); err != nil {
			return err
		}
		if opts.SortKey == services.SortKeyNextDueDate {
			sortDefinitionsByNextDueDate(list.Items, opts.SortDirection)
			list.Items = paginateDefinitions(list.Items, opts.Limit, opts.Offset)
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

// GetOccurrence returns one permanent recurring occurrence by ID.
func (s *Service) GetOccurrence(ctx context.Context, id int64) (Occurrence, error) {
	if id <= 0 {
		return Occurrence{}, services.InvalidRequest("recurring_occurrence_id must be positive")
	}

	occurrence, err := s.repo.GetOccurrence(ctx, id)
	if errors.Is(err, services.ErrNotFound) {
		return Occurrence{}, services.NotFound("recurring occurrence not found")
	}
	if err != nil {
		return Occurrence{}, err
	}

	return occurrence, nil
}

// ListOccurrences materializes due slots through today, then returns matching occurrences.
func (s *Service) ListOccurrences(ctx context.Context, opts OccurrenceListOptions) (services.PaginatedList[Occurrence], error) {
	if err := validateOccurrenceListOptions(opts); err != nil {
		return services.PaginatedList[Occurrence]{}, err
	}
	if err := s.materializeDueOccurrences(ctx, opts.Today); err != nil {
		return services.PaginatedList[Occurrence]{}, err
	}

	return s.repo.ListOccurrences(ctx, opts)
}

// WithProjectedTransactions supplies read-only future recurring rows while preventing occurrence changes during use.
func (s *Service) WithProjectedTransactions(ctx context.Context, through values.CivilDate, opts transactions.ListOptions, use func(context.Context, []transactions.Transaction) error) error {
	return lease.Combine(ctx, []lease.Func{s.refs.WithSharedLease, s.occurrences.WithExclusiveLease}, func(ctx context.Context) error {
		projected, err := s.projectTransactionsWithReferences(ctx, through, opts)
		if err != nil {
			return err
		}
		return use(ctx, projected)
	})
}

func (s *Service) projectTransactionsWithReferences(ctx context.Context, through values.CivilDate, opts transactions.ListOptions) ([]transactions.Transaction, error) {
	today := values.LocalCivilDateFromTime(s.clock.Now())
	if !through.Time().After(today.Time()) {
		return []transactions.Transaction{}, nil
	}
	definitions, err := s.repo.ListMaterializationDefinitions(ctx, through)
	if err != nil {
		return nil, err
	}
	projected := []transactions.Transaction{}
	projectionCount := 0
	for _, materialization := range definitions {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		definition := materialization.Definition
		refs, err := s.projectionReferences(ctx, definition)
		if err != nil {
			return nil, err
		}
		existing := civilDateSet(materialization.OccurrenceDates)
		nextProjectionFound := false
		err = visitDueSlotsUntil(ctx, definition.ScheduleRule, definition.AnchorDate, through, func(slot values.CivilDate) error {
			if !slot.Time().After(today.Time()) {
				return nil
			}
			if _, ok := existing[slot.String()]; ok {
				return nil
			}
			projectionCount++
			if projectionCount > maxFutureProjections {
				return services.InvalidRequest("future recurring projection exceeds the 10000-projection request limit")
			}
			isNext := !nextProjectionFound
			nextProjectionFound = true
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
			ReconciliationStatus:        transactions.ReconciliationStatusUnreconciled,
			Source:                      transactions.SourceRecurringTemplate,
			CreatedAt:                   slot.Time(),
			UpdatedAt:                   slot.Time(),
		})
	}
	return transactions.ClassifyTransaction(transactions.Transaction{
		ID:                              id,
		InitiatedDate:                   slot,
		RecurringProjectionDefinitionID: &recurringDefinitionID,
		RecurringProjectionIsNext:       &isNext,
		LifecycleStatus:                 transactions.LifecycleStatusExpected,
		CreatedAt:                       slot.Time(),
		UpdatedAt:                       slot.Time(),
		Records:                         records,
	})
}

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

// ConfirmOccurrence posts an EXPECTED occurrence's generated transaction records on its actual date.
func (s *Service) ConfirmOccurrence(ctx context.Context, id int64, input ConfirmOccurrenceInput) (Occurrence, error) {
	if id <= 0 {
		return Occurrence{}, services.InvalidRequest("recurring_occurrence_id must be positive")
	}
	clockNow := s.clock.Now()
	now := clockNow.UTC()
	today := values.LocalCivilDateFromTime(clockNow)
	if input.ActualDate != nil && input.ActualDate.Time().After(today.Time()) {
		return Occurrence{}, services.InvalidRequest("actual_date must not be after the current date")
	}
	pendingDate, postedDate, err := transactions.NormalizeSettlementIntent("settlement", input.Settlement, now)
	if err != nil {
		return Occurrence{}, err
	}
	var occurrence Occurrence
	if err := s.occurrences.WithExclusiveLease(ctx, func(ctx context.Context) error {
		confirmation, err := s.repo.GetOccurrenceConfirmation(ctx, id)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring occurrence not found")
		}
		if err != nil {
			return err
		}
		if confirmation.Occurrence.Status != OccurrenceStatusExpected {
			return services.InvalidRequest("recurring occurrence must be expected")
		}
		actualDate := confirmation.Occurrence.ScheduledDate
		if input.ActualDate != nil {
			actualDate = *input.ActualDate
		}
		if input.ActualDate != nil &&
			!actualDate.Time().Equal(confirmation.Occurrence.ScheduledDate.Time()) &&
			input.Settlement.Status == transactions.SettlementStatusPosted &&
			input.Settlement.PostedDate == nil {
			actualPostedDate := transactions.SettlementTimestampFromInitiatedDate(actualDate)
			if pendingDate != nil && actualPostedDate.Before(*pendingDate) {
				actualPostedDate = *pendingDate
			}
			postedDate = &actualPostedDate
		}
		var valuations []OccurrenceRecordValuation
		if input.ActualDate != nil {
			valuations = make([]OccurrenceRecordValuation, 0, len(confirmation.Records))
			for _, record := range confirmation.Records {
				amountUSD, err := s.amountUSD.SignedAmountUSD(ctx, record.Currency, record.Amount, actualDate)
				if err != nil {
					return err
				}
				valuations = append(valuations, OccurrenceRecordValuation{ID: record.ID, AmountUSD: amountUSD})
			}
		}
		confirmed, err := s.repo.ConfirmOccurrence(ctx, id, actualDate, valuations, pendingDate, postedDate, now)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring occurrence not found")
		}
		if errors.Is(err, services.ErrConflict) {
			return services.InvalidRequest("recurring occurrence must be expected")
		}
		if err != nil {
			return err
		}
		occurrence = confirmed
		return nil
	}); err != nil {
		return Occurrence{}, err
	}
	s.notifyCurrencyUsageChanged()

	return occurrence, nil
}

// DismissOccurrence tombstones an EXPECTED occurrence's generated transaction.
func (s *Service) DismissOccurrence(ctx context.Context, id int64) (Occurrence, error) {
	if id <= 0 {
		return Occurrence{}, services.InvalidRequest("recurring_occurrence_id must be positive")
	}
	var occurrence Occurrence
	if err := s.occurrences.WithExclusiveLease(ctx, func(ctx context.Context) error {
		dismissed, err := s.repo.DismissOccurrence(ctx, id, s.clock.Now().UTC())
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring occurrence not found")
		}
		if errors.Is(err, services.ErrConflict) {
			return services.InvalidRequest("recurring occurrence must be expected")
		}
		if err != nil {
			return err
		}
		occurrence = dismissed
		return nil
	}); err != nil {
		return Occurrence{}, err
	}

	return occurrence, nil
}

// ConfirmNext materializes and confirms a definition's next non-materialized slot.
func (s *Service) ConfirmNext(ctx context.Context, definitionID int64, today values.CivilDate, settlement transactions.SettlementIntent) (Occurrence, error) {
	if definitionID <= 0 {
		return Occurrence{}, services.InvalidRequest("recurring_definition_id must be positive")
	}
	var occurrence Occurrence
	if err := lease.Combine(ctx, []lease.Func{
		s.refs.WithSharedLease,
		s.occurrences.WithExclusiveLease,
	}, func(ctx context.Context) error {
		if err := s.materializeDueOccurrencesSerialized(ctx, today); err != nil {
			return err
		}
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
		scheduledDate, err := s.nextDueDate(ctx, definition)
		if err != nil {
			return err
		}
		now := s.clock.Now().UTC()
		records, err := s.confirmedJournalRecords(ctx, definition, today, settlement, now)
		if err != nil {
			return err
		}
		created, err := s.repo.CreateConfirmedOccurrence(ctx, definition, scheduledDate, today, records, now)
		if errors.Is(err, services.ErrConflict) {
			return services.Conflict("recurring occurrence slot already exists")
		}
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		occurrence = created
		return nil
	}); err != nil {
		return Occurrence{}, err
	}
	s.notifyCurrencyUsageChanged()

	return occurrence, nil
}

// Defer materializes current due slots, then defers the next non-materialized slot.
func (s *Service) Defer(ctx context.Context, definitionID int64, today values.CivilDate, input DeferInput) (Occurrence, error) {
	if definitionID <= 0 {
		return Occurrence{}, services.InvalidRequest("recurring_definition_id must be positive")
	}
	var occurrence Occurrence
	if err := lease.Combine(ctx, []lease.Func{
		s.refs.WithExclusiveLease,
		s.occurrences.WithExclusiveLease,
	}, func(ctx context.Context) error {
		if err := s.materializeDueOccurrencesSerialized(ctx, today); err != nil {
			return err
		}
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
		scheduledDate, err := s.nextDueDate(ctx, definition)
		if err != nil {
			return err
		}
		newAnchor, err := deferredAnchor(definition, scheduledDate, input)
		if err != nil {
			return err
		}
		deferred, err := s.repo.DeferOccurrenceAndShiftAnchor(ctx, definition, scheduledDate, newAnchor)
		if errors.Is(err, services.ErrConflict) {
			return services.Conflict("recurring occurrence slot already exists")
		}
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		occurrence = deferred
		return nil
	}); err != nil {
		return Occurrence{}, err
	}

	return occurrence, nil
}

// Pause marks a definition paused so materialization skips it.
func (s *Service) Pause(ctx context.Context, definitionID int64) (Definition, error) {
	if definitionID <= 0 {
		return Definition{}, services.InvalidRequest("recurring_definition_id must be positive")
	}
	var definition Definition
	if err := s.refs.WithExclusiveLease(ctx, func(ctx context.Context) error {
		paused, err := s.repo.PauseDefinition(ctx, definitionID)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		withDueDate, err := s.withNextDueDate(ctx, paused)
		if err != nil {
			return err
		}
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
		s.occurrences.WithExclusiveLease,
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
			newAnchor := definition.AnchorDate
			skippedSlots := []values.CivilDate{}
			if definition.ScheduleClass == ScheduleClassInterval {
				newAnchor = today
			} else {
				skipThrough := values.CivilDateFromTime(today.Time().AddDate(0, 0, -1))
				skippedSlots, err = s.skippedDateRuleSlots(ctx, definition, skipThrough)
				if err != nil {
					return err
				}
			}
			updated, err := s.repo.ResumeDefinition(ctx, definition, newAnchor, skippedSlots)
			if errors.Is(err, services.ErrNotFound) {
				return services.NotFound("recurring definition not found")
			}
			if err != nil {
				return err
			}
			resumed = updated
		}
		withDueDate, err := s.withNextDueDate(ctx, resumed)
		if err != nil {
			return err
		}
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
func (s *Service) Replace(ctx context.Context, id int64, input WriteInput) (Definition, error) {
	if id <= 0 {
		return Definition{}, services.InvalidRequest("recurring_definition_id must be positive")
	}

	var definition Definition
	if err := s.refs.WithExclusiveLease(ctx, func(ctx context.Context) error {
		current, err := s.repo.Get(ctx, id)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("recurring definition not found")
		}
		if err != nil {
			return err
		}
		if !input.AnchorDate.Time().Equal(current.AnchorDate.Time()) {
			today := values.LocalCivilDateFromTime(s.clock.Now())
			if input.AnchorDate.Time().Before(today.Time()) {
				return services.InvalidRequest("anchor_date must be on or after the current date when changed")
			}
		}
		save, err := s.prepareInput(ctx, input)
		if err != nil {
			return err
		}
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
		if err != nil {
			return err
		}
		withDueDate, err := s.withNextDueDate(ctx, replaced)
		if err != nil {
			return err
		}
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

	if err := s.refs.WithExclusiveLease(ctx, func(ctx context.Context) error {
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

func (s *Service) materializeDueOccurrences(ctx context.Context, today values.CivilDate) error {
	return lease.Combine(ctx, []lease.Func{
		s.refs.WithSharedLease,
		s.occurrences.WithExclusiveLease,
	}, func(ctx context.Context) error {
		return s.materializeDueOccurrencesSerialized(ctx, today)
	})
}

func (s *Service) materializeDueOccurrencesSerialized(ctx context.Context, today values.CivilDate) error {
	definitions, err := s.repo.ListMaterializationDefinitions(ctx, today)
	if err != nil {
		return err
	}
	occurrences := []ExpectedOccurrenceInput{}
	for _, definition := range definitions {
		existing := civilDateSet(definition.OccurrenceDates)
		slots, err := DueSlotsUntil(ctx, definition.ScheduleRule, definition.AnchorDate, today)
		if err != nil {
			return err
		}
		var accountRefs map[int64]accounts.Reference
		for _, slot := range slots {
			if _, ok := existing[slot.String()]; ok {
				continue
			}
			if accountRefs == nil {
				accountRefs, err = s.validateDefinitionAccountReferences(ctx, definition.Definition)
				if err != nil {
					return err
				}
			}
			records, err := s.generatedJournalRecordsFromValidatedDefinition(ctx, definition.Definition, slot, accountRefs, nil, nil)
			if err != nil {
				return err
			}
			occurrences = append(occurrences, ExpectedOccurrenceInput{
				Definition:    definition.Definition,
				ScheduledDate: slot,
				Records:       records,
			})
			existing[slot.String()] = struct{}{}
		}
	}
	if len(occurrences) == 0 {
		return nil
	}

	if err := s.repo.CreateExpectedOccurrences(ctx, occurrences); err != nil {
		return err
	}
	s.notifyCurrencyUsageChanged()

	return nil
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
			ReconciliationStatus: transactions.ReconciliationStatusUnreconciled,
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

func (s *Service) skippedDateRuleSlots(ctx context.Context, definition Definition, today values.CivilDate) ([]values.CivilDate, error) {
	dueSlots, err := DueSlotsUntil(ctx, definition.ScheduleRule, definition.AnchorDate, today)
	if err != nil {
		return nil, err
	}
	existingDates, err := s.repo.ListOccurrenceDates(ctx, definition.ID, today)
	if err != nil {
		return nil, err
	}
	existing := civilDateSet(existingDates)
	skipped := []values.CivilDate{}
	for _, slot := range dueSlots {
		if _, ok := existing[slot.String()]; !ok {
			skipped = append(skipped, slot)
		}
	}

	return skipped, nil
}

func (s *Service) prepareCreateInput(ctx context.Context, input WriteInput) (SaveInput, error) {
	if input.TemplateID != nil && *input.TemplateID <= 0 {
		return SaveInput{}, services.InvalidRequest("template_id must be positive")
	}
	return s.prepareInput(ctx, input)
}

func (s *Service) prepareInput(ctx context.Context, input WriteInput) (SaveInput, error) {
	if err := services.ValidateFQN(input.FQN); err != nil {
		return SaveInput{}, err
	}
	rule, err := validateScheduleRule(input.ScheduleRule)
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
		AnchorDate:   input.AnchorDate,
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

func (s *Service) withNextDueDate(ctx context.Context, definition Definition) (Definition, error) {
	if definition.PausedAt != nil || definition.TombstonedAt != nil {
		definition.NextDueDate = nil
		return definition, nil
	}
	next, err := s.nextDueDate(ctx, definition)
	if err != nil {
		return Definition{}, err
	}
	definition.NextDueDate = &next

	return definition, nil
}

func (s *Service) withListNextDueDates(ctx context.Context, definitions []Definition) error {
	definitionIDs := make([]int64, 0, len(definitions))
	var through values.CivilDate
	for _, definition := range definitions {
		if definition.PausedAt == nil && definition.TombstonedAt == nil && definition.LastOccurrenceDate != nil {
			definitionIDs = append(definitionIDs, definition.ID)
			if through.Time().IsZero() || definition.LastOccurrenceDate.Time().After(through.Time()) {
				through = *definition.LastOccurrenceDate
			}
		}
	}

	occurrenceDatesByDefinitionID, err := s.repo.ListOccurrenceDatesByDefinitionIDs(ctx, definitionIDs, through)
	if err != nil {
		return err
	}
	for index := range definitions {
		definition := definitions[index]
		if definition.PausedAt != nil || definition.TombstonedAt != nil {
			definitions[index].NextDueDate = nil
			continue
		}
		next, err := nextDueDateFromOccurrenceDates(definition, occurrenceDatesByDefinitionID[definition.ID])
		if err != nil {
			return err
		}
		definitions[index].NextDueDate = &next
	}

	return nil
}

func (s *Service) nextDueDate(ctx context.Context, definition Definition) (values.CivilDate, error) {
	first, err := firstScheduleSlot(definition.ScheduleRule, definition.AnchorDate)
	if err != nil {
		return values.CivilDate{}, err
	}
	if definition.LastOccurrenceDate == nil || definition.LastOccurrenceDate.Time().Before(first.Time()) {
		return first, nil
	}

	occurrenceDates, err := s.repo.ListOccurrenceDates(ctx, definition.ID, *definition.LastOccurrenceDate)
	if err != nil {
		return values.CivilDate{}, err
	}
	return nextDueDateFromOccurrenceDates(definition, occurrenceDates)
}

func nextDueDateFromOccurrenceDates(definition Definition, occurrenceDates []values.CivilDate) (values.CivilDate, error) {
	first, err := firstScheduleSlot(definition.ScheduleRule, definition.AnchorDate)
	if err != nil {
		return values.CivilDate{}, err
	}
	existing := civilDateSet(occurrenceDates)
	next := first
	for {
		if _, ok := existing[next.String()]; !ok {
			return next, nil
		}
		next, err = firstScheduleSlotAfter(definition.ScheduleRule, definition.AnchorDate, next)
		if err != nil {
			return values.CivilDate{}, err
		}
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

func paginateDefinitions(definitions []Definition, limit *int, offset int) []Definition {
	if offset >= len(definitions) {
		return definitions[:0]
	}
	end := len(definitions)
	if limit != nil && *limit < end-offset {
		end = offset + *limit
	}
	return definitions[offset:end]
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
		next, err = firstScheduleSlotAfter(raw, anchor, next)
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

func firstScheduleSlotAfter(raw json.RawMessage, anchor values.CivilDate, after values.CivilDate) (values.CivilDate, error) {
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return values.CivilDate{}, err
	}
	kind, _ := payload["kind"].(string)
	switch kind {
	case "interval":
		return firstIntervalDueAfter(payload, anchor, after)
	case "day_of_month":
		dayNumber, _ := payload["day"].(json.Number)
		day, _ := strconv.Atoi(dayNumber.String())
		return firstDayOfMonthDueAfter(anchor, after, day), nil
	case "last_day_of_month":
		return firstLastDayOfMonthDueAfter(anchor, after), nil
	default:
		return values.CivilDate{}, fmt.Errorf("unknown schedule kind %q", kind)
	}
}

func firstIntervalDueAfter(payload map[string]any, anchor values.CivilDate, after values.CivilDate) (values.CivilDate, error) {
	everyNumber, _ := payload["every"].(json.Number)
	every, err := strconv.Atoi(everyNumber.String())
	if err != nil {
		return values.CivilDate{}, err
	}
	unit, _ := payload["unit"].(string)
	if after.Time().Before(anchor.Time()) {
		return anchor, nil
	}
	step := intervalStepAtOrBefore(anchor, after, every, unit) + 1
	candidate := IntervalDueDate(anchor, step*every, unit)
	for !candidate.Time().After(after.Time()) {
		step++
		candidate = IntervalDueDate(anchor, step*every, unit)
	}
	return candidate, nil
}

func intervalStepAtOrBefore(anchor values.CivilDate, target values.CivilDate, every int, unit string) int {
	switch unit {
	case "DAY":
		return int(target.Time().Sub(anchor.Time()).Hours()/24) / every
	case "WEEK":
		return int(target.Time().Sub(anchor.Time()).Hours()/24) / (every * 7)
	case "MONTH", "YEAR":
		anchorYear, anchorMonth, _ := anchor.Time().Date()
		targetYear, targetMonth, _ := target.Time().Date()
		months := (targetYear-anchorYear)*12 + int(targetMonth-anchorMonth)
		cadenceMonths := every
		if unit == "YEAR" {
			cadenceMonths *= 12
		}
		step := months / cadenceMonths
		for step > 0 && IntervalDueDate(anchor, step*every, unit).Time().After(target.Time()) {
			step--
		}
		return step
	default:
		return 0
	}
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

func firstDayOfMonthDueAfter(anchor values.CivilDate, after values.CivilDate, day int) values.CivilDate {
	t := firstOfMonth(after.Time())
	for {
		candidate := dateWithClampedDay(t.Year(), t.Month(), day)
		if !candidate.Before(anchor.Time()) && candidate.After(after.Time()) {
			return values.CivilDateFromTime(candidate)
		}
		t = firstOfMonth(t.AddDate(0, 1, 0))
	}
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

func firstLastDayOfMonthDueAfter(anchor values.CivilDate, after values.CivilDate) values.CivilDate {
	t := firstOfMonth(after.Time())
	for {
		candidate := lastDayOfMonth(t.Year(), t.Month())
		if !candidate.Before(anchor.Time()) && candidate.After(after.Time()) {
			return values.CivilDateFromTime(candidate)
		}
		t = firstOfMonth(t.AddDate(0, 1, 0))
	}
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

func validateOccurrenceListOptions(opts OccurrenceListOptions) error {
	switch opts.SortKey {
	case "", services.SortKeyScheduledDate, services.SortKeyCreatedAt, services.SortKeyUpdatedAt:
	default:
		return services.InvalidRequest("sort must be scheduled_date, created_at, or updated_at")
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
	if opts.RecurringDefinitionID != nil && *opts.RecurringDefinitionID <= 0 {
		return services.InvalidRequest("recurring_definition_id must be positive")
	}
	for _, status := range opts.Statuses {
		if !validOccurrenceStatus(status) {
			return services.InvalidRequest("status values must be expected, confirmed, dismissed, or deferred")
		}
	}

	return nil
}

func validOccurrenceStatus(status OccurrenceStatus) bool {
	switch status {
	case OccurrenceStatusExpected, OccurrenceStatusConfirmed, OccurrenceStatusDismissed, OccurrenceStatusDeferred:
		return true
	default:
		return false
	}
}

func civilDateSet(dates []values.CivilDate) map[string]struct{} {
	set := make(map[string]struct{}, len(dates))
	for _, date := range dates {
		set[date.String()] = struct{}{}
	}

	return set
}

func indexedField(index int, name string) string {
	return "records[" + strconv.Itoa(index) + "]." + name
}

func invalidReferenceError() error {
	return services.InvalidRequest("recurring definition references missing or inactive resource")
}
