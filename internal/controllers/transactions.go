package controllers

import (
	"context"
	"database/sql"
	"errors"
	"math/big"
	"strconv"
	"strings"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/store"
)

// TransactionController owns transaction use cases and validation.
type TransactionController struct {
	store *store.TransactionStore
}

// RecordSearchOptions controls journal record search filters.
type RecordSearchOptions struct {
	AccountID            *int64
	CategoryID           *int64
	MemberID             *int64
	TagID                *int64
	PostingStatus        *models.PostingStatus
	ReconciliationStatus *models.ReconciliationStatus
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

// NewTransactionController creates a TransactionController backed by db.
func NewTransactionController(db *sql.DB) *TransactionController {
	return &TransactionController{
		store: store.NewTransactionStore(db),
	}
}

// Create validates and creates a transaction and its journal records.
func (c *TransactionController) Create(ctx context.Context, req models.CreateTransactionRequest) (models.Transaction, error) {
	if err := c.validateTransactionRequest(ctx, req.InitiatedDate, req.Records); err != nil {
		return models.Transaction{}, err
	}

	transaction, err := c.store.Create(ctx, req)
	if errors.Is(err, store.ErrNotFound) {
		return models.Transaction{}, invalidRequest("transaction references missing or inactive resource")
	}
	if err != nil {
		return models.Transaction{}, err
	}

	return transaction, nil
}

// Replace validates and replaces a transaction and its journal records.
func (c *TransactionController) Replace(ctx context.Context, id int64, req models.UpdateTransactionRequest) (models.Transaction, error) {
	if id <= 0 {
		return models.Transaction{}, invalidRequest("transaction_id must be positive")
	}
	if err := c.validateTransactionRequest(ctx, req.InitiatedDate, req.Records); err != nil {
		return models.Transaction{}, err
	}

	transaction, err := c.store.Replace(ctx, id, req)
	if errors.Is(err, store.ErrInvalidReference) {
		return models.Transaction{}, invalidRequest("transaction references missing or inactive resource")
	}
	if errors.Is(err, store.ErrNotFound) {
		return models.Transaction{}, notFound("transaction not found")
	}
	if err != nil {
		return models.Transaction{}, err
	}

	return transaction, nil
}

// Get returns a transaction with nested journal records by ID.
func (c *TransactionController) Get(ctx context.Context, id int64) (models.Transaction, error) {
	if id <= 0 {
		return models.Transaction{}, invalidRequest("transaction_id must be positive")
	}

	transaction, err := c.store.Get(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return models.Transaction{}, notFound("transaction not found")
	}
	if err != nil {
		return models.Transaction{}, err
	}

	return transaction, nil
}

// List returns transactions with nested journal records.
func (c *TransactionController) List(ctx context.Context) ([]models.Transaction, error) {
	return c.store.List(ctx)
}

// Delete tombstones a transaction and its journal records.
func (c *TransactionController) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return invalidRequest("transaction_id must be positive")
	}

	if err := c.store.Tombstone(ctx, id); errors.Is(err, store.ErrNotFound) {
		return notFound("transaction not found")
	} else if err != nil {
		return err
	}

	return nil
}

// SearchRecords returns journal records matching validated filters.
func (c *TransactionController) SearchRecords(ctx context.Context, opts RecordSearchOptions) ([]models.JournalRecord, error) {
	if err := c.validateRecordSearchOptions(opts); err != nil {
		return nil, err
	}

	return c.store.SearchRecords(ctx, store.RecordSearchOptions(opts))
}

func (c *TransactionController) validateTransactionRequest(ctx context.Context, initiatedDate string, records []models.CreateJournalRecordRequest) error {
	if err := validateEffectiveDate(initiatedDate); err != nil {
		return invalidRequest("initiated_date must use YYYY-MM-DD format")
	}
	if len(records) < 2 {
		return invalidRequest("transaction requires at least two records")
	}

	balanceUSD := big.NewInt(0)
	for index, record := range records {
		amountUSD, err := c.validateJournalRecord(ctx, index, record)
		if err != nil {
			return err
		}
		balanceUSD.Add(balanceUSD, amountUSD)
	}
	if balanceUSD.Sign() != 0 {
		return invalidRequest("transaction records must balance to zero amount_usd")
	}

	return nil
}

