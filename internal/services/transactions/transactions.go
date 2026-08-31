package transactions

import (
	"context"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/values"
)

// LifecycleStatus is a transaction lifecycle state.
type LifecycleStatus string

const (
	// LifecycleStatusActive identifies ordinary accounting activity.
	LifecycleStatusActive LifecycleStatus = "active"
	// LifecycleStatusExpected identifies a pre-confirmation recurring transaction.
	LifecycleStatusExpected LifecycleStatus = "expected"
	// LifecycleStatusCancelled identifies preserved activity excluded from accounting.
	LifecycleStatusCancelled LifecycleStatus = "cancelled"
)

// SettlementStatus is the derived settlement of an owned or party record.
type SettlementStatus string

const (
	// SettlementStatusPending identifies a balance record without a posted date.
	SettlementStatusPending SettlementStatus = "pending"
	// SettlementStatusPosted identifies a balance record with a posted date.
	SettlementStatusPosted SettlementStatus = "posted"
)

// SettlementSummary is the derived settlement of a transaction's balance records.
type SettlementSummary string

const (
	SettlementSummaryPending       SettlementSummary = "pending"
	SettlementSummaryPosted        SettlementSummary = "posted"
	SettlementSummaryMixed         SettlementSummary = "mixed"
	SettlementSummaryNotApplicable SettlementSummary = "not_applicable"
)

// ReconciliationStatus is a journal record reconciliation state.
type ReconciliationStatus string

const (
	// ReconciliationStatusReconciled identifies a reconciled journal record.
	ReconciliationStatusReconciled ReconciliationStatus = "reconciled"
	// ReconciliationStatusUnreconciled identifies an unreconciled journal record.
	ReconciliationStatusUnreconciled ReconciliationStatus = "unreconciled"
)

// Source identifies how a journal record was created.
type Source string

const (
	// SourceManual identifies manually-entered records.
	SourceManual Source = "manual"
	// SourceImported identifies records loaded from an external system.
	SourceImported Source = "imported"
	// SourceRecurringTemplate identifies records generated from recurring definitions.
	SourceRecurringTemplate Source = "recurring_template"
)

var (
	// ErrImportedRecordRemoval identifies an atomic replacement that would remove imported identity.
	ErrImportedRecordRemoval = errors.New("imported journal record removal")
	// ErrLinkedRecordRemoval identifies an atomic replacement that would remove linked identity.
	ErrLinkedRecordRemoval = errors.New("linked journal record removal")
	// ErrExpectedRecurringMutation identifies a generic mutation of an expected recurring transaction.
	ErrExpectedRecurringMutation = errors.New("expected recurring transaction mutation")
	// ErrInactiveTransactionMutation identifies a journal-record mutation whose transaction is not active.
	ErrInactiveTransactionMutation = errors.New("inactive transaction mutation")
	// ErrTransactionNotPending identifies cancellation of a transaction that is not wholly pending.
	ErrTransactionNotPending = errors.New("transaction is not wholly pending")
)

// Transaction is a double-entry transaction with nested journal records.
type Transaction struct {
	ID                              int64
	InitiatedDate                   values.CivilDate
	RecurringOccurrenceID           *int64
	RecurringProjectionDefinitionID *int64
	RecurringProjectionIsNext       *bool
	LifecycleStatus                 LifecycleStatus
	Settlement                      SettlementSummary
	Class                           TransactionClass
	DisplayTitle                    string
	PrimaryAmounts                  []DisplayAmount
	Shapes                          []TransactionShape
	CreatedAt                       time.Time
	UpdatedAt                       time.Time
	TombstonedAt                    *time.Time
	Records                         []JournalRecord
}

// JournalRecord is one debit or credit entry inside a transaction.
type JournalRecord struct {
	ID                          int64
	TransactionID               int64
	TransactionDisplayTitle     *string
	TransactionAccountIDs       *[]int64
	InitiatedDate               values.CivilDate
	AccountID                   int64
	AccountDisplayLabel         string
	AccountDisplayLabelOverride *string
	AccountFQN                  string
	AccountType                 accounts.AccountType
	MemberID                    *int64
	Currency                    string
	Amount                      values.Decimal
	AmountUSD                   *values.Decimal
	RunningBalance              *values.Decimal
	CategoryID                  *int64
	EconomicIntent              categories.CategoryEconomicIntent
	Role                        RecordRole
	TagIDs                      []int64
	Memo                        *string
	PendingDate                 *time.Time
	PostedDate                  *time.Time
	LifecycleStatus             LifecycleStatus
	Settlement                  *SettlementStatus
	ReconciliationStatus        ReconciliationStatus
	Source                      Source
	ExternalID                  *string
	ExternalSystem              *string
	CreatedAt                   time.Time
	UpdatedAt                   time.Time
	TombstonedAt                *time.Time
}

// CreateInput contains fields for creating a transaction.
type CreateInput struct {
	InitiatedDate values.CivilDate
	Records       []JournalRecordInput
}

// UpdateInput contains one complete desired transaction aggregate plus its write precondition.
type UpdateInput struct {
	InitiatedDate values.CivilDate
	ExpectedETag  string
	Records       []UpdateJournalRecordInput
}

// UpdateJournalRecordInput is either a retained record with RecordID or a new record without it.
type UpdateJournalRecordInput struct {
	RecordID *int64
	JournalRecordInput
}

// JournalRecordInput is one record inside a transaction write request.
type JournalRecordInput struct {
	AccountID            int64
	MemberID             *int64
	Currency             string
	Amount               values.Decimal
	AmountUSD            *values.Decimal
	CategoryID           *int64
	TagIDs               []int64
	Memo                 *string
	Settlement           *SettlementIntent
	ReconciliationStatus ReconciliationStatus
	Source               Source
	ExternalID           *string
	ExternalSystem       *string
}

// SettlementIntent is an input-only pending or posted instruction with optional exact event times.
type SettlementIntent struct {
	Status      SettlementStatus
	PendingDate *time.Time
	PostedDate  *time.Time
}

// PersistInput is a fully normalized transaction write passed to persistence.
type PersistInput struct {
	InitiatedDate         values.CivilDate
	RecurringOccurrenceID *int64
	LifecycleStatus       LifecycleStatus
	ExpectedUpdatedAt     *time.Time
	Records               []PersistJournalRecordInput
}

// PersistJournalRecordInput contains explicit normalized journal-record values.
type PersistJournalRecordInput struct {
	RecordID             *int64
	AccountID            int64
	MemberID             *int64
	Currency             string
	Amount               values.Decimal
	AmountUSD            *values.Decimal
	CategoryID           *int64
	TagIDs               []int64
	Memo                 *string
	PendingDate          *time.Time
	PostedDate           *time.Time
	ReconciliationStatus ReconciliationStatus
	Source               Source
	ExternalID           *string
	ExternalSystem       *string
}

// ClassificationRecordInput contains only fields used to classify a draft record.
type ClassificationRecordInput struct {
	AccountID  int64
	Currency   string
	Amount     values.Decimal
	CategoryID *int64
}

// RecordSearchOptions controls journal record search filters.
type RecordSearchOptions struct {
	services.ListOptions
	AccountID             *int64
	AccountFQNPrefix      *string
	CategoryID            *int64
	MemberID              *int64
	TagID                 *int64
	LifecycleStatus       *LifecycleStatus
	Settlement            *SettlementStatus
	RecordRole            *RecordRole
	ReconciliationStatus  *ReconciliationStatus
	AmountMin             *values.Decimal
	AmountMax             *values.Decimal
	AmountUSDMin          *values.Decimal
	AmountUSDMax          *values.Decimal
	InitiatedDateFrom     *values.CivilDate
	InitiatedDateTo       *values.CivilDate
	PendingDateFrom       *time.Time
	PendingDateTo         *time.Time
	PostedDateFrom        *time.Time
	PostedDateTo          *time.Time
	MemoContains          *string
	IncludeRunningBalance bool
}

// ListOptions controls transaction list sort, pagination, and date anchoring.
type ListOptions struct {
	services.ListOptions
	AnchorDate *values.CivilDate
	// OffsetSpecified distinguishes an explicit absolute merged-sequence offset from an omitted landing offset.
	OffsetSpecified    bool
	FilterText         *string
	Filter             *ResolvedFilter
	TransactionClasses []TransactionClass
	Search             *string
}

// PagePosition contains a transaction page's effective offset and matching total without its rows.
type PagePosition struct {
	Offset     int
	TotalCount int64
}

// ListResult carries a transaction page plus transaction-list-specific metadata.
type ListResult struct {
	Items      []Transaction
	Offset     int
	TotalCount int64
}

// MonthTotalsRange identifies the civil-date range covered by a requested month.
type MonthTotalsRange struct {
	Month string
	Start values.CivilDate
	End   values.CivilDate
}

// MonthActivityTotals contains server-computed spend and income totals for a civil month.
type MonthActivityTotals struct {
	Month  string
	Spend  MonthActivityTotal
	Income MonthActivityTotal
}

// MonthActivityTotal is one USD-equivalent aggregate plus unresolved conversion count.
type MonthActivityTotal struct {
	AmountUSD        values.Decimal
	UnconvertedCount int64
}

// BulkRecordOperationResponse reports the selected and updated record counts.
type BulkRecordOperationResponse struct {
	RecordIDs    []int64
	UpdatedCount int
}

// BulkAccountReplaceResponse reports a completed account substitution across selected transactions.
type BulkAccountReplaceResponse struct {
	TransactionIDs          []int64
	SourceAccountID         int64
	ReplacementAccountID    int64
	UpdatedRecordCount      int
	UpdatedTransactionCount int
}

// BulkAccountReplaceTarget identifies one selected transaction revision for atomic account substitution.
type BulkAccountReplaceTarget struct {
	TransactionID int64
	UpdatedAt     time.Time
}

// TransactionClass is the derived user-facing transaction class.
type TransactionClass string

const (
	TransactionClassSpend            TransactionClass = "spend"
	TransactionClassIncome           TransactionClass = "income"
	TransactionClassRefund           TransactionClass = "refund"
	TransactionClassClawback         TransactionClass = "clawback"
	TransactionClassTransfer         TransactionClass = "transfer"
	TransactionClassCurrencyExchange TransactionClass = "currency_exchange"
	TransactionClassAdjustment       TransactionClass = "adjustment"
	TransactionClassMixed            TransactionClass = "mixed"
)

// RecordRole is the accounting role derived independently for one journal record.
type RecordRole string

const (
	RecordRoleExpense    RecordRole = "expense"
	RecordRoleRefund     RecordRole = "refund"
	RecordRoleIncome     RecordRole = "income"
	RecordRoleClawback   RecordRole = "clawback"
	RecordRoleExchange   RecordRole = "exchange"
	RecordRoleAdjustment RecordRole = "adjustment"
	RecordRoleBalance    RecordRole = "balance"
)

// TransactionShapeType identifies one independently present kind of transaction activity.
type TransactionShapeType string

