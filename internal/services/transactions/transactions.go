package transactions

import (
	"context"
	"errors"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
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
	ID            int64
	InitiatedDate string
	CreatedAt     string
	TombstonedAt  *string
	Records       []JournalRecord
}

// JournalRecord is one debit or credit entry inside a transaction.
type JournalRecord struct {
	ID                   int64
	TransactionID        int64
	AccountID            int64
	MemberID             *int64
	Currency             string
	Amount               string
	AmountUSD            string
	CategoryID           int64
	TagIDs               []int64
	Memo                 *string
	PendingDate          *string
	PostedDate           *string
	PostingStatus        PostingStatus
	ReconciliationStatus ReconciliationStatus
	Source               Source
	ExternalID           *string
	ExternalSystem       *string
	CreatedAt            string
	UpdatedAt            string
	TombstonedAt         *string
}

// CreateInput contains fields for creating or replacing a transaction.
type CreateInput struct {
	InitiatedDate string
	Records       []JournalRecordInput
}

// JournalRecordInput is one record inside a transaction write request.
type JournalRecordInput struct {
	AccountID            int64
	MemberID             *int64
	Currency             string
	Amount               string
	AmountUSD            string
	CategoryID           int64
	TagIDs               []int64
	Memo                 *string
	PendingDate          *string
	PostedDate           *string
	PostingStatus        PostingStatus
	ReconciliationStatus ReconciliationStatus
	Source               Source
	ExternalID           *string
	ExternalSystem       *string
}

// RecordSearchOptions controls journal record search filters.
type RecordSearchOptions struct {
	AccountID            *int64
	CategoryID           *int64
	MemberID             *int64
	TagID                *int64
	PostingStatus        *PostingStatus
	ReconciliationStatus *ReconciliationStatus
	AmountMin            *string
	AmountMax            *string
	AmountUSDMin         *string
	AmountUSDMax         *string
	InitiatedDateFrom    *string
	InitiatedDateTo      *string
	PendingDateFrom      *string
	PendingDateTo        *string
	PostedDateFrom       *string
	PostedDateTo         *string
	MemoContains         *string
}

// BulkRecordOperationResponse reports the selected and updated record counts.
type BulkRecordOperationResponse struct {
	RecordIDs    []int64
	UpdatedCount int
}

// Repository persists transaction and journal record state.
type Repository interface {
	Create(context.Context, CreateInput) (Transaction, error)
	Replace(context.Context, int64, CreateInput) (Transaction, error)
	Get(context.Context, int64) (Transaction, error)
	List(context.Context) ([]Transaction, error)
	Tombstone(context.Context, int64) error
	SearchRecords(context.Context, RecordSearchOptions) ([]JournalRecord, error)
	BulkCategorize(context.Context, []int64, int64) (int, error)
	BulkUpdateTags(context.Context, []int64, []int64, []int64) (int, error)
	BulkReassignAccount(context.Context, []int64, int64) (int, error)
	BulkUpdateStatuses(context.Context, []int64, *PostingStatus, *ReconciliationStatus) (int, error)
}

// Service owns transaction, journal record, and bulk record use cases.
type Service struct {
	repo Repository
}

// NewService creates a transaction service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Create validates and creates a transaction and its journal records.
func (s *Service) Create(ctx context.Context, input CreateInput) (Transaction, error) {
	if err := validateTransactionInput(input.InitiatedDate, input.Records); err != nil {
		return Transaction{}, err
	}

	transaction, err := s.repo.Create(ctx, input)
	if errors.Is(err, services.ErrNotFound) || errors.Is(err, services.ErrInvalidReference) {
		return Transaction{}, services.InvalidRequest("transaction references missing or inactive resource")
	}
	if err != nil {
		return Transaction{}, err
	}

	return transaction, nil
}

// Replace validates and replaces a transaction and its journal records.
func (s *Service) Replace(ctx context.Context, id int64, input CreateInput) (Transaction, error) {
	if id <= 0 {
		return Transaction{}, services.InvalidRequest("transaction_id must be positive")
	}
	if err := validateTransactionInput(input.InitiatedDate, input.Records); err != nil {
		return Transaction{}, err
	}

	transaction, err := s.repo.Replace(ctx, id, input)
	if errors.Is(err, services.ErrInvalidReference) {
		return Transaction{}, services.InvalidRequest("transaction references missing or inactive resource")
	}
	if errors.Is(err, services.ErrNotFound) {
		return Transaction{}, services.NotFound("transaction not found")
	}
	if err != nil {
		return Transaction{}, err
	}

	return transaction, nil
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

	return transaction, nil
}

