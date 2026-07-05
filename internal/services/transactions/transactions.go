package transactions

import (
	"context"
	"errors"
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

// PostingStatus is a journal record posting lifecycle state.
type PostingStatus string

const (
	// PostingStatusPending identifies a pending journal record.
	PostingStatusPending PostingStatus = "pending"
	// PostingStatusPosted identifies a posted journal record.
	PostingStatusPosted PostingStatus = "posted"
	// PostingStatusCancelled identifies a cancelled journal record.
	PostingStatusCancelled PostingStatus = "cancelled"
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
)

// Transaction is a double-entry transaction with nested journal records.
type Transaction struct {
	ID             int64
	InitiatedDate  values.CivilDate
	Class          TransactionClass
	DisplayTitle   string
	PrimaryAmounts []DisplayAmount
	Components     []ClassificationComponent
	CreatedAt      time.Time
	TombstonedAt   *time.Time
	Records        []JournalRecord
}

// JournalRecord is one debit or credit entry inside a transaction.
type JournalRecord struct {
	ID                   int64
	TransactionID        int64
	AccountID            int64
	AccountName          string
	AccountType          accounts.AccountType
	MemberID             *int64
	Currency             string
	Amount               values.Decimal
	AmountUSD            *values.Decimal
	RunningBalance       *values.Decimal
	CategoryID           int64
	EconomicIntent       categories.CategoryEconomicIntent
	TagIDs               []int64
	Memo                 *string
	PendingDate          time.Time
	PostedDate           *time.Time
	PostingStatus        PostingStatus
	ReconciliationStatus ReconciliationStatus
	Source               Source
	ExternalID           *string
	ExternalSystem       *string
	CreatedAt            time.Time
	UpdatedAt            time.Time
	TombstonedAt         *time.Time
}

// CreateInput contains fields for creating or replacing a transaction.
type CreateInput struct {
	InitiatedDate values.CivilDate
	Records       []JournalRecordInput
}

// JournalRecordInput is one record inside a transaction write request.
type JournalRecordInput struct {
	AccountID            int64
	MemberID             *int64
	Currency             string
	Amount               values.Decimal
	AmountUSD            *values.Decimal
	CategoryID           int64
	TagIDs               []int64
	Memo                 *string
	PendingDate          *time.Time
	PostedDate           *time.Time
	PostingStatus        PostingStatus
	ReconciliationStatus ReconciliationStatus
	Source               Source
	ExternalID           *string
	ExternalSystem       *string
}

// AmountUSDBackfillRecord is one unresolved record needing amount-USD inference.
type AmountUSDBackfillRecord struct {
	RecordID   int64
	Currency   string
	Amount     values.Decimal
	LookupDate values.CivilDate
}

// AmountUSDBackfillUpdate is one resolved amount-USD backfill update.
type AmountUSDBackfillUpdate struct {
	RecordID  int64
	AmountUSD values.Decimal
}

// RecordSearchOptions controls journal record search filters.
type RecordSearchOptions struct {
	AccountID             *int64
	AccountFQNPrefix      *string
	CategoryID            *int64
	MemberID              *int64
	TagID                 *int64
	PostingStatus         *PostingStatus
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
	Limit                 *int
	Offset                int
	IncludeTotalCount     bool
}

// ListOptions controls transaction list sort, pagination, and date anchoring.
type ListOptions struct {
	services.ListOptions
	AnchorDate         *values.CivilDate
	AccountIDs         []int64
	CategoryIDs        []int64
	TagIDs             []int64
	MemberIDs          []int64
	PostingStatuses    []PostingStatus
	TransactionClasses []TransactionClass
	AmountMinText      *string
	AmountMaxText      *string
	AmountUSDMinText   *string
	AmountUSDMaxText   *string
	AmountMin          *values.Decimal
	AmountMax          *values.Decimal
	AmountUSDMin       *values.Decimal
	AmountUSDMax       *values.Decimal
	InitiatedDateFrom  *values.CivilDate
	InitiatedDateTo    *values.CivilDate
	PendingDateFrom    *time.Time
	PendingDateTo      *time.Time
	PostedDateFrom     *time.Time
	PostedDateTo       *time.Time
	Search             *string
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

// TransactionClass is the derived user-facing transaction class.
type TransactionClass string

const (
	TransactionClassSpend            TransactionClass = "spend"
	TransactionClassIncome           TransactionClass = "income"
	TransactionClassRefund           TransactionClass = "refund"
	TransactionClassTransfer         TransactionClass = "transfer"
	TransactionClassCurrencyExchange TransactionClass = "currency_exchange"
	TransactionClassAdjustment       TransactionClass = "adjustment"
	TransactionClassFXGainLoss       TransactionClass = "fx_gain_loss"
	TransactionClassMixed            TransactionClass = "mixed"
)

// DisplayAmount is a signed display amount in one currency.
type DisplayAmount struct {
	Currency string
	Amount   values.Decimal
}

// ClassificationComponent summarizes one economic-intent component.
type ClassificationComponent struct {
	Intent  categories.CategoryEconomicIntent
	Amounts []DisplayAmount
}

// SemanticRecord is the service-owned classification input for one journal record.
type SemanticRecord struct {
	Currency       string
	Amount         values.Decimal
	AccountType    accounts.AccountType
	EconomicIntent categories.CategoryEconomicIntent
}

// Repository persists transaction and journal record state.
type Repository interface {
	Create(context.Context, CreateInput) (Transaction, error)
	Replace(context.Context, int64, CreateInput) (Transaction, error)
	Get(context.Context, int64) (Transaction, error)
	List(context.Context, ListOptions) (ListResult, error)
	MonthTotals(context.Context, MonthTotalsRange) (MonthActivityTotals, error)
	Tombstone(context.Context, int64) error
	SearchRecords(context.Context, RecordSearchOptions) (services.PaginatedList[JournalRecord], error)
	TransactionsByRecordIDs(context.Context, []int64) ([]Transaction, error)
	BulkCategorize(context.Context, []int64, int64) (int, error)
	BulkUpdateTags(context.Context, []int64, []int64, []int64) (int, error)
	BulkReassignAccount(context.Context, []int64, int64) (int, error)
	BulkUpdateStatuses(context.Context, []int64, *PostingStatus, *ReconciliationStatus) (int, error)
	ListMissingAmountUSDRecords(context.Context) ([]AmountUSDBackfillRecord, error)
	BatchSetAmountUSD(context.Context, []AmountUSDBackfillUpdate) error
}

// AccountReferenceValidator resolves active account references for transaction validation.
type AccountReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, accounts.ReferenceOptions) (map[int64]accounts.Reference, error)
	ValidateActiveReference(context.Context, int64, accounts.ReferenceOptions) (accounts.Reference, error)
}