const (
	TransactionShapeSpend      TransactionShapeType = "spend"
	TransactionShapeRefund     TransactionShapeType = "refund"
	TransactionShapeIncome     TransactionShapeType = "income"
	TransactionShapeClawback   TransactionShapeType = "clawback"
	TransactionShapeAdjustment TransactionShapeType = "adjustment"
	TransactionShapeExchange   TransactionShapeType = "exchange"
	TransactionShapeTransfer   TransactionShapeType = "transfer"
)

// DisplayAmount is a signed native display amount with its stored-value USD equivalent when complete.
type DisplayAmount struct {
	Currency  string
	Amount    values.Decimal
	AmountUSD *values.Decimal
}

// ExchangeEffectiveRate is the derived rate encoded by the sold and bought exchange legs.
type ExchangeEffectiveRate struct {
	SoldCurrency   string
	BoughtCurrency string
	Rate           values.Decimal
}

// TransactionShape summarizes one independently derived transaction activity.
type TransactionShape struct {
	Shape         TransactionShapeType
	Amounts       []DisplayAmount
	EffectiveRate *ExchangeEffectiveRate
}

// Classification is the derived semantic result for a set of records.
type Classification struct {
	Class          TransactionClass
	PrimaryAmounts []DisplayAmount
	Shapes         []TransactionShape
	Roles          []RecordRole
}

// SemanticRecord is the service-owned classification input for one journal record.
type SemanticRecord struct {
	Currency       string
	Amount         values.Decimal
	AmountUSD      *values.Decimal
	AccountFQN     string
	AccountType    accounts.AccountType
	CategoryID     *int64
	EconomicIntent categories.CategoryEconomicIntent
}

// Repository persists transaction and journal record state.
type Repository interface {
	Create(context.Context, PersistInput) (Transaction, error)
	Replace(context.Context, int64, PersistInput) (Transaction, error)
	Get(context.Context, int64) (Transaction, error)
	TransactionsByIDs(context.Context, []int64) ([]Transaction, error)
	Cancel(context.Context, int64) (Transaction, error)
	Restore(context.Context, int64) (Transaction, error)
	List(context.Context, ListOptions) (ListResult, error)
	ListPosition(context.Context, ListOptions) (PagePosition, error)
	MonthTotals(context.Context, MonthTotalsRange) (MonthActivityTotals, error)
	Tombstone(context.Context, int64) error
	SearchRecords(context.Context, RecordSearchOptions) (services.PaginatedList[JournalRecord], error)
	RecordsByTransactionIDs(context.Context, []int64) (map[int64][]JournalRecord, error)
	TransactionsByRecordIDs(context.Context, []int64) ([]Transaction, error)
	TransactionsByAccountID(context.Context, int64) ([]Transaction, error)
	BulkCategorize(context.Context, []int64, int64) (int, error)
	BulkUpdateTags(context.Context, []int64, []int64, []int64) (int, error)
	BulkSetMember(context.Context, []int64, *int64) (int, error)
	BulkReassignAccount(context.Context, []int64, int64, []*time.Time, []*time.Time) (int, error)
	BulkReplaceAccount(context.Context, []BulkAccountReplaceTarget, int64, int64) (int, error)
	BulkSetSettlement(context.Context, []int64, []*time.Time, []*time.Time) (int, error)
	BulkSetReconciliation(context.Context, []int64, ReconciliationStatus) (int, error)
	BackfillMissingAmountUSD(context.Context) error
}

// AccountReferenceValidator resolves active account references for transaction validation.
type AccountReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, accounts.ReferenceOptions) (map[int64]accounts.Reference, error)
	ValidateActiveReference(context.Context, int64, accounts.ReferenceOptions) (accounts.Reference, error)
	ValidateActiveRecordReferences(context.Context, []accounts.RecordReference, accounts.ReferenceOptions) (map[int64]accounts.Reference, error)
	ActiveReferenceByFQN(context.Context, string, accounts.ReferenceOptions) (accounts.Reference, error)
}

// CategoryReferenceValidator resolves active category references for transaction validation.
type CategoryReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, categories.ReferenceOptions) (map[int64]categories.Reference, error)
	ValidateActiveReference(context.Context, int64, categories.ReferenceOptions) (categories.Reference, error)
	ActiveReferenceByFQN(context.Context, string, categories.ReferenceOptions) (categories.Reference, error)
}

// TagReferenceValidator resolves active tag references for transaction validation.
type TagReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, tags.ReferenceOptions) (map[int64]tags.Reference, error)
	ActiveReferenceByFQN(context.Context, string, tags.ReferenceOptions) (tags.Reference, error)
}

// MemberReferenceValidator resolves active household-member references for transaction validation.
type MemberReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, members.ReferenceOptions) (map[int64]members.Reference, error)
	ActiveReferenceByName(context.Context, string, members.ReferenceOptions) (members.Reference, error)
}

// AmountUSDDeriver derives signed USD amounts for generated journal records.
type AmountUSDDeriver interface {
	SignedAmountUSD(context.Context, string, values.Decimal, values.CivilDate) (*values.Decimal, error)
}

// ReferenceCoordinator coordinates reference-dependent transaction writes with reference mutations.
type ReferenceCoordinator interface {
	WithSharedLease(context.Context, func(context.Context) error) error
}

// FutureProjectionProvider supplies non-persisted recurring rows within a coherent occurrence snapshot.
type FutureProjectionProvider interface {
	WithProjectedTransactions(context.Context, values.CivilDate, ListOptions, func(context.Context, []Transaction) error) error
}

// Service owns transaction, journal record, and bulk record use cases.
type Service struct {
	repo                 Repository
	accounts             AccountReferenceValidator
	categories           CategoryReferenceValidator
	tags                 TagReferenceValidator
	members              MemberReferenceValidator
	amountUSDDeriver     AmountUSDDeriver
	refs                 ReferenceCoordinator
	clock                Clock
	currencyUsageChanged func()
	futureProjections    FutureProjectionProvider
}

// SetFutureProjectionProvider connects future-positioned transaction reads to recurring projections.
func (s *Service) SetFutureProjectionProvider(provider FutureProjectionProvider) {
	s.futureProjections = provider
}

// Clock supplies operation timestamps at the service boundary.
type Clock interface {
	Now() time.Time
}

// NewService creates a transaction service backed by repositories.
func NewService(
	repo Repository,
	accounts AccountReferenceValidator,
	categories CategoryReferenceValidator,
	tags TagReferenceValidator,
	members MemberReferenceValidator,
	amountUSDDeriver AmountUSDDeriver,
	refs ReferenceCoordinator,
	clock Clock,
	currencyUsageChanged func(),
) *Service {
	return &Service{
		repo:                 repo,
		accounts:             accounts,
		categories:           categories,
		tags:                 tags,
		members:              members,
		amountUSDDeriver:     amountUSDDeriver,
		refs:                 refs,
		clock:                clock,
		currencyUsageChanged: currencyUsageChanged,
	}
}

// ValidateAccountTypeChange verifies that every active transaction referencing
// accountID remains classification-valid after its records use newType.
func (s *Service) ValidateAccountTypeChange(ctx context.Context, accountID int64, newType accounts.AccountType) error {
	affected, err := s.repo.TransactionsByAccountID(ctx, accountID)
	if err != nil {
		return err
	}

	for transactionIndex := range affected {
		for recordIndex := range affected[transactionIndex].Records {
			record := &affected[transactionIndex].Records[recordIndex]
			if record.AccountID == accountID {
				record.AccountType = newType
			}
		}
		if err := ValidateTransactionClassification(affected[transactionIndex]); err != nil {
			return err
		}
	}

	return nil
}

type semanticDictionaries struct {
	accounts   map[int64]accounts.Reference
	categories map[int64]categories.Reference
}

// Classify derives semantic fields for unsaved records without requiring balance.
func (s *Service) Classify(ctx context.Context, records []ClassificationRecordInput) (Classification, error) {
	if len(records) == 0 {
		return Classification{}, services.InvalidRequest("transaction requires records")
	}
	for index, record := range records {
		if err := validateClassificationRecord(index, record); err != nil {
			return Classification{}, err
		}
	}
	journalRecords := make([]JournalRecordInput, 0, len(records))
	for _, record := range records {
		journalRecords = append(journalRecords, JournalRecordInput{
			AccountID:  record.AccountID,
			Currency:   record.Currency,
			Amount:     record.Amount,
			CategoryID: record.CategoryID,
		})
	}
	dictionaries, err := s.semanticDictionaries(ctx, journalRecords)
	if err != nil {
		return Classification{}, err
	}
	semanticRecords, err := semanticRecordsFromDictionaries(journalRecords, dictionaries)
	if err != nil {
		return Classification{}, err
	}
	return ClassifySemanticRecords(semanticRecords)
}

func validateClassificationRecord(index int, record ClassificationRecordInput) error {
	if record.AccountID <= 0 {
		return services.InvalidRequest(indexedField(index, "account_id") + " must be positive")
	}
	if record.CategoryID != nil && *record.CategoryID <= 0 {
		return services.InvalidRequest(indexedField(index, "category_id") + " must be positive")
	}
	if record.Amount.IsZero() {
		return services.InvalidRequest(indexedField(index, "amount") + " must be non-zero")
	}
	if err := validateCurrency(record.Currency); err != nil {
		return services.InvalidRequest(indexedField(index, "currency") + " must be an ISO 4217 code or crypto code prefixed with C::")
	}
	return nil
}

// Create validates and creates a transaction and its journal records.
func (s *Service) Create(ctx context.Context, input CreateInput) (Transaction, error) {
	if err := validateTransactionInput(input, false); err != nil {
		return Transaction{}, err
	}
	defaultSettlementDate := SettlementTimestampFromInitiatedDate(input.InitiatedDate)
	if err := validateCreateSettlementDefaults(input.Records, defaultSettlementDate); err != nil {
		return Transaction{}, err
	}
	if err := s.inferMissingAmountUSD(ctx, &input); err != nil {
		return Transaction{}, err
	}

	var transaction Transaction
	if err := s.refs.WithSharedLease(ctx, func(ctx context.Context) error {
		persistInput, err := s.preparePersistInput(
			ctx,
			input,
			LifecycleStatusActive,
			defaultSettlementDate,
		)
		if err != nil {
			return err
		}
		created, err := s.repo.Create(ctx, persistInput)
		if errors.Is(err, services.ErrNotFound) || errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("transaction references missing or inactive resource")
		}
		if err != nil {
			return err
		}
		classified, err := ClassifyTransaction(created)
		if err != nil {
			return err
		}
		transaction = classified
		return nil
	}); err != nil {
		return Transaction{}, err
	}

	s.notifyCurrencyUsageChanged()

	return transaction, nil
}

func validateCreateSettlementDefaults(records []JournalRecordInput, defaultDate time.Time) error {
	for index, record := range records {
		intent := record.Settlement
		if intent != nil && intent.Status == SettlementStatusPosted && intent.PostedDate == nil && intent.PendingDate != nil && defaultDate.Before(*intent.PendingDate) {
			return services.InvalidRequest(indexedField(index, "settlement") + ".posted_date must not precede pending_date")
		}
	}
	return nil
}