// List returns transactions with nested journal records.
func (s *Service) List(ctx context.Context) ([]Transaction, error) {
	return s.repo.List(ctx)
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
func (s *Service) SearchRecords(ctx context.Context, opts RecordSearchOptions) ([]JournalRecord, error) {
	if err := validateRecordSearchOptions(opts); err != nil {
		return nil, err
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

	count, err := s.repo.BulkCategorize(ctx, recordIDs, categoryID)
	if errors.Is(err, services.ErrInvalidReference) {
		return BulkRecordOperationResponse{}, services.InvalidRequest("records or category missing or inactive resource")
	}
	if err != nil {
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

	count, err := s.repo.BulkUpdateTags(ctx, recordIDs, addTagIDs, removeTagIDs)
	if errors.Is(err, services.ErrInvalidReference) {
		return BulkRecordOperationResponse{}, services.InvalidRequest("records or tags missing or inactive resource")
	}
	if err != nil {
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

	count, err := s.repo.BulkReassignAccount(ctx, recordIDs, accountID)
	if errors.Is(err, services.ErrInvalidReference) {
		return BulkRecordOperationResponse{}, services.InvalidRequest("records or account missing or inactive resource")
	}
	if err != nil {
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

func validateTransactionInput(initiatedDate string, records []JournalRecordInput) error {
	if err := validateEffectiveDate(initiatedDate); err != nil {
		return services.InvalidRequest("initiated_date must use YYYY-MM-DD format")
	}
	if len(records) < 2 {
		return services.InvalidRequest("transaction requires at least two records")
	}

	balanceUSD := big.NewInt(0)
	for index, record := range records {
		amountUSD, err := validateJournalRecord(index, record)
		if err != nil {
			return err
		}
		balanceUSD.Add(balanceUSD, amountUSD)
	}
	if balanceUSD.Sign() != 0 {
		return services.InvalidRequest("transaction records must balance to zero amount_usd")
	}

	return nil
}

func validateJournalRecord(index int, record JournalRecordInput) (*big.Int, error) {
	if record.AccountID <= 0 {
		return nil, services.InvalidRequest(indexedField(index, "account_id") + " must be positive")
	}
	if record.MemberID != nil && *record.MemberID <= 0 {
		return nil, services.InvalidRequest(indexedField(index, "member_id") + " must be positive")
	}
	if record.CategoryID <= 0 {
		return nil, services.InvalidRequest(indexedField(index, "category_id") + " must be positive")
	}

	seenTags := map[int64]struct{}{}
	for _, tagID := range record.TagIDs {
		if tagID <= 0 {
			return nil, services.InvalidRequest(indexedField(index, "tag_ids") + " values must be positive")
		}
		if _, ok := seenTags[tagID]; ok {
			return nil, services.InvalidRequest(indexedField(index, "tag_ids") + " values must be unique")
		}
		seenTags[tagID] = struct{}{}
	}

	if err := validateCurrency(record.Currency); err != nil {
		return nil, services.InvalidRequest(indexedField(index, "currency") + " must be a three-letter uppercase code")
	}
	amount, err := parseSignedDecimal(record.Amount)
	if err != nil || amount.Sign() == 0 {
		return nil, services.InvalidRequest(indexedField(index, "amount") + " must be a non-zero decimal with at most 10 integer digits and 8 fractional digits")
	}
	amountUSD, err := parseSignedDecimal(record.AmountUSD)
	if err != nil || amountUSD.Sign() == 0 {
		return nil, services.InvalidRequest(indexedField(index, "amount_usd") + " must be a non-zero decimal with at most 10 integer digits and 8 fractional digits")
	}
	if err := validateOptionalDate(indexedField(index, "pending_date"), record.PendingDate); err != nil {
		return nil, err
	}
	if err := validateOptionalDate(indexedField(index, "posted_date"), record.PostedDate); err != nil {
		return nil, err
	}
	if err := validatePostingStatus(index, record.PostingStatus); err != nil {
		return nil, err
	}
	if err := validateReconciliationStatus(index, record.ReconciliationStatus); err != nil {
		return nil, err
	}
	if record.Source != SourceManual {
		return nil, services.InvalidRequest(indexedField(index, "source") + " must be manual")
	}
	if record.Memo != nil && strings.TrimSpace(*record.Memo) != *record.Memo {
		return nil, services.InvalidRequest(indexedField(index, "memo") + " must not have leading or trailing whitespace")
	}
	if err := validateExternalIdentifiers(record.ExternalID, record.ExternalSystem); err != nil {
		return nil, services.InvalidRequest(indexedField(index, "external_id") + " and " + indexedField(index, "external_system") + " must be provided together without surrounding whitespace")
	}

	return amountUSD, nil
}

func validateRecordSearchOptions(opts RecordSearchOptions) error {
	if opts.AccountID != nil && *opts.AccountID <= 0 {
		return services.InvalidRequest("account_id must be positive")
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
	for name, value := range map[string]*string{
		"amount_min":          opts.AmountMin,
		"amount_max":          opts.AmountMax,
		"amount_usd_min":      opts.AmountUSDMin,
		"amount_usd_max":      opts.AmountUSDMax,
		"initiated_date_from": opts.InitiatedDateFrom,
		"initiated_date_to":   opts.InitiatedDateTo,
		"pending_date_from":   opts.PendingDateFrom,
		"pending_date_to":     opts.PendingDateTo,
		"posted_date_from":    opts.PostedDateFrom,
		"posted_date_to":      opts.PostedDateTo,
	} {
		if value == nil {
			continue
		}
		if strings.Contains(name, "date") {
			if err := validateEffectiveDate(*value); err != nil {
				return services.InvalidRequest(name + " must use YYYY-MM-DD format")
			}
			continue
		}
		if _, err := parseSignedDecimal(*value); err != nil {
			return services.InvalidRequest(name + " must be a decimal with at most 10 integer digits and 8 fractional digits")
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

func validateOptionalDate(name string, value *string) error {
	if value == nil {
		return nil
	}
	if err := validateEffectiveDate(*value); err != nil {
		return services.InvalidRequest(name + " must use YYYY-MM-DD format")
	}

	return nil
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
	if len(currency) != 3 {
		return errors.New("invalid currency")
	}
	for i := range currency {
		if currency[i] < 'A' || currency[i] > 'Z' {
			return errors.New("invalid currency")
		}
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

func validateEffectiveDate(effectiveDate string) error {
	if len(effectiveDate) != len("2006-01-02") {
		return errors.New("invalid date")
	}
	parsed, err := time.Parse("2006-01-02", effectiveDate)
	if err != nil || parsed.Format("2006-01-02") != effectiveDate {
		return errors.New("invalid date")
	}

	return nil
}

func parseSignedDecimal(value string) (*big.Int, error) {
	if strings.TrimSpace(value) != value || value == "" {
		return nil, errors.New("invalid decimal")
	}

	sign := 1
	if strings.HasPrefix(value, "-") {
		sign = -1
		value = strings.TrimPrefix(value, "-")
	} else if strings.HasPrefix(value, "+") {
		return nil, errors.New("invalid decimal")
	}
	if value == "" {
		return nil, errors.New("invalid decimal")
	}

	parts := strings.Split(value, ".")
	if len(parts) > 2 || parts[0] == "" {
		return nil, errors.New("invalid decimal")
	}
	if len(parts) == 2 && (parts[1] == "" || len(parts[1]) > 8) {
		return nil, errors.New("invalid decimal")
	}
	if len(parts[0]) > 10 {
		return nil, errors.New("invalid decimal")
	}

	digitCount := 0
	var digits strings.Builder
	digits.WriteString(parts[0])
	for i := range parts[0] {
		if parts[0][i] < '0' || parts[0][i] > '9' {
			return nil, errors.New("invalid decimal")
		}
		digitCount++
	}

	fracDigits := 0
	if len(parts) == 2 {
		fracDigits = len(parts[1])
		for i := range parts[1] {
			if parts[1][i] < '0' || parts[1][i] > '9' {
				return nil, errors.New("invalid decimal")
			}
			digitCount++
		}
		digits.WriteString(parts[1])
	}
	if digitCount > 18 {
		return nil, errors.New("invalid decimal")
	}
	for ; fracDigits < 8; fracDigits++ {
		digits.WriteString("0")
	}

	scaled, ok := new(big.Int).SetString(digits.String(), 10)
	if !ok {
		return nil, errors.New("invalid decimal")
	}
	if sign < 0 {
		scaled.Neg(scaled)
	}

	return scaled, nil
}