// CategoryReferenceValidator resolves active category references for transaction validation.
type CategoryReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, categories.ReferenceOptions) (map[int64]categories.Reference, error)
	ValidateActiveReference(context.Context, int64, categories.ReferenceOptions) (categories.Reference, error)
}

// TagReferenceValidator resolves active tag references for transaction validation.
type TagReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64, tags.ReferenceOptions) (map[int64]tags.Reference, error)
}

// MemberReferenceValidator resolves active household-member references for transaction validation.
type MemberReferenceValidator interface {
	ValidateActiveReferences(context.Context, []int64) (map[int64]members.Reference, error)
}

// AmountUSDDeriver derives signed USD amounts for generated journal records.
type AmountUSDDeriver interface {
	SignedAmountUSD(context.Context, string, values.Decimal, values.CivilDate) (*values.Decimal, error)
}

// ReferenceSerializer serializes dependent writes with dictionary deletes.
type ReferenceSerializer interface {
	SerializeReferenceOperation(func() error) error
}

// Service owns transaction, journal record, and bulk record use cases.
type Service struct {
	repo                 Repository
	accounts             AccountReferenceValidator
	categories           CategoryReferenceValidator
	tags                 TagReferenceValidator
	members              MemberReferenceValidator
	amountUSDDeriver     AmountUSDDeriver
	refs                 ReferenceSerializer
	currencyUsageChanged func()
}