// Replace validates and reconciles a complete desired transaction by journal-record identity.
func (s *Service) Replace(ctx context.Context, id int64, input UpdateInput) (Transaction, error) {
	if id <= 0 {
		return Transaction{}, services.InvalidRequest("transaction_id must be positive")
	}
	expectedUpdatedAt, err := updatedAtFromETag(input.ExpectedETag)
	if err != nil {
		return Transaction{}, err
	}
	if err := validateUpdateRecordShapes(input.Records); err != nil {
		return Transaction{}, err
	}

	var transaction Transaction
	if err := s.refs.WithSharedLease(ctx, func(ctx context.Context) error {
		current, err := s.Get(ctx, id)
		if err != nil {
			return err
		}
		if ETag(current.UpdatedAt) != input.ExpectedETag {
			return services.PreconditionFailed("transaction changed since it was read")
		}
		if current.LifecycleStatus != LifecycleStatusActive {
			return services.InvalidRequest("only active transactions can be replaced")
		}
		currentByID := journalRecordsByID(current.Records)
		desired, recordIDs, err := desiredReplacement(currentByID, input)
		if err != nil {
			return err
		}
		if err := validateTransactionInput(desired, true); err != nil {
			return err
		}
		if err := s.inferReplacementMissingAmountUSD(ctx, &desired, currentByID, recordIDs); err != nil {
			return err
		}
		persistInput, err := s.preparePersistInput(ctx, desired, LifecycleStatusActive, s.clock.Now().UTC())
		if err != nil {
			return err
		}
		persistInput.ExpectedUpdatedAt = &current.UpdatedAt
		for index := range persistInput.Records {
			persistInput.Records[index].RecordID = recordIDs[index]
		}
		replaced, err := s.repo.Replace(ctx, id, persistInput)
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("transaction references missing or inactive resource")
		}
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("transaction not found")
		}
		if errors.Is(err, services.ErrPreconditionFailed) {
			return services.PreconditionFailed("transaction changed since it was read")
		}
		if errors.Is(err, ErrImportedRecordRemoval) {
			return services.Conflict("imported journal records must be retained by complete replacement")
		}
		if errors.Is(err, ErrLinkedRecordRemoval) {
			return services.Conflict("linked journal records cannot be removed by complete replacement")
		}
		if err != nil {
			return err
		}
		classified, err := ClassifyTransaction(replaced)
		if err != nil {
			return err
		}
		transaction = classified
		return nil
	}); err != nil {
		return Transaction{}, err
	}

	if !transaction.UpdatedAt.Equal(expectedUpdatedAt) {
		s.notifyCurrencyUsageChanged()
	}

	return transaction, nil
}

// ETag returns the canonical strong validator for a transaction update timestamp.
func ETag(updatedAt time.Time) string {
	return `"` + updatedAt.UTC().Format(time.RFC3339Nano) + `"`
}

func updatedAtFromETag(etag string) (time.Time, error) {
	if !validStrongETag(etag) {
		return time.Time{}, services.InvalidRequest("If-Match must be a strong transaction ETag")
	}
	updatedAt, err := time.Parse(time.RFC3339Nano, etag[1:len(etag)-1])
	if err != nil || ETag(updatedAt) != etag {
		return time.Time{}, services.PreconditionFailed("transaction changed since it was read")
	}
	return updatedAt.UTC(), nil
}

func validStrongETag(etag string) bool {
	if len(etag) < 2 || etag[0] != '"' || etag[len(etag)-1] != '"' {
		return false
	}
	for index := 1; index < len(etag)-1; index++ {
		character := etag[index]
		if character != 0x21 && (character < 0x23 || character > 0x7e) && character < 0x80 {
			return false
		}
	}
	return true
}

func validateUpdateRecordShapes(records []UpdateJournalRecordInput) error {
	if len(records) < 2 {
		return services.InvalidRequest("transaction requires at least two records")
	}
	seen := make(map[int64]struct{}, len(records))
	for index, record := range records {
		if record.RecordID == nil {
			if record.Source == SourceRecurringTemplate {
				return services.InvalidRequest(indexedField(index, "source") + " must be manual or imported")
			}
			continue
		}
		if *record.RecordID <= 0 {
			return services.InvalidRequest(indexedField(index, "record_id") + " must be positive")
		}
		if _, ok := seen[*record.RecordID]; ok {
			return services.InvalidRequest(indexedField(index, "record_id") + " must be unique")
		}
		seen[*record.RecordID] = struct{}{}
		if record.Source != "" || record.ExternalID != nil || record.ExternalSystem != nil {
			return services.InvalidRequest(indexedField(index, "record_id") + " cannot be combined with creation provenance")
		}
	}
	return nil
}

func desiredReplacement(currentByID map[int64]JournalRecord, input UpdateInput) (CreateInput, []*int64, error) {
	desired := CreateInput{InitiatedDate: input.InitiatedDate, Records: make([]JournalRecordInput, 0, len(input.Records))}
	recordIDs := make([]*int64, 0, len(input.Records))
	for index, update := range input.Records {
		record := update.JournalRecordInput
		if update.RecordID != nil {
			currentRecord, ok := currentByID[*update.RecordID]
			if !ok {
				return CreateInput{}, nil, services.InvalidRequest(indexedField(index, "record_id") + " must belong to the target transaction")
			}
			record.Source = currentRecord.Source
			record.ExternalID = currentRecord.ExternalID
			record.ExternalSystem = currentRecord.ExternalSystem
			if record.AmountUSD == nil && amountAndCurrencyUnchanged(record, currentRecord) {
				record.AmountUSD = currentRecord.AmountUSD
			}
		}
		desired.Records = append(desired.Records, record)
		recordIDs = append(recordIDs, update.RecordID)
	}

	return desired, recordIDs, nil
}

func (s *Service) notifyCurrencyUsageChanged() {
	if s.currencyUsageChanged != nil {
		s.currencyUsageChanged()
	}
}

func (s *Service) inferMissingAmountUSD(ctx context.Context, input *CreateInput) error {
	if s.amountUSDDeriver == nil {
		return errors.New("transactions: amount USD deriver is not configured")
	}
	for index := range input.Records {
		if input.Records[index].AmountUSD != nil {
			continue
		}
		amountUSD, err := s.amountUSDDeriver.SignedAmountUSD(
			ctx,
			input.Records[index].Currency,
			input.Records[index].Amount,
			input.InitiatedDate,
		)
		if err != nil {
			return err
		}
		input.Records[index].AmountUSD = amountUSD
	}

	return nil
}

func (s *Service) inferReplacementMissingAmountUSD(ctx context.Context, input *CreateInput, currentByID map[int64]JournalRecord, recordIDs []*int64) error {
	for index := range input.Records {
		if input.Records[index].AmountUSD != nil {
			continue
		}
		if recordIDs[index] != nil {
			currentRecord := currentByID[*recordIDs[index]]
			if amountAndCurrencyUnchanged(input.Records[index], currentRecord) {
				continue
			}
		}
		amountUSD, err := s.amountUSDDeriver.SignedAmountUSD(
			ctx,
			input.Records[index].Currency,
			input.Records[index].Amount,
			input.InitiatedDate,
		)
		if err != nil {
			return err
		}
		input.Records[index].AmountUSD = amountUSD
	}

	return nil
}

func journalRecordsByID(records []JournalRecord) map[int64]JournalRecord {
	byID := make(map[int64]JournalRecord, len(records))
	for _, record := range records {
		byID[record.ID] = record
	}
	return byID
}

func amountAndCurrencyUnchanged(input JournalRecordInput, current JournalRecord) bool {
	return input.Currency == current.Currency && input.Amount.Cmp(current.Amount) == 0
}

// BackfillMissingAmountUSD fills unresolved journal records when amount USD can be derived.
func (s *Service) BackfillMissingAmountUSD(ctx context.Context) error {
	return s.repo.BackfillMissingAmountUSD(ctx)
}

// Get returns a transaction with nested journal records by ID.
func (s *Service) Get(ctx context.Context, id int64) (Transaction, error) {
	if id <= 0 {
		return Transaction{}, services.InvalidRequest("transaction_id must be positive")
	}

	transaction, err := s.repo.Get(ctx, id)
	if errors.Is(err, services.ErrNotFound) {
		return Transaction{}, services.NotFound("transaction not found")
	}
	if err != nil {
		return Transaction{}, err
	}

	return ClassifyTransaction(transaction)
}

// Cancel changes a wholly pending active transaction to cancelled without changing records.
func (s *Service) Cancel(ctx context.Context, id int64) (Transaction, error) {
	if id <= 0 {
		return Transaction{}, services.InvalidRequest("transaction_id must be positive")
	}

	current, err := s.Get(ctx, id)
	if err != nil {
		return Transaction{}, err
	}
	if current.LifecycleStatus == LifecycleStatusCancelled {
		return current, nil
	}
	if current.LifecycleStatus != LifecycleStatusActive {
		return Transaction{}, services.InvalidRequest("only active transactions can be cancelled")
	}
	if current.Settlement != SettlementSummaryPending {
		return Transaction{}, services.InvalidRequest("only wholly pending transactions can be cancelled")
	}
	transaction, err := s.repo.Cancel(ctx, id)
	if errors.Is(err, services.ErrNotFound) {
		return Transaction{}, services.NotFound("transaction not found")
	}
	if errors.Is(err, ErrInactiveTransactionMutation) {
		return Transaction{}, services.InvalidRequest("only active transactions can be cancelled")
	}
	if errors.Is(err, ErrTransactionNotPending) {
		return Transaction{}, services.InvalidRequest("only wholly pending transactions can be cancelled")
	}
	if errors.Is(err, services.ErrConflict) {
		return Transaction{}, concurrentTransactionMutationError()
	}
	if err != nil {
		return Transaction{}, err
	}

	return ClassifyTransaction(transaction)
}

// Restore changes a cancelled transaction back to active without changing records.
func (s *Service) Restore(ctx context.Context, id int64) (Transaction, error) {
	if id <= 0 {
		return Transaction{}, services.InvalidRequest("transaction_id must be positive")
	}

	current, err := s.Get(ctx, id)
	if err != nil {
		return Transaction{}, err
	}
	if current.LifecycleStatus == LifecycleStatusActive {
		return current, nil
	}
	if current.LifecycleStatus != LifecycleStatusCancelled {
		return Transaction{}, services.InvalidRequest("only cancelled transactions can be restored")
	}
	transaction, err := s.repo.Restore(ctx, id)
	if errors.Is(err, services.ErrNotFound) {
		return Transaction{}, services.NotFound("transaction not found")
	}
	if errors.Is(err, ErrInactiveTransactionMutation) {
		return Transaction{}, services.InvalidRequest("only cancelled transactions can be restored")
	}
	if errors.Is(err, services.ErrConflict) {
		return Transaction{}, concurrentTransactionMutationError()
	}
	if err != nil {
		return Transaction{}, err
	}

	return ClassifyTransaction(transaction)
}