func (c *TransactionController) validateJournalRecord(_ context.Context, index int, record models.CreateJournalRecordRequest) (*big.Int, error) {
	if record.AccountID <= 0 {
		return nil, invalidRequest(indexedField(index, "account_id") + " must be positive")
	}

	if record.MemberID != nil {
		if *record.MemberID <= 0 {
			return nil, invalidRequest(indexedField(index, "member_id") + " must be positive")
		}
	}

	if record.CategoryID <= 0 {
		return nil, invalidRequest(indexedField(index, "category_id") + " must be positive")
	}

	seenTags := map[int64]struct{}{}
	for _, tagID := range record.TagIDs {
		if tagID <= 0 {
			return nil, invalidRequest(indexedField(index, "tag_ids") + " values must be positive")
		}
		if _, ok := seenTags[tagID]; ok {
			return nil, invalidRequest(indexedField(index, "tag_ids") + " values must be unique")
		}
		seenTags[tagID] = struct{}{}
	}

	currency := record.Currency
	if err := validateCurrency(&currency); err != nil {
		return nil, invalidRequest(indexedField(index, "currency") + " must be a three-letter uppercase code")
	}
	amount, err := parseSignedDecimal(record.Amount)
	if err != nil || amount.Sign() == 0 {
		return nil, invalidRequest(indexedField(index, "amount") + " must be a non-zero decimal with at most 18 digits and 8 fractional digits")
	}
	amountUSD, err := parseSignedDecimal(record.AmountUSD)
	if err != nil || amountUSD.Sign() == 0 {
		return nil, invalidRequest(indexedField(index, "amount_usd") + " must be a non-zero decimal with at most 18 digits and 8 fractional digits")
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
	if record.Source != models.SourceManual {
		return nil, invalidRequest(indexedField(index, "source") + " must be manual")
	}
	if record.Memo != nil && strings.TrimSpace(*record.Memo) != *record.Memo {
		return nil, invalidRequest(indexedField(index, "memo") + " must not have leading or trailing whitespace")
	}
	if err := validateExternalIdentifiers(record.ExternalID, record.ExternalSystem); err != nil {
		return nil, invalidRequest(indexedField(index, "external_id") + " and " + indexedField(index, "external_system") + " must be provided together without surrounding whitespace")
	}

	return amountUSD, nil
}

func (c *TransactionController) validateRecordSearchOptions(opts RecordSearchOptions) error {
	if opts.AccountID != nil && *opts.AccountID <= 0 {
		return invalidRequest("account_id must be positive")
	}
	if opts.CategoryID != nil && *opts.CategoryID <= 0 {
		return invalidRequest("category_id must be positive")
	}
	if opts.MemberID != nil && *opts.MemberID <= 0 {
		return invalidRequest("member_id must be positive")
	}
	if opts.TagID != nil && *opts.TagID <= 0 {
		return invalidRequest("tag_id must be positive")
	}
	if opts.PostingStatus != nil {
		if err := validatePostingStatus(0, *opts.PostingStatus); err != nil {
			return invalidRequest("posting_status must be pending, posted, or cancelled")
		}
	}
	if opts.ReconciliationStatus != nil {
		if err := validateReconciliationStatus(0, *opts.ReconciliationStatus); err != nil {
			return invalidRequest("reconciliation_status must be reconciled or unreconciled")
		}
	}
	if opts.MemoContains != nil && *opts.MemoContains == "" {
		return invalidRequest("memo_contains must be non-empty")
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
				return invalidRequest(name + " must use YYYY-MM-DD format")
			}
			continue
		}
		if _, err := parseSignedDecimal(*value); err != nil {
			return invalidRequest(name + " must be a decimal with at most 18 digits and 8 fractional digits")
		}
	}

	return nil
}

func indexedField(index int, name string) string {
	return "records[" + strconv.Itoa(index) + "]." + name
}

func validateOptionalDate(name string, value *string) error {
	if value == nil {
		return nil
	}
	if err := validateEffectiveDate(*value); err != nil {
		return invalidRequest(name + " must use YYYY-MM-DD format")
	}

	return nil
}

func validatePostingStatus(index int, status models.PostingStatus) error {
	switch status {
	case models.PostingStatusPending, models.PostingStatusPosted, models.PostingStatusCancelled:
		return nil
	default:
		return invalidRequest(indexedField(index, "posting_status") + " must be pending, posted, or cancelled")
	}
}

func validateReconciliationStatus(index int, status models.ReconciliationStatus) error {
	switch status {
	case models.ReconciliationStatusReconciled, models.ReconciliationStatusUnreconciled:
		return nil
	default:
		return invalidRequest(indexedField(index, "reconciliation_status") + " must be reconciled or unreconciled")
	}
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

	digitCount := 0
	digits := parts[0]
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
		digits += parts[1]
	}
	if digitCount > 18 {
		return nil, errors.New("invalid decimal")
	}
	for ; fracDigits < 8; fracDigits++ {
		digits += "0"
	}

	scaled, ok := new(big.Int).SetString(digits, 10)
	if !ok {
		return nil, errors.New("invalid decimal")
	}
	if sign < 0 {
		scaled.Neg(scaled)
	}

	return scaled, nil
}