// NewService creates a transaction service backed by repositories.
func NewService(
	repo Repository,
	accounts AccountReferenceValidator,
	categories CategoryReferenceValidator,
	tags TagReferenceValidator,
	members MemberReferenceValidator,
	amountUSDDeriver AmountUSDDeriver,
	refs ReferenceSerializer,
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
		currencyUsageChanged: currencyUsageChanged,
	}
}

type semanticDictionaries struct {
	accounts   map[int64]accounts.Reference
	categories map[int64]categories.Reference
}

// Create validates and creates a transaction and its journal records.
func (s *Service) Create(ctx context.Context, input CreateInput) (Transaction, error) {
	fillMissingPendingDates(&input)
	if err := validateTransactionInput(input); err != nil {
		return Transaction{}, err
	}
	if err := s.inferMissingAmountUSD(ctx, &input); err != nil {
		return Transaction{}, err
	}

	var transaction Transaction
	if err := s.refs.SerializeReferenceOperation(func() error {
		if err := s.validateInputClassification(ctx, input); err != nil {
			return err
		}
		created, err := s.repo.Create(ctx, input)
		if errors.Is(err, services.ErrNotFound) || errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("transaction references missing or inactive resource")
		}
		if err != nil {
			return err
		}
		classified, err := classifyTransaction(created)
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

// Replace validates and replaces a transaction and its journal records.
func (s *Service) Replace(ctx context.Context, id int64, input CreateInput) (Transaction, error) {
	if id <= 0 {
		return Transaction{}, services.InvalidRequest("transaction_id must be positive")
	}
	fillMissingPendingDates(&input)
	if err := validateTransactionInput(input); err != nil {
		return Transaction{}, err
	}
	if err := s.inferMissingAmountUSD(ctx, &input); err != nil {
		return Transaction{}, err
	}

	var transaction Transaction
	if err := s.refs.SerializeReferenceOperation(func() error {
		if err := s.validateInputClassification(ctx, input); err != nil {
			return err
		}
		replaced, err := s.repo.Replace(ctx, id, input)
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("transaction references missing or inactive resource")
		}
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("transaction not found")
		}
		if err != nil {
			return err
		}
		classified, err := classifyTransaction(replaced)
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
		lookupDate := input.InitiatedDate
		if input.Records[index].PostedDate != nil {
			lookupDate = values.CivilDateFromTime(*input.Records[index].PostedDate)
		}
		amountUSD, err := s.amountUSDDeriver.SignedAmountUSD(
			ctx,
			input.Records[index].Currency,
			input.Records[index].Amount,
			lookupDate,
		)
		if err != nil {
			return err
		}
		input.Records[index].AmountUSD = amountUSD
	}

	return nil
}

// BackfillMissingAmountUSD fills unresolved journal records when amount USD can be derived.
func (s *Service) BackfillMissingAmountUSD(ctx context.Context) error {
	if s.amountUSDDeriver == nil {
		return errors.New("transactions: amount USD deriver is not configured")
	}

	records, err := s.repo.ListMissingAmountUSDRecords(ctx)
	if err != nil {
		return err
	}
	updates := make([]AmountUSDBackfillUpdate, 0, len(records))
	for _, record := range records {
		amountUSD, err := s.amountUSDDeriver.SignedAmountUSD(ctx, record.Currency, record.Amount, record.LookupDate)
		if err != nil {
			return err
		}
		if amountUSD == nil {
			continue
		}
		updates = append(updates, AmountUSDBackfillUpdate{
			RecordID:  record.RecordID,
			AmountUSD: *amountUSD,
		})
	}
	if len(updates) == 0 {
		return nil
	}

	return s.repo.BatchSetAmountUSD(ctx, updates)
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

	return classifyTransaction(transaction)
}

// List returns transactions with nested journal records.
func (s *Service) List(ctx context.Context, opts ListOptions) (ListResult, error) {
	validatedOpts, err := validateTransactionListOptions(opts)
	if err != nil {
		return ListResult{}, err
	}
	if err := s.validateTransactionListFilterReferences(ctx, validatedOpts); err != nil {
		return ListResult{}, err
	}
	transactions, err := s.repo.List(ctx, validatedOpts)
	if err != nil {
		return ListResult{}, err
	}
	for index := range transactions.Items {
		classified, err := classifyTransaction(transactions.Items[index])
		if err != nil {
			return ListResult{}, err
		}
		transactions.Items[index] = classified
	}

	return transactions, nil
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
	if err := validatePositiveIDs("account_id", opts.AccountIDs); err != nil {
		return ListOptions{}, err
	}
	if err := validatePositiveIDs("category_id", opts.CategoryIDs); err != nil {
		return ListOptions{}, err
	}
	if err := validatePositiveIDs("tag_id", opts.TagIDs); err != nil {
		return ListOptions{}, err
	}
	if err := validatePositiveIDs("member_id", opts.MemberIDs); err != nil {
		return ListOptions{}, err
	}
	for _, status := range opts.PostingStatuses {
		if err := validatePostingStatus(0, status); err != nil {
			return ListOptions{}, services.InvalidRequest("posting_status values must be pending, posted, or cancelled")
		}
	}
	for _, class := range opts.TransactionClasses {
		if !validTransactionClass(class) {
			return ListOptions{}, services.InvalidRequest("transaction_class values must be spend, income, refund, transfer, currency_exchange, adjustment, fx_gain_loss, or mixed")
		}
	}
	if opts.Search != nil && *opts.Search == "" {
		return ListOptions{}, services.InvalidRequest("search must be non-empty")
	}

	var err error
	if opts.AmountMin, err = parseTransactionListDecimal("amount_min", opts.AmountMinText); err != nil {
		return ListOptions{}, err
	}
	if opts.AmountMax, err = parseTransactionListDecimal("amount_max", opts.AmountMaxText); err != nil {
		return ListOptions{}, err
	}
	if opts.AmountUSDMin, err = parseTransactionListDecimal("amount_usd_min", opts.AmountUSDMinText); err != nil {
		return ListOptions{}, err
	}
	if opts.AmountUSDMax, err = parseTransactionListDecimal("amount_usd_max", opts.AmountUSDMaxText); err != nil {
		return ListOptions{}, err
	}

	return opts, nil
}

func (s *Service) validateTransactionListFilterReferences(ctx context.Context, opts ListOptions) error {
	if _, err := s.accounts.ValidateActiveReferences(ctx, opts.AccountIDs, accounts.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidTransactionFilterReferenceError()
		}
		return err
	}
	if _, err := s.categories.ValidateActiveReferences(ctx, opts.CategoryIDs, categories.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidTransactionFilterReferenceError()
		}
		return err
	}
	if _, err := s.tags.ValidateActiveReferences(ctx, opts.TagIDs, tags.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidTransactionFilterReferenceError()
		}
		return err
	}
	if _, err := s.members.ValidateActiveReferences(ctx, opts.MemberIDs); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidTransactionFilterReferenceError()
		}
		return err
	}

	return nil
}