// List returns transactions with nested journal records.
func (s *Service) List(ctx context.Context, opts ListOptions) (ListResult, error) {
	validatedOpts, err := validateTransactionListOptions(opts)
	if err != nil {
		return ListResult{}, err
	}
	if opts.FilterText == nil {
		return s.listValidatedTransactions(ctx, validatedOpts)
	}

	var result ListResult
	err = s.refs.WithSharedLease(ctx, func(ctx context.Context) error {
		resolvedFilter, err := s.resolveTransactionFilter(ctx, *opts.FilterText)
		if err != nil {
			return err
		}
		validatedOpts.Filter = resolvedFilter
		result, err = s.listValidatedTransactions(ctx, validatedOpts)
		return err
	})
	return result, err
}

func (s *Service) listValidatedTransactions(ctx context.Context, validatedOpts ListOptions) (ListResult, error) {
	if s.futureProjections == nil || validatedOpts.AnchorDate == nil || !validatedOpts.AnchorDate.Time().After(values.LocalCivilDateFromTime(s.clock.Now()).Time()) {
		return s.listPersistedTransactions(ctx, validatedOpts)
	}

	var result ListResult
	err := s.futureProjections.WithProjectedTransactions(ctx, *validatedOpts.AnchorDate, validatedOpts, func(ctx context.Context, projected []Transaction) error {
		position, err := s.repo.ListPosition(ctx, validatedOpts)
		if err != nil {
			return err
		}
		result, err = s.mergeFutureTransactionPage(ctx, validatedOpts, position, projected)
		return err
	})
	return result, err
}

func (s *Service) listPersistedTransactions(ctx context.Context, opts ListOptions) (ListResult, error) {
	transactions, err := s.repo.List(ctx, opts)
	if err != nil {
		return ListResult{}, err
	}
	for index := range transactions.Items {
		classified, err := ClassifyTransaction(transactions.Items[index])
		if err != nil {
			return ListResult{}, err
		}
		transactions.Items[index] = classified
	}
	return transactions, nil
}

func (s *Service) mergeFutureTransactionPage(ctx context.Context, opts ListOptions, position PagePosition, projected []Transaction) (ListResult, error) {
	pageOffset := position.Offset
	if opts.OffsetSpecified {
		pageOffset = opts.Offset
	}
	prefixOpts := opts
	prefixOpts.AnchorDate = nil
	prefixOpts.Offset = 0
	prefixOpts.IncludeTotalCount = false
	if opts.Limit == nil {
		prefixOpts.Limit = nil
	} else {
		prefixLimit := pageOffset + *opts.Limit
		prefixOpts.Limit = &prefixLimit
	}
	persistedPrefix, err := s.repo.List(ctx, prefixOpts)
	if err != nil {
		return ListResult{}, err
	}
	for index := range persistedPrefix.Items {
		classified, err := ClassifyTransaction(persistedPrefix.Items[index])
		if err != nil {
			return ListResult{}, err
		}
		persistedPrefix.Items[index] = classified
	}

	combined := append(persistedPrefix.Items, projected...)
	slices.SortFunc(combined, func(left Transaction, right Transaction) int {
		if dateOrder := right.InitiatedDate.Time().Compare(left.InitiatedDate.Time()); dateOrder != 0 {
			return dateOrder
		}
		switch {
		case left.ID > right.ID:
			return -1
		case left.ID < right.ID:
			return 1
		default:
			return 0
		}
	})
	start := min(pageOffset, len(combined))
	end := len(combined)
	if opts.Limit != nil {
		end = min(start+*opts.Limit, end)
	}

	return ListResult{
		Items:      combined[start:end],
		Offset:     pageOffset,
		TotalCount: position.TotalCount + int64(len(projected)),
	}, nil
}

// MonthTotals returns server-computed spend and income totals for a YYYY-MM civil month.
func (s *Service) MonthTotals(ctx context.Context, month string) (MonthActivityTotals, error) {
	monthRange, err := monthTotalsRange(month)
	if err != nil {
		return MonthActivityTotals{}, err
	}

	return s.repo.MonthTotals(ctx, monthRange)
}

func monthTotalsRange(month string) (MonthTotalsRange, error) {
	if len(month) != len("2006-01") {
		return MonthTotalsRange{}, services.InvalidRequest("month must use YYYY-MM format")
	}
	parsed, err := time.Parse("2006-01", month)
	if err != nil || parsed.Format("2006-01") != month {
		return MonthTotalsRange{}, services.InvalidRequest("month must use YYYY-MM format")
	}

	return MonthTotalsRange{
		Month: month,
		Start: values.CivilDateFromTime(parsed),
		End:   values.CivilDateFromTime(parsed.AddDate(0, 1, 0)),
	}, nil
}

func validateTransactionListOptions(opts ListOptions) (ListOptions, error) {
	if opts.AnchorDate != nil {
		if opts.SortKey != "" && opts.SortKey != services.SortKeyInitiatedDate {
			return ListOptions{}, services.InvalidRequest("anchor_date is only valid with initiated_date descending sort")
		}
		if opts.SortDirection != services.SortDirectionDesc {
			return ListOptions{}, services.InvalidRequest("anchor_date is only valid with initiated_date descending sort")
		}
	}
	for _, class := range opts.TransactionClasses {
		if !validTransactionClass(class) {
			return ListOptions{}, services.InvalidRequest("transaction_class values must be spend, income, refund, clawback, transfer, currency_exchange, adjustment, or mixed")
		}
	}
	if opts.Search != nil && *opts.Search == "" {
		return ListOptions{}, services.InvalidRequest("search must be non-empty")
	}
	return opts, nil
}

func validTransactionClass(class TransactionClass) bool {
	switch class {
	case TransactionClassSpend,
		TransactionClassIncome,
		TransactionClassRefund,
		TransactionClassClawback,
		TransactionClassTransfer,
		TransactionClassCurrencyExchange,
		TransactionClassAdjustment,
		TransactionClassMixed:
		return true
	default:
		return false
	}
}

func validTransactionShape(shape TransactionShapeType) bool {
	switch shape {
	case TransactionShapeSpend,
		TransactionShapeRefund,
		TransactionShapeIncome,
		TransactionShapeClawback,
		TransactionShapeAdjustment,
		TransactionShapeExchange,
		TransactionShapeTransfer:
		return true
	default:
		return false
	}
}

func validRecordRole(role RecordRole) bool {
	switch role {
	case RecordRoleExpense,
		RecordRoleRefund,
		RecordRoleIncome,
		RecordRoleClawback,
		RecordRoleExchange,
		RecordRoleAdjustment,
		RecordRoleBalance:
		return true
	default:
		return false
	}
}

// Delete tombstones a transaction and its journal records.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("transaction_id must be positive")
	}

	if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
		return services.NotFound("transaction not found")
	} else if errors.Is(err, ErrExpectedRecurringMutation) {
		return expectedRecurringMutationError()
	} else if err != nil {
		return err
	}

	return nil
}

// SearchRecords returns journal records matching validated filters.
func (s *Service) SearchRecords(ctx context.Context, opts RecordSearchOptions) (services.PaginatedList[JournalRecord], error) {
	if err := validateRecordSearchOptions(opts); err != nil {
		return services.PaginatedList[JournalRecord]{}, err
	}
	if err := s.validateRecordSearchFilterReferences(ctx, opts, true); err != nil {
		return services.PaginatedList[JournalRecord]{}, err
	}

	records, err := s.repo.SearchRecords(ctx, opts)
	if err != nil {
		return services.PaginatedList[JournalRecord]{}, err
	}
	return s.prepareSearchedRecords(ctx, records)
}

// SearchAccountRecords returns journal records for one active account target.
func (s *Service) SearchAccountRecords(ctx context.Context, accountID int64, opts RecordSearchOptions) (services.PaginatedList[JournalRecord], error) {
	if accountID <= 0 {
		return services.PaginatedList[JournalRecord]{}, services.InvalidRequest("account_id must be positive")
	}
	opts.AccountID = &accountID
	if err := validateRecordSearchOptions(opts); err != nil {
		return services.PaginatedList[JournalRecord]{}, err
	}
	if _, err := s.accounts.ValidateActiveReference(ctx, accountID, accounts.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return services.PaginatedList[JournalRecord]{}, services.NotFound("account not found")
		}
		return services.PaginatedList[JournalRecord]{}, err
	}

	if err := s.validateRecordSearchFilterReferences(ctx, opts, false); err != nil {
		return services.PaginatedList[JournalRecord]{}, err
	}

	records, err := s.repo.SearchRecords(ctx, opts)
	if err != nil {
		return services.PaginatedList[JournalRecord]{}, err
	}
	return s.prepareSearchedRecords(ctx, records)
}

func (s *Service) prepareSearchedRecords(ctx context.Context, records services.PaginatedList[JournalRecord]) (services.PaginatedList[JournalRecord], error) {
	transactionIDs := make([]int64, 0, len(records.Items))
	seenTransactionIDs := make(map[int64]struct{}, len(records.Items))
	for _, record := range records.Items {
		if _, seen := seenTransactionIDs[record.TransactionID]; seen {
			continue
		}
		seenTransactionIDs[record.TransactionID] = struct{}{}
		transactionIDs = append(transactionIDs, record.TransactionID)
	}

	recordsByTransactionID, err := s.repo.RecordsByTransactionIDs(ctx, transactionIDs)
	if err != nil {
		return services.PaginatedList[JournalRecord]{}, err
	}
	type transactionPresentation struct {
		displayTitle string
		accountIDs   []int64
	}
	presentations := make(map[int64]*transactionPresentation, len(transactionIDs))
	for _, transactionID := range transactionIDs {
		titleRecords := recordsByTransactionID[transactionID]
		if len(titleRecords) == 0 {
			continue
		}
		title, err := deriveTransactionDisplayTitle(titleRecords)
		if err != nil {
			return services.PaginatedList[JournalRecord]{}, err
		}
		presentations[transactionID] = &transactionPresentation{
			displayTitle: title,
			accountIDs:   distinctTransactionAccountIDs(titleRecords),
		}
	}
	for index := range records.Items {
		presentation := presentations[records.Items[index].TransactionID]
		if presentation == nil {
			continue
		}
		records.Items[index].TransactionDisplayTitle = &presentation.displayTitle
		records.Items[index].TransactionAccountIDs = &presentation.accountIDs
	}

	return classifySearchedRecords(records)
}

func classifySearchedRecords(records services.PaginatedList[JournalRecord]) (services.PaginatedList[JournalRecord], error) {
	for index := range records.Items {
		record := &records.Items[index]
		role, err := deriveRecordRole(SemanticRecord{
			Currency:       record.Currency,
			Amount:         record.Amount,
			AccountFQN:     record.AccountFQN,
			AccountType:    record.AccountType,
			CategoryID:     record.CategoryID,
			EconomicIntent: record.EconomicIntent,
		})
		if err != nil {
			return services.PaginatedList[JournalRecord]{}, err
		}
		record.Role = role
		settlement, err := deriveRecordSettlement(index, record.LifecycleStatus, *record)
		if err != nil {
			return services.PaginatedList[JournalRecord]{}, err
		}
		record.Settlement = settlement
	}
	return records, nil
}

func distinctTransactionAccountIDs(records []JournalRecord) []int64 {
	accountIDs := make([]int64, 0, len(records))
	seen := make(map[int64]struct{}, len(records))
	for _, record := range records {
		if _, ok := seen[record.AccountID]; ok {
			continue
		}
		seen[record.AccountID] = struct{}{}
		accountIDs = append(accountIDs, record.AccountID)
	}
	return accountIDs
}

// BulkCategorize assigns one category to selected journal records.
func (s *Service) BulkCategorize(ctx context.Context, recordIDs []int64, categoryID int64) (BulkRecordOperationResponse, error) {
	if err := validateRecordSelection(recordIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if categoryID <= 0 {
		return BulkRecordOperationResponse{}, services.InvalidRequest("category_id must be positive")
	}
	var count int
	if err := s.refs.WithSharedLease(ctx, func(ctx context.Context) error {
		if err := s.validateBulkCategorizeClassification(ctx, recordIDs, categoryID); err != nil {
			return err
		}
		updated, err := s.repo.BulkCategorize(ctx, recordIDs, categoryID)
		if errors.Is(err, ErrExpectedRecurringMutation) {
			return expectedRecurringMutationError()
		}
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("records or category missing or inactive resource")
		}
		if errors.Is(err, services.ErrConflict) {
			return concurrentTransactionMutationError()
		}
		if err != nil {
			return err
		}
		count = updated
		return nil
	}); err != nil {
		return BulkRecordOperationResponse{}, err
	}

	return bulkRecordOperationResponse(recordIDs, count), nil
}