func parseTransactionListDecimal(name string, value *string) (*values.Decimal, error) {
	if value == nil {
		return nil, nil
	}
	parsed, err := values.ParseDecimal(*value)
	if err != nil {
		return nil, services.InvalidRequest(name + " must be a decimal with at most 10 integer digits and 8 fractional digits")
	}

	return &parsed, nil
}

func validTransactionClass(class TransactionClass) bool {
	switch class {
	case TransactionClassSpend,
		TransactionClassIncome,
		TransactionClassRefund,
		TransactionClassTransfer,
		TransactionClassCurrencyExchange,
		TransactionClassAdjustment,
		TransactionClassFXGainLoss,
		TransactionClassMixed:
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

	return s.repo.SearchRecords(ctx, opts)
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

	return s.repo.SearchRecords(ctx, opts)
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
	if err := s.refs.SerializeReferenceOperation(func() error {
		if err := s.validateBulkCategorizeClassification(ctx, recordIDs, categoryID); err != nil {
			return err
		}
		updated, err := s.repo.BulkCategorize(ctx, recordIDs, categoryID)
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("records or category missing or inactive resource")
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
	if err := s.refs.SerializeReferenceOperation(func() error {
		tagIDs := append(append([]int64{}, addTagIDs...), removeTagIDs...)
		if _, err := s.tags.ValidateActiveReferences(ctx, tagIDs, tags.ReferenceOptions{AllowHidden: true}); err != nil {
			if errors.Is(err, services.ErrInvalidReference) {
				return services.InvalidRequest("records or tags missing or inactive resource")
			}
			return err
		}
		updated, err := s.repo.BulkUpdateTags(ctx, recordIDs, addTagIDs, removeTagIDs)
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("records or tags missing or inactive resource")
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
func (s *Service) BulkReassignAccount(ctx context.Context, recordIDs []int64, accountID int64) (BulkRecordOperationResponse, error) {
	if err := validateRecordSelection(recordIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if accountID <= 0 {
		return BulkRecordOperationResponse{}, services.InvalidRequest("account_id must be positive")
	}
	var count int
	if err := s.refs.SerializeReferenceOperation(func() error {
		if err := s.validateBulkReassignAccountClassification(ctx, recordIDs, accountID); err != nil {
			return err
		}
		updated, err := s.repo.BulkReassignAccount(ctx, recordIDs, accountID)
		if errors.Is(err, services.ErrInvalidReference) {
			return services.InvalidRequest("records or account missing or inactive resource")
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

// BulkUpdateStatuses updates posting and reconciliation statuses on selected journal records.
func (s *Service) BulkUpdateStatuses(
	ctx context.Context,
	recordIDs []int64,
	postingStatus *PostingStatus,
	reconciliationStatus *ReconciliationStatus,
) (BulkRecordOperationResponse, error) {
	if err := validateRecordSelection(recordIDs); err != nil {
		return BulkRecordOperationResponse{}, err
	}
	if postingStatus == nil && reconciliationStatus == nil {
		return BulkRecordOperationResponse{}, services.InvalidRequest("posting_status or reconciliation_status is required")
	}
	if postingStatus != nil {
		switch *postingStatus {
		case PostingStatusPending, PostingStatusPosted, PostingStatusCancelled:
		default:
			return BulkRecordOperationResponse{}, services.InvalidRequest("posting_status must be pending, posted, or cancelled")
		}
	}
	if reconciliationStatus != nil {
		switch *reconciliationStatus {
		case ReconciliationStatusReconciled, ReconciliationStatusUnreconciled:
		default:
			return BulkRecordOperationResponse{}, services.InvalidRequest("reconciliation_status must be reconciled or unreconciled")
		}
	}

	count, err := s.repo.BulkUpdateStatuses(ctx, recordIDs, postingStatus, reconciliationStatus)
	if errors.Is(err, services.ErrInvalidReference) {
		return BulkRecordOperationResponse{}, services.InvalidRequest("records missing or inactive resource")
	}
	if err != nil {
		return BulkRecordOperationResponse{}, err
	}

	return bulkRecordOperationResponse(recordIDs, count), nil
}

func (s *Service) validateInputClassification(ctx context.Context, input CreateInput) error {
	dictionaries, err := s.semanticDictionaries(ctx, input.Records)
	if err != nil {
		return err
	}
	records := make([]SemanticRecord, 0, len(input.Records))
	for _, record := range input.Records {
		accountReference, ok := dictionaries.accounts[record.AccountID]
		if !ok {
			return invalidTransactionReferenceError()
		}
		categoryReference, ok := dictionaries.categories[record.CategoryID]
		if !ok {
			return invalidTransactionReferenceError()
		}
		records = append(records, SemanticRecord{
			Currency:       record.Currency,
			Amount:         record.Amount,
			AccountType:    accountReference.AccountType,
			EconomicIntent: categoryReference.EconomicIntent,
		})
	}
	_, err = classifySemanticRecords(records)
	return err
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
				record.EconomicIntent = categoryReference.EconomicIntent
				found[record.ID] = struct{}{}
			}
		}
		if err := validateTransactionClassification(affected[transactionIndex]); err != nil {
			return err
		}
	}
	if len(found) != len(selected) {
		return invalidBulkCategoryReferenceError()
	}

	return nil
}

func (s *Service) validateBulkReassignAccountClassification(ctx context.Context, recordIDs []int64, accountID int64) error {
	accountReference, err := s.accounts.ValidateActiveReference(ctx, accountID, accounts.ReferenceOptions{AllowHidden: true})
	if errors.Is(err, services.ErrInvalidReference) {
		return invalidBulkAccountReferenceError()
	}
	if err != nil {
		return err
	}
	affected, err := s.repo.TransactionsByRecordIDs(ctx, recordIDs)
	if errors.Is(err, services.ErrInvalidReference) {
		return invalidBulkAccountReferenceError()
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
				record.AccountID = accountID
				record.AccountType = accountReference.AccountType
				found[record.ID] = struct{}{}
			}
		}
		if err := validateTransactionClassification(affected[transactionIndex]); err != nil {
			return err
		}
	}
	if len(found) != len(selected) {
		return invalidBulkAccountReferenceError()
	}

	return nil
}

func (s *Service) semanticDictionaries(ctx context.Context, records []JournalRecordInput) (semanticDictionaries, error) {
	accountIDs := make([]int64, 0, len(records))
	categoryIDs := make([]int64, 0, len(records))
	memberIDs := []int64{}
	tagIDs := []int64{}
	for _, record := range records {
		accountIDs = append(accountIDs, record.AccountID)
		categoryIDs = append(categoryIDs, record.CategoryID)
		if record.MemberID != nil {
			memberIDs = append(memberIDs, *record.MemberID)
		}
		tagIDs = append(tagIDs, record.TagIDs...)
	}

	accountReferences, err := s.accounts.ValidateActiveReferences(ctx, accountIDs, accounts.ReferenceOptions{AllowHidden: true})
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
	if _, err := s.members.ValidateActiveReferences(ctx, memberIDs); err != nil {
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
		accounts:   accountReferences,
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

func fillMissingPendingDates(input *CreateInput) {
	defaultPendingDate := input.InitiatedDate.Time()
	for index := range input.Records {
		if input.Records[index].PendingDate == nil {
			input.Records[index].PendingDate = &defaultPendingDate
		}
	}
}

func validateTransactionInput(input CreateInput) error {
	if len(input.Records) < 2 {
		return services.InvalidRequest("transaction requires at least two records")
	}

	balances := map[string]values.Decimal{}
	for index, record := range input.Records {
		if err := validateJournalRecord(index, record); err != nil {
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

func validateJournalRecord(index int, record JournalRecordInput) error {
	if record.AccountID <= 0 {
		return services.InvalidRequest(indexedField(index, "account_id") + " must be positive")
	}
	if record.MemberID != nil && *record.MemberID <= 0 {
		return services.InvalidRequest(indexedField(index, "member_id") + " must be positive")
	}
	if record.CategoryID <= 0 {
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
	if err := validatePostingStatus(index, record.PostingStatus); err != nil {
		return err
	}
	if err := validateReconciliationStatus(index, record.ReconciliationStatus); err != nil {
		return err
	}
	if record.Source != SourceManual {
		return services.InvalidRequest(indexedField(index, "source") + " must be manual")
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
	if opts.PostingStatus != nil {
		if err := validatePostingStatus(0, *opts.PostingStatus); err != nil {
			return services.InvalidRequest("posting_status must be pending, posted, or cancelled")
		}
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
	if _, err := s.members.ValidateActiveReferences(ctx, optionalID(opts.MemberID)); err != nil {
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

func validatePositiveIDs(name string, ids []int64) error {
	for _, id := range ids {
		if id <= 0 {
			return services.InvalidRequest(name + " values must be positive")
		}
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

func validatePostingStatus(index int, status PostingStatus) error {
	switch status {
	case PostingStatusPending, PostingStatusPosted, PostingStatusCancelled:
		return nil
	default:
		return services.InvalidRequest(indexedField(index, "posting_status") + " must be pending, posted, or cancelled")
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