// BulkUpdateTags adds and removes tags on selected journal records.
func (s *Service) BulkUpdateTags(ctx context.Context, recordIDs []int64, addTagIDs []int64, removeTagIDs []int64) (BulkRecordOperationResponse, error) {
	if err := validateRecordSelection(recordIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if len(addTagIDs) == 0 && len(removeTagIDs) == 0 {
		return BulkRecordOperationResponse{}, services.InvalidRequest("add_tag_ids or remove_tag_ids is required")
	}
	if err := validatePositiveUniqueIDs("add_tag_ids", addTagIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if err := validatePositiveUniqueIDs("remove_tag_ids", removeTagIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if err := validateNoIDOverlap("add_tag_ids", addTagIDs, "remove_tag_ids", removeTagIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	var count int
	if err := s.refs.WithSharedLease(ctx, func(ctx context.Context) error {
		tagIDs := append(append([]int64{}, addTagIDs...), removeTagIDs...)
		if _, err := s.tags.ValidateActiveReferences(ctx, tagIDs, tags.ReferenceOptions{AllowHidden: true}); err != nil {
			if errors.Is(err, services.ErrInvalidReference) {
				return services.InvalidRequest("records or tags missing or inactive resource")
			}
			return err
		}
		updated, err := s.repo.BulkUpdateTags(ctx, recordIDs, addTagIDs, removeTagIDs)
		if errors.Is(err, ErrExpectedRecurringMutation) {
			return expectedRecurringMutationError()
		}
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("records or tags missing or inactive resource")
		}
		if errors.Is(err, services.ErrConflict) {
			return concurrentTransactionMutationError()
		}
		if err != nil {
			return err
		}
		count = updated
		return nil
	}); err != nil {
		return BulkRecordOperationResponse{}, err
	}

	return bulkRecordOperationResponse(recordIDs, count), nil
}

// BulkSetMember sets or clears the member on selected active journal records.
func (s *Service) BulkSetMember(ctx context.Context, recordIDs []int64, memberID *int64) (BulkRecordOperationResponse, error) {
	if err := validateRecordSelection(recordIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if memberID != nil && *memberID <= 0 {
		return BulkRecordOperationResponse{}, services.InvalidRequest("member_id must be positive or null")
	}

	var count int
	if err := s.refs.WithSharedLease(ctx, func(ctx context.Context) error {
		if _, err := s.members.ValidateActiveReferences(ctx, optionalID(memberID), members.ReferenceOptions{AllowHidden: true}); err != nil {
			if errors.Is(err, services.ErrInvalidReference) {
				return services.InvalidRequest("member missing or inactive resource")
			}
			return err
		}
		updated, err := s.repo.BulkSetMember(ctx, recordIDs, memberID)
		if errors.Is(err, ErrExpectedRecurringMutation) {
			return expectedRecurringMutationError()
		}
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("records missing or inactive resource")
		}
		if errors.Is(err, services.ErrConflict) {
			return concurrentTransactionMutationError()
		}
		if err != nil {
			return err
		}
		count = updated
		return nil
	}); err != nil {
		return BulkRecordOperationResponse{}, err
	}

	return bulkRecordOperationResponse(recordIDs, count), nil
}

// BulkReassignAccount assigns one account to selected journal records.
func (s *Service) BulkReassignAccount(ctx context.Context, recordIDs []int64, accountID int64, settlement *SettlementIntent) (BulkRecordOperationResponse, error) {
	if err := validateRecordSelection(recordIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if accountID <= 0 {
		return BulkRecordOperationResponse{}, services.InvalidRequest("account_id must be positive")
	}
	var count int
	if err := s.refs.WithSharedLease(ctx, func(ctx context.Context) error {
		account, affected, err := s.validateBulkReassignAccountClassification(ctx, recordIDs, accountID)
		if err != nil {
			return err
		}
		pendingDates, postedDates, err := s.normalizedBulkReassignmentSettlement(recordIDs, affected, account.AccountType, settlement)
		if err != nil {
			return err
		}
		updated, err := s.repo.BulkReassignAccount(ctx, recordIDs, accountID, pendingDates, postedDates)
		if errors.Is(err, ErrExpectedRecurringMutation) {
			return expectedRecurringMutationError()
		}
		if errors.Is(err, ErrInactiveTransactionMutation) {
			return services.InvalidRequest("accounts can only change on active transactions")
		}
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("records or account missing or inactive resource")
		}
		if errors.Is(err, services.ErrConflict) {
			return concurrentTransactionMutationError()
		}
		if err != nil {
			return err
		}
		count = updated
		return nil
	}); err != nil {
		return BulkRecordOperationResponse{}, err
	}

	return bulkRecordOperationResponse(recordIDs, count), nil
}

// BulkReplaceAccount replaces one common non-system account across selected active transactions.
func (s *Service) BulkReplaceAccount(ctx context.Context, transactionIDs []int64, sourceAccountID int64, replacementAccountID int64) (BulkAccountReplaceResponse, error) {
	if err := validatePositiveUniqueIDs("transaction_ids", transactionIDs); err != nil {
		return BulkAccountReplaceResponse{}, err
	}
	if len(transactionIDs) == 0 {
		return BulkAccountReplaceResponse{}, services.InvalidRequest("transaction_ids is required")
	}
	if sourceAccountID <= 0 {
		return BulkAccountReplaceResponse{}, services.InvalidRequest("source_account_id must be positive")
	}
	if replacementAccountID <= 0 {
		return BulkAccountReplaceResponse{}, services.InvalidRequest("replacement_account_id must be positive")
	}
	if sourceAccountID == replacementAccountID {
		return BulkAccountReplaceResponse{}, services.InvalidRequest("source_account_id and replacement_account_id must differ")
	}

	response := BulkAccountReplaceResponse{
		TransactionIDs:       append([]int64{}, transactionIDs...),
		SourceAccountID:      sourceAccountID,
		ReplacementAccountID: replacementAccountID,
	}
	if err := s.refs.WithSharedLease(ctx, func(ctx context.Context) error {
		source, err := s.accounts.ValidateActiveReference(ctx, sourceAccountID, accounts.ReferenceOptions{AllowHidden: true})
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("source account missing or inactive resource")
		}
		if err != nil {
			return err
		}
		replacement, err := s.accounts.ValidateActiveReference(ctx, replacementAccountID, accounts.ReferenceOptions{AllowHidden: true})
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("replacement account missing or inactive resource")
		}
		if err != nil {
			return err
		}
		if source.AccountType == accounts.AccountTypeSystem || replacement.AccountType == accounts.AccountTypeSystem {
			return services.InvalidRequest("source and replacement accounts must be non-system accounts")
		}
		if !accountReplaceTypesCompatible(source.AccountType, replacement.AccountType) {
			return services.InvalidRequest("source and replacement accounts must both be balance accounts or both be flow accounts")
		}

		recordReferences := make([]accounts.RecordReference, 0)
		seenCurrencies := map[string]struct{}{}
		targets := make([]BulkAccountReplaceTarget, 0, len(transactionIDs))
		for _, transactionID := range transactionIDs {
			transaction, err := s.repo.Get(ctx, transactionID)
			if errors.Is(err, services.ErrNotFound) {
				return services.InvalidRequest("transactions missing or inactive resource")
			}
			if err != nil {
				return err
			}
			if transaction.LifecycleStatus == LifecycleStatusExpected {
				return expectedRecurringMutationError()
			}
			if transaction.LifecycleStatus != LifecycleStatusActive {
				return services.InvalidRequest("accounts can only change on active transactions")
			}
			targets = append(targets, BulkAccountReplaceTarget{
				TransactionID: transaction.ID,
				UpdatedAt:     transaction.UpdatedAt,
			})

			matched := false
			for recordIndex := range transaction.Records {
				record := &transaction.Records[recordIndex]
				if record.AccountID != sourceAccountID {
					continue
				}
				matched = true
				if _, ok := seenCurrencies[record.Currency]; !ok {
					seenCurrencies[record.Currency] = struct{}{}
					recordReferences = append(recordReferences, accounts.RecordReference{
						AccountID: replacementAccountID,
						Currency:  record.Currency,
					})
				}
				record.AccountID = replacementAccountID
				record.AccountFQN = replacement.FQN
				record.AccountType = replacement.AccountType
			}
			if !matched {
				return accountReplaceSourceNotCommonError()
			}
			if err := ValidateTransactionSemantics(transaction); err != nil {
				return err
			}
		}

		if _, err := s.accounts.ValidateActiveRecordReferences(ctx, recordReferences, accounts.ReferenceOptions{AllowHidden: true}); err != nil {
			if errors.Is(err, services.ErrInvalidReference) {
				return services.InvalidRequest("replacement account is incompatible with one or more source record currencies")
			}
			return err
		}

		updatedRecords, err := s.repo.BulkReplaceAccount(ctx, targets, sourceAccountID, replacementAccountID)
		switch {
		case errors.Is(err, ErrExpectedRecurringMutation),
			errors.Is(err, ErrInactiveTransactionMutation),
			errors.Is(err, services.ErrInvalidReference),
			errors.Is(err, services.ErrConflict):
			return concurrentTransactionMutationError()
		case err != nil:
			return err
		}
		response.UpdatedRecordCount = updatedRecords
		response.UpdatedTransactionCount = len(targets)
		return nil
	}); err != nil {
		return BulkAccountReplaceResponse{}, err
	}

	return response, nil
}

// BulkAccountSearchFacts returns transaction-owned common-source and affected-currency facts for account search.
func (s *Service) BulkAccountSearchFacts(ctx context.Context, transactionIDs []int64, sourceAccountID *int64) (accounts.BulkSearchFacts, error) {
	if err := validatePositiveUniqueIDs("transaction_ids", transactionIDs); err != nil {
		return accounts.BulkSearchFacts{}, err
	}
	if len(transactionIDs) == 0 {
		return accounts.BulkSearchFacts{}, services.InvalidRequest("transaction_ids is required")
	}
	if sourceAccountID != nil && *sourceAccountID <= 0 {
		return accounts.BulkSearchFacts{}, services.InvalidRequest("source_account_id must be positive")
	}

	selectedTransactions, err := s.repo.TransactionsByIDs(ctx, transactionIDs)
	if err != nil {
		return accounts.BulkSearchFacts{}, err
	}
	if len(selectedTransactions) != len(transactionIDs) {
		return accounts.BulkSearchFacts{}, services.InvalidRequest("transactions missing or inactive resource")
	}

	var common map[int64]bool
	affectedCurrencies := map[string]bool{}
	for _, transaction := range selectedTransactions {
		if transaction.LifecycleStatus == LifecycleStatusExpected {
			return accounts.BulkSearchFacts{}, expectedRecurringMutationError()
		}
		if transaction.LifecycleStatus != LifecycleStatusActive {
			return accounts.BulkSearchFacts{}, services.InvalidRequest("accounts can only change on active transactions")
		}

		current := map[int64]bool{}
		for _, record := range transaction.Records {
			current[record.AccountID] = true
			if sourceAccountID != nil && record.AccountID == *sourceAccountID {
				affectedCurrencies[record.Currency] = true
			}
		}
		if common == nil {
			common = current
		} else {
			for id := range common {
				if !current[id] {
					delete(common, id)
				}
			}
		}
	}
	if sourceAccountID != nil && !common[*sourceAccountID] {
		return accounts.BulkSearchFacts{}, accountReplaceSourceNotCommonError()
	}

	commonIDs := make([]int64, 0, len(common))
	for id := range common {
		commonIDs = append(commonIDs, id)
	}
	slices.Sort(commonIDs)
	currencies := make([]string, 0, len(affectedCurrencies))
	for currency := range affectedCurrencies {
		currencies = append(currencies, currency)
	}
	slices.Sort(currencies)
	return accounts.BulkSearchFacts{CommonSourceIDs: commonIDs, AffectedCurrencies: currencies}, nil
}

// BulkSetSettlement changes settlement on selected active balance records.
func (s *Service) BulkSetSettlement(ctx context.Context, recordIDs []int64, settlement SettlementIntent) (BulkRecordOperationResponse, error) {
	if err := validateRecordSelection(recordIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if !validSettlementStatus(settlement.Status) {
		return BulkRecordOperationResponse{}, services.InvalidRequest("settlement must be pending or posted")
	}

	pendingDates, postedDates, err := s.normalizedBulkSettlement(ctx, recordIDs, settlement)
	if err != nil {
		return BulkRecordOperationResponse{}, err
	}
	updated, err := s.repo.BulkSetSettlement(ctx, recordIDs, pendingDates, postedDates)
	if errors.Is(err, ErrExpectedRecurringMutation) {
		return BulkRecordOperationResponse{}, expectedRecurringMutationError()
	}
	if errors.Is(err, ErrInactiveTransactionMutation) {
		return BulkRecordOperationResponse{}, services.InvalidRequest("settlement can only change on active transactions")
	}
	if errors.Is(err, services.ErrInvalidReference) {
		return BulkRecordOperationResponse{}, services.InvalidRequest("records missing or inactive resource")
	}
	if errors.Is(err, services.ErrConflict) {
		return BulkRecordOperationResponse{}, concurrentTransactionMutationError()
	}
	if err != nil {
		return BulkRecordOperationResponse{}, err
	}

	return bulkRecordOperationResponse(recordIDs, updated), nil
}

// BulkSetReconciliation changes reconciliation on selected active records.
func (s *Service) BulkSetReconciliation(ctx context.Context, recordIDs []int64, status ReconciliationStatus) (BulkRecordOperationResponse, error) {
	if err := validateRecordSelection(recordIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if err := validateReconciliationStatus(0, status); err != nil {
		return BulkRecordOperationResponse{}, services.InvalidRequest("reconciliation_status must be reconciled or unreconciled")
	}
	if err := s.validateSelectedActiveRecords(ctx, recordIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	updated, err := s.repo.BulkSetReconciliation(ctx, recordIDs, status)
	if errors.Is(err, ErrExpectedRecurringMutation) {
		return BulkRecordOperationResponse{}, expectedRecurringMutationError()
	}
	if errors.Is(err, ErrInactiveTransactionMutation) {
		return BulkRecordOperationResponse{}, services.InvalidRequest("records can only change on active transactions")
	}
	if errors.Is(err, services.ErrInvalidReference) {
		return BulkRecordOperationResponse{}, services.InvalidRequest("records missing or inactive resource")
	}
	if errors.Is(err, services.ErrConflict) {
		return BulkRecordOperationResponse{}, concurrentTransactionMutationError()
	}
	if err != nil {
		return BulkRecordOperationResponse{}, err
	}
	return bulkRecordOperationResponse(recordIDs, updated), nil
}

func (s *Service) preparePersistInput(
	ctx context.Context,
	input CreateInput,
	lifecycle LifecycleStatus,
	defaultSettlementDate time.Time,
) (PersistInput, error) {
	dictionaries, err := s.semanticDictionaries(ctx, input.Records)
	if err != nil {
		return PersistInput{}, err
	}
	records, err := semanticRecordsFromDictionaries(input.Records, dictionaries)
	if err != nil {
		return PersistInput{}, err
	}
	if _, err := ClassifySemanticRecords(records); err != nil {
		return PersistInput{}, err
	}

	persist := PersistInput{
		InitiatedDate:   input.InitiatedDate,
		LifecycleStatus: lifecycle,
		Records:         make([]PersistJournalRecordInput, 0, len(input.Records)),
	}
	for index, record := range input.Records {
		account := dictionaries.accounts[record.AccountID]
		pendingDate, postedDate, err := normalizeSettlement(index, account.AccountType, lifecycle, record.Settlement, defaultSettlementDate)
		if err != nil {
			return PersistInput{}, err
		}
		persist.Records = append(persist.Records, PersistJournalRecordInput{
			AccountID:            record.AccountID,
			MemberID:             record.MemberID,
			Currency:             record.Currency,
			Amount:               record.Amount,
			AmountUSD:            record.AmountUSD,
			CategoryID:           record.CategoryID,
			TagIDs:               append([]int64{}, record.TagIDs...),
			Memo:                 record.Memo,
			PendingDate:          pendingDate,
			PostedDate:           postedDate,
			ReconciliationStatus: record.ReconciliationStatus,
			Source:               record.Source,
			ExternalID:           record.ExternalID,
			ExternalSystem:       record.ExternalSystem,
		})
	}

	return persist, nil
}

func normalizeSettlement(index int, accountType accounts.AccountType, lifecycle LifecycleStatus, intent *SettlementIntent, defaultDate time.Time) (*time.Time, *time.Time, error) {
	isBalance := accountType == accounts.AccountTypeOwned || accountType == accounts.AccountTypeParty
	if lifecycle == LifecycleStatusExpected {
		if intent != nil {
			return nil, nil, services.InvalidRequest(indexedField(index, "settlement") + " must be omitted for expected transactions")
		}
		return nil, nil, nil
	}
	if !isBalance {
		if intent != nil {
			return nil, nil, services.InvalidRequest(indexedField(index, "settlement") + " is only valid for owned or party accounts")
		}
		return nil, nil, nil
	}
	if intent == nil {
		return nil, nil, services.InvalidRequest(indexedField(index, "settlement") + " is required for owned or party accounts")
	}

	return NormalizeSettlementIntent(indexedField(index, "settlement"), *intent, defaultDate)
}

// NormalizeSettlementIntent validates pending or posted intent and fills omitted timestamps.
func NormalizeSettlementIntent(field string, intent SettlementIntent, defaultDate time.Time) (*time.Time, *time.Time, error) {
	pendingDate := intent.PendingDate
	postedDate := intent.PostedDate
	switch intent.Status {
	case SettlementStatusPending:
		if postedDate != nil {
			return nil, nil, services.InvalidRequest(settlementField(field, "posted_date") + " must be omitted for pending settlement")
		}
		if pendingDate == nil {
			pendingDate = &defaultDate
		}
	case SettlementStatusPosted:
		if postedDate == nil {
			postedDate = &defaultDate
			if pendingDate != nil && postedDate.Before(*pendingDate) {
				postedDate = pendingDate
			}
		}
	default:
		return nil, nil, services.InvalidRequest(settlementField(field, "status") + " must be pending or posted")
	}
	if pendingDate != nil && postedDate != nil && postedDate.Before(*pendingDate) {
		return nil, nil, services.InvalidRequest(settlementField(field, "posted_date") + " must not precede pending_date")
	}

	return pendingDate, postedDate, nil
}

func settlementField(prefix, name string) string {
	if prefix == "" {
		return name
	}
	return prefix + "." + name
}

func semanticRecordsFromDictionaries(inputs []JournalRecordInput, dictionaries semanticDictionaries) ([]SemanticRecord, error) {
	records := make([]SemanticRecord, 0, len(inputs))
	for _, record := range inputs {
		accountReference, ok := dictionaries.accounts[record.AccountID]
		if !ok {
			return nil, invalidTransactionReferenceError()
		}
		var economicIntent categories.CategoryEconomicIntent
		if record.CategoryID != nil {
			categoryReference, ok := dictionaries.categories[*record.CategoryID]
			if !ok {
				return nil, invalidTransactionReferenceError()
			}
			economicIntent = categoryReference.EconomicIntent
		}
		records = append(records, SemanticRecord{
			Currency:       record.Currency,
			Amount:         record.Amount,
			AccountFQN:     accountReference.FQN,
			AccountType:    accountReference.AccountType,
			CategoryID:     record.CategoryID,
			EconomicIntent: economicIntent,
		})
	}
	return records, nil
}

func (s *Service) validateBulkCategorizeClassification(ctx context.Context, recordIDs []int64, categoryID int64) error {
	categoryReference, err := s.categories.ValidateActiveReference(ctx, categoryID, categories.ReferenceOptions{AllowHidden: true})
	if errors.Is(err, services.ErrInvalidReference) {
		return invalidBulkCategoryReferenceError()
	}
	if err != nil {
		return err
	}
	affected, err := s.repo.TransactionsByRecordIDs(ctx, recordIDs)
	if errors.Is(err, services.ErrInvalidReference) {
		return invalidBulkCategoryReferenceError()
	}
	if err != nil {
		return err
	}

	selected := idSet(recordIDs)
	found := map[int64]struct{}{}
	for transactionIndex := range affected {
		for recordIndex := range affected[transactionIndex].Records {
			record := &affected[transactionIndex].Records[recordIndex]
			if _, ok := selected[record.ID]; ok {
				record.CategoryID = &categoryID
				record.EconomicIntent = categoryReference.EconomicIntent
				found[record.ID] = struct{}{}
			}
		}
		if err := ValidateTransactionSemantics(affected[transactionIndex]); err != nil {
			return err
		}
	}
	if len(found) != len(selected) {
		return invalidBulkCategoryReferenceError()
	}

	return nil
}

func (s *Service) validateBulkReassignAccountClassification(ctx context.Context, recordIDs []int64, accountID int64) (accounts.Reference, []Transaction, error) {
	affected, err := s.repo.TransactionsByRecordIDs(ctx, recordIDs)
	if errors.Is(err, services.ErrInvalidReference) {
		return accounts.Reference{}, nil, invalidBulkAccountReferenceError()
	}
	if err != nil {
		return accounts.Reference{}, nil, err
	}

	selected := idSet(recordIDs)
	found := map[int64]struct{}{}
	recordReferences := make([]accounts.RecordReference, 0)
	referencedCurrencies := map[string]struct{}{}
	for _, transaction := range affected {
		for _, record := range transaction.Records {
			if _, ok := selected[record.ID]; ok {
				if _, ok := referencedCurrencies[record.Currency]; ok {
					continue
				}
				referencedCurrencies[record.Currency] = struct{}{}
				recordReferences = append(recordReferences, accounts.RecordReference{
					AccountID: accountID,
					Currency:  record.Currency,
				})
			}
		}
	}
	accountReferences, err := s.accounts.ValidateActiveRecordReferences(
		ctx,
		recordReferences,
		accounts.ReferenceOptions{AllowHidden: true},
	)
	if errors.Is(err, services.ErrInvalidReference) {
		return accounts.Reference{}, nil, invalidBulkAccountReferenceError()
	}
	if err != nil {
		return accounts.Reference{}, nil, err
	}
	accountReference := accountReferences[accountID]
	for transactionIndex := range affected {
		for recordIndex := range affected[transactionIndex].Records {
			record := &affected[transactionIndex].Records[recordIndex]
			if _, ok := selected[record.ID]; ok {
				record.AccountID = accountID
				record.AccountFQN = accountReference.FQN
				record.AccountType = accountReference.AccountType
				found[record.ID] = struct{}{}
			}
		}
		if err := ValidateTransactionSemantics(affected[transactionIndex]); err != nil {
			return accounts.Reference{}, nil, err
		}
	}
	if len(found) != len(selected) {
		return accounts.Reference{}, nil, invalidBulkAccountReferenceError()
	}

	return accountReference, affected, nil
}

func expectedRecurringMutationError() error {
	return services.InvalidRequest("expected recurring transactions must be changed through recurring occurrence endpoints")
}

func accountReplaceSourceNotCommonError() error {
	return services.InvalidRequest("source account must occur in every selected transaction")
}

func accountReplaceTypesCompatible(source accounts.AccountType, replacement accounts.AccountType) bool {
	if source == accounts.AccountTypeFlow {
		return replacement == accounts.AccountTypeFlow
	}
	if source == accounts.AccountTypeOwned || source == accounts.AccountTypeParty {
		return replacement == accounts.AccountTypeOwned || replacement == accounts.AccountTypeParty
	}
	return false
}

func concurrentTransactionMutationError() error {
	return services.Conflict("transaction changed concurrently; retry request")
}

func (s *Service) normalizedBulkSettlement(ctx context.Context, recordIDs []int64, settlement SettlementIntent) ([]*time.Time, []*time.Time, error) {
	affected, err := s.repo.TransactionsByRecordIDs(ctx, recordIDs)
	if errors.Is(err, services.ErrInvalidReference) {
		return nil, nil, services.InvalidRequest("records missing or inactive resource")
	}
	if err != nil {
		return nil, nil, err
	}

	selected := idSet(recordIDs)
	records := make(map[int64]JournalRecord, len(recordIDs))
	for _, transaction := range affected {
		if transaction.LifecycleStatus != LifecycleStatusActive {
			return nil, nil, services.InvalidRequest("settlement can only change on active transactions")
		}
		for _, record := range transaction.Records {
			if _, ok := selected[record.ID]; ok {
				if record.AccountType != accounts.AccountTypeOwned && record.AccountType != accounts.AccountTypeParty {
					return nil, nil, services.InvalidRequest("settlement can only change on owned or party records")
				}
				records[record.ID] = record
			}
		}
	}
	if len(records) != len(selected) {
		return nil, nil, services.InvalidRequest("records missing or inactive resource")
	}

	now := s.clock.Now().UTC()
	pendingDates := make([]*time.Time, 0, len(recordIDs))
	postedDates := make([]*time.Time, 0, len(recordIDs))
	for _, recordID := range recordIDs {
		record := records[recordID]
		recordSettlement := SettlementIntent{
			Status:      settlement.Status,
			PendingDate: record.PendingDate,
			PostedDate:  record.PostedDate,
		}
		switch settlement.Status {
		case SettlementStatusPending:
			if settlement.PendingDate != nil {
				recordSettlement.PendingDate = settlement.PendingDate
			}
			recordSettlement.PostedDate = settlement.PostedDate
		case SettlementStatusPosted:
			if settlement.PendingDate != nil {
				recordSettlement.PendingDate = settlement.PendingDate
			}
			if settlement.PostedDate != nil {
				recordSettlement.PostedDate = settlement.PostedDate
			}
		}
		pendingDate, postedDate, err := NormalizeSettlementIntent("", recordSettlement, now)
		if err != nil {
			return nil, nil, err
		}
		pendingDates = append(pendingDates, pendingDate)
		postedDates = append(postedDates, postedDate)
	}

	return pendingDates, postedDates, nil
}

func (s *Service) normalizedBulkReassignmentSettlement(recordIDs []int64, affected []Transaction, targetType accounts.AccountType, intent *SettlementIntent) ([]*time.Time, []*time.Time, error) {
	selected := idSet(recordIDs)
	records := make(map[int64]JournalRecord, len(recordIDs))
	for _, transaction := range affected {
		if transaction.LifecycleStatus != LifecycleStatusActive {
			return nil, nil, services.InvalidRequest("accounts can only change on active transactions")
		}
		for _, record := range transaction.Records {
			if _, ok := selected[record.ID]; ok {
				records[record.ID] = record
			}
		}
	}
	if len(records) != len(selected) {
		return nil, nil, invalidBulkAccountReferenceError()
	}

	isBalance := targetType == accounts.AccountTypeOwned || targetType == accounts.AccountTypeParty
	if !isBalance {
		if intent != nil {
			return nil, nil, services.InvalidRequest("settlement must be omitted for flow or system accounts")
		}
		return make([]*time.Time, len(recordIDs)), make([]*time.Time, len(recordIDs)), nil
	}

	now := s.clock.Now().UTC()
	pendingDates := make([]*time.Time, 0, len(recordIDs))
	postedDates := make([]*time.Time, 0, len(recordIDs))
	for index, recordID := range recordIDs {
		record := records[recordID]
		recordIntent := intent
		if recordIntent == nil {
			status := SettlementStatusPending
			if record.PostedDate != nil {
				status = SettlementStatusPosted
			} else if record.PendingDate == nil {
				return nil, nil, services.InvalidRequest(indexedField(index, "settlement") + " is required when reassigning to an owned or party account")
			}
			recordIntent = &SettlementIntent{Status: status, PendingDate: record.PendingDate, PostedDate: record.PostedDate}
		}
		pendingDate, postedDate, err := normalizeSettlement(index, targetType, LifecycleStatusActive, recordIntent, now)
		if err != nil {
			return nil, nil, err
		}
		pendingDates = append(pendingDates, pendingDate)
		postedDates = append(postedDates, postedDate)
	}
	return pendingDates, postedDates, nil
}

func (s *Service) validateSelectedActiveRecords(ctx context.Context, recordIDs []int64) error {
	affected, err := s.repo.TransactionsByRecordIDs(ctx, recordIDs)
	if errors.Is(err, services.ErrInvalidReference) {
		return services.InvalidRequest("records missing or inactive resource")
	}
	if err != nil {
		return err
	}
	selected := idSet(recordIDs)
	found := map[int64]struct{}{}
	for _, transaction := range affected {
		if transaction.LifecycleStatus != LifecycleStatusActive {
			return services.InvalidRequest("records can only change on active transactions")
		}
		for _, record := range transaction.Records {
			if _, ok := selected[record.ID]; !ok {
				continue
			}
			found[record.ID] = struct{}{}
		}
	}
	if len(found) != len(selected) {
		return services.InvalidRequest("records missing or inactive resource")
	}
	return nil
}

func (s *Service) semanticDictionaries(ctx context.Context, records []JournalRecordInput) (semanticDictionaries, error) {
	accountReferences := make([]accounts.RecordReference, 0, len(records))
	categoryIDs := make([]int64, 0, len(records))
	memberIDs := []int64{}
	tagIDs := []int64{}
	for _, record := range records {
		accountReferences = append(accountReferences, accounts.RecordReference{
			AccountID: record.AccountID,
			Currency:  record.Currency,
		})
		if record.CategoryID != nil {
			categoryIDs = append(categoryIDs, *record.CategoryID)
		}
		if record.MemberID != nil {
			memberIDs = append(memberIDs, *record.MemberID)
		}
		tagIDs = append(tagIDs, record.TagIDs...)
	}

	resolvedAccounts, err := s.accounts.ValidateActiveRecordReferences(
		ctx,
		accountReferences,
		accounts.ReferenceOptions{AllowHidden: true},
	)
	if errors.Is(err, services.ErrInvalidReference) {
		return semanticDictionaries{}, invalidTransactionReferenceError()
	}
	if err != nil {
		return semanticDictionaries{}, err
	}
	categoryReferences, err := s.categories.ValidateActiveReferences(ctx, categoryIDs, categories.ReferenceOptions{AllowHidden: true})
	if errors.Is(err, services.ErrInvalidReference) {
		return semanticDictionaries{}, invalidTransactionReferenceError()
	}
	if err != nil {
		return semanticDictionaries{}, err
	}
	if _, err := s.members.ValidateActiveReferences(ctx, memberIDs, members.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return semanticDictionaries{}, invalidTransactionReferenceError()
		}
		return semanticDictionaries{}, err
	}
	if _, err := s.tags.ValidateActiveReferences(ctx, tagIDs, tags.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return semanticDictionaries{}, invalidTransactionReferenceError()
		}
		return semanticDictionaries{}, err
	}

	return semanticDictionaries{
		accounts:   resolvedAccounts,
		categories: categoryReferences,
	}, nil
}

func invalidTransactionReferenceError() error {
	return services.InvalidRequest("transaction references missing or inactive resource")
}

func invalidTransactionFilterReferenceError() error {
	return services.InvalidRequest("transaction filters reference missing or inactive resource")
}

func invalidRecordSearchFilterReferenceError() error {
	return services.InvalidRequest("record search filters reference missing or inactive resource")
}

func idSet(ids []int64) map[int64]struct{} {
	set := make(map[int64]struct{}, len(ids))
	for _, id := range ids {
		set[id] = struct{}{}
	}

	return set
}

func invalidBulkCategoryReferenceError() error {
	return services.InvalidRequest("records or category missing or inactive resource")
}

func invalidBulkAccountReferenceError() error {
	return services.InvalidRequest("records or account missing or inactive resource")
}

// SettlementTimestampFromInitiatedDate returns the end-of-day UTC timestamp
// used when a settlement event time is derived from a transaction's civil date.
func SettlementTimestampFromInitiatedDate(initiatedDate values.CivilDate) time.Time {
	return initiatedDate.Time().Add(24*time.Hour - time.Second)
}

func validateTransactionInput(input CreateInput, allowRecurringSource bool) error {
	if len(input.Records) < 2 {
		return services.InvalidRequest("transaction requires at least two records")
	}

	balances := map[string]values.Decimal{}
	for index, record := range input.Records {
		if err := validateJournalRecord(index, record, allowRecurringSource); err != nil {
			return err
		}
		if balance, ok := balances[record.Currency]; ok {
			updated, err := balance.Add(record.Amount)
			if err != nil {
				return services.InvalidRequest("transaction records must balance to zero amount per currency")
			}
			balances[record.Currency] = updated
		} else {
			balances[record.Currency] = record.Amount
		}
	}
	for _, balance := range balances {
		if !balance.IsZero() {
			return services.InvalidRequest("transaction records must balance to zero amount per currency")
		}
	}

	return nil
}

func validateJournalRecord(index int, record JournalRecordInput, allowRecurringSource bool) error {
	if record.AccountID <= 0 {
		return services.InvalidRequest(indexedField(index, "account_id") + " must be positive")
	}
	if record.MemberID != nil && *record.MemberID <= 0 {
		return services.InvalidRequest(indexedField(index, "member_id") + " must be positive")
	}
	if record.CategoryID != nil && *record.CategoryID <= 0 {
		return services.InvalidRequest(indexedField(index, "category_id") + " must be positive")
	}
	if record.Amount.IsZero() {
		return services.InvalidRequest(indexedField(index, "amount") + " must be non-zero")
	}
	if record.AmountUSD != nil && record.AmountUSD.IsZero() {
		return services.InvalidRequest(indexedField(index, "amount_usd") + " must be non-zero")
	}

	seenTags := map[int64]struct{}{}
	for _, tagID := range record.TagIDs {
		if tagID <= 0 {
			return services.InvalidRequest(indexedField(index, "tag_ids") + " values must be positive")
		}
		if _, ok := seenTags[tagID]; ok {
			return services.InvalidRequest(indexedField(index, "tag_ids") + " values must be unique")
		}
		seenTags[tagID] = struct{}{}
	}

	if err := validateCurrency(record.Currency); err != nil {
		return services.InvalidRequest(indexedField(index, "currency") + " must be an ISO 4217 code or crypto code prefixed with C::")
	}
	if record.Settlement != nil {
		switch record.Settlement.Status {
		case SettlementStatusPending, SettlementStatusPosted:
		default:
			return services.InvalidRequest(indexedField(index, "settlement.status") + " must be pending or posted")
		}
	}
	if err := validateReconciliationStatus(index, record.ReconciliationStatus); err != nil {
		return err
	}
	if record.Source != SourceManual && record.Source != SourceImported && (!allowRecurringSource || record.Source != SourceRecurringTemplate) {
		return services.InvalidRequest(indexedField(index, "source") + " must be manual or imported")
	}
	if record.Memo != nil && strings.TrimSpace(*record.Memo) != *record.Memo {
		return services.InvalidRequest(indexedField(index, "memo") + " must not have leading or trailing whitespace")
	}
	if err := validateExternalIdentifiers(record.ExternalID, record.ExternalSystem); err != nil {
		return services.InvalidRequest(indexedField(index, "external_id") + " and " + indexedField(index, "external_system") + " must be provided together without surrounding whitespace")
	}

	return nil
}

func validateRecordSearchOptions(opts RecordSearchOptions) error {
	if opts.SortKey != "" && opts.SortKey != services.SortKeyInitiatedDate && opts.SortKey != services.SortKeyUpdatedAt {
		return services.InvalidRequest("sort must be initiated_date or updated_at")
	}
	switch opts.SortDirection {
	case "", services.SortDirectionAsc, services.SortDirectionDesc:
	default:
		return services.InvalidRequest("sort_dir must be asc or desc")
	}
	if opts.AccountID != nil && *opts.AccountID <= 0 {
		return services.InvalidRequest("account_id must be positive")
	}
	if opts.AccountFQNPrefix != nil {
		if err := validateAccountFQNPrefix(*opts.AccountFQNPrefix); err != nil {
			return err
		}
		if opts.AccountID != nil {
			return services.InvalidRequest("account_fqn_prefix cannot be combined with account_id")
		}
		if opts.IncludeRunningBalance {
			return services.InvalidRequest("account_fqn_prefix cannot be combined with include_running_balance")
		}
	}
	if opts.CategoryID != nil && *opts.CategoryID <= 0 {
		return services.InvalidRequest("category_id must be positive")
	}
	if opts.MemberID != nil && *opts.MemberID <= 0 {
		return services.InvalidRequest("member_id must be positive")
	}
	if opts.TagID != nil && *opts.TagID <= 0 {
		return services.InvalidRequest("tag_id must be positive")
	}
	if opts.LifecycleStatus != nil && !validLifecycleStatus(*opts.LifecycleStatus) {
		return services.InvalidRequest("lifecycle_status must be active, expected, or cancelled")
	}
	if opts.Settlement != nil && !validSettlementStatus(*opts.Settlement) {
		return services.InvalidRequest("settlement must be pending or posted")
	}
	if opts.RecordRole != nil && !validRecordRole(*opts.RecordRole) {
		return services.InvalidRequest("record_role must be expense, refund, income, clawback, exchange, adjustment, or balance")
	}
	if opts.ReconciliationStatus != nil {
		if err := validateReconciliationStatus(0, *opts.ReconciliationStatus); err != nil {
			return services.InvalidRequest("reconciliation_status must be reconciled or unreconciled")
		}
	}
	if opts.MemoContains != nil && *opts.MemoContains == "" {
		return services.InvalidRequest("memo_contains must be non-empty")
	}
	if opts.IncludeRunningBalance && opts.AccountID == nil {
		return services.InvalidRequest("include_running_balance requires account_id")
	}
	return nil
}

func (s *Service) validateRecordSearchFilterReferences(ctx context.Context, opts RecordSearchOptions, validateAccount bool) error {
	if validateAccount {
		if _, err := s.accounts.ValidateActiveReferences(ctx, optionalID(opts.AccountID), accounts.ReferenceOptions{AllowHidden: true}); err != nil {
			if errors.Is(err, services.ErrInvalidReference) {
				return invalidRecordSearchFilterReferenceError()
			}
			return err
		}
	}
	if _, err := s.categories.ValidateActiveReferences(ctx, optionalID(opts.CategoryID), categories.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidRecordSearchFilterReferenceError()
		}
		return err
	}
	if _, err := s.tags.ValidateActiveReferences(ctx, optionalID(opts.TagID), tags.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidRecordSearchFilterReferenceError()
		}
		return err
	}
	if _, err := s.members.ValidateActiveReferences(ctx, optionalID(opts.MemberID), members.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidRecordSearchFilterReferenceError()
		}
		return err
	}

	return nil
}

func optionalID(id *int64) []int64 {
	if id == nil {
		return nil
	}

	return []int64{*id}
}

func validateAccountFQNPrefix(prefix string) error {
	if strings.TrimSpace(prefix) != prefix || prefix == "" {
		return services.InvalidRequest("account_fqn_prefix must be non-empty without leading or trailing whitespace")
	}
	if strings.HasPrefix(prefix, ":") || strings.HasSuffix(prefix, ":") || strings.Contains(prefix, "::") {
		return services.InvalidRequest("account_fqn_prefix must be colon-separated with non-empty segments")
	}
	for segment := range strings.SplitSeq(prefix, ":") {
		if strings.TrimSpace(segment) != segment || segment == "" {
			return services.InvalidRequest("account_fqn_prefix segments must be non-empty without leading or trailing whitespace")
		}
	}

	return nil
}

func indexedField(index int, name string) string {
	return "records[" + strconv.Itoa(index) + "]." + name
}

func validateRecordSelection(recordIDs []int64) error {
	if len(recordIDs) == 0 {
		return services.InvalidRequest("record_ids must contain at least one record")
	}

	return validatePositiveUniqueIDs("record_ids", recordIDs)
}

func validatePositiveUniqueIDs(name string, ids []int64) error {
	seen := map[int64]struct{}{}
	for _, id := range ids {
		if id <= 0 {
			return services.InvalidRequest(name + " values must be positive")
		}
		if _, ok := seen[id]; ok {
			return services.InvalidRequest(name + " values must be unique")
		}
		seen[id] = struct{}{}
	}

	return nil
}

func validateNoIDOverlap(firstName string, firstIDs []int64, secondName string, secondIDs []int64) error {
	firstSet := map[int64]struct{}{}
	for _, id := range firstIDs {
		firstSet[id] = struct{}{}
	}
	for _, id := range secondIDs {
		if _, ok := firstSet[id]; ok {
			return services.InvalidRequest(firstName + " and " + secondName + " must not overlap")
		}
	}

	return nil
}

func bulkRecordOperationResponse(recordIDs []int64, count int) BulkRecordOperationResponse {
	return BulkRecordOperationResponse{
		RecordIDs:    append([]int64{}, recordIDs...),
		UpdatedCount: count,
	}
}

func validLifecycleStatus(status LifecycleStatus) bool {
	switch status {
	case LifecycleStatusActive, LifecycleStatusExpected, LifecycleStatusCancelled:
		return true
	default:
		return false
	}
}

func validSettlementStatus(status SettlementStatus) bool {
	return status == SettlementStatusPending || status == SettlementStatusPosted
}

func validSettlementSummary(status SettlementSummary) bool {
	switch status {
	case SettlementSummaryPending, SettlementSummaryPosted, SettlementSummaryMixed, SettlementSummaryNotApplicable:
		return true
	default:
		return false
	}
}

func validateReconciliationStatus(index int, status ReconciliationStatus) error {
	switch status {
	case ReconciliationStatusReconciled, ReconciliationStatusUnreconciled:
		return nil
	default:
		return services.InvalidRequest(indexedField(index, "reconciliation_status") + " must be reconciled or unreconciled")
	}
}

func validateCurrency(currency string) error {
	if !values.ValidCurrencyCode(currency) {
		return errors.New("invalid currency")
	}

	return nil
}

func validateExternalIdentifiers(externalID *string, externalSystem *string) error {
	if externalID == nil && externalSystem == nil {
		return nil
	}
	if externalID == nil || externalSystem == nil {
		return services.InvalidRequest("external_id and external_system must be provided together")
	}
	if strings.TrimSpace(*externalID) != *externalID || *externalID == "" {
		return services.InvalidRequest("external_id must be non-empty without leading or trailing whitespace")
	}
	if strings.TrimSpace(*externalSystem) != *externalSystem || *externalSystem == "" {
		return services.InvalidRequest("external_system must be non-empty without leading or trailing whitespace")
	}

	return nil
}
