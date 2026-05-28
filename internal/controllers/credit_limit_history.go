package controllers

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/store"
)

// CreditLimitHistoryListOptions controls credit limit history list visibility.
type CreditLimitHistoryListOptions struct {
	IncludeTombstoned bool
	List              models.ListOptions
}

// CreditLimitHistoryController owns credit limit history use cases and validation.
type CreditLimitHistoryController struct {
	store *store.CreditLimitHistoryStore
}

// NewCreditLimitHistoryController creates a CreditLimitHistoryController backed by db.
func NewCreditLimitHistoryController(db *sql.DB) *CreditLimitHistoryController {
	return &CreditLimitHistoryController{
		store: store.NewCreditLimitHistoryStore(db),
	}
}

// Create validates and creates a credit limit history entry for an account.
func (c *CreditLimitHistoryController) Create(ctx context.Context, accountID int64, req models.CreateCreditLimitHistoryRequest) (models.CreditLimitHistory, error) {
	if accountID <= 0 {
		return models.CreditLimitHistory{}, invalidRequest("account_id must be positive")
	}
	if err := validateCreditLimit(req.CreditLimit); err != nil {
		return models.CreditLimitHistory{}, err
	}
	if err := validateEffectiveDate(req.EffectiveDate); err != nil {
		return models.CreditLimitHistory{}, err
	}

	history, err := c.store.Create(ctx, accountID, req)
	if errors.Is(err, store.ErrNotFound) {
		return models.CreditLimitHistory{}, notFound("account not found")
	}
	if errors.Is(err, store.ErrConflict) {
		return models.CreditLimitHistory{}, conflict("active credit limit history already exists for account and effective date")
	}
	if err != nil {
		return models.CreditLimitHistory{}, err
	}

	return history, nil
}

// Get returns a credit limit history entry by ID.
func (c *CreditLimitHistoryController) Get(ctx context.Context, id int64, includeTombstoned bool) (models.CreditLimitHistory, error) {
	if id <= 0 {
		return models.CreditLimitHistory{}, invalidRequest("credit_limit_history_id must be positive")
	}

	history, err := c.store.Get(ctx, id, includeTombstoned)
	if errors.Is(err, store.ErrNotFound) {
		return models.CreditLimitHistory{}, notFound("credit limit history not found")
	}
	if err != nil {
		return models.CreditLimitHistory{}, err
	}

	return history, nil
}

// ListByAccount returns credit limit history for an account.
func (c *CreditLimitHistoryController) ListByAccount(ctx context.Context, accountID int64, opts CreditLimitHistoryListOptions) ([]models.CreditLimitHistory, error) {
	if accountID <= 0 {
		return nil, invalidRequest("account_id must be positive")
	}

	history, err := c.store.ListByAccount(ctx, accountID, store.CreditLimitHistoryListOptions{
		IncludeTombstoned: opts.IncludeTombstoned,
		List:              opts.List,
	})
	if errors.Is(err, store.ErrNotFound) {
		return nil, notFound("account not found")
	}
	if err != nil {
		return nil, err
	}

	return history, nil
}

// Delete tombstones a credit limit history entry.
func (c *CreditLimitHistoryController) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return invalidRequest("credit_limit_history_id must be positive")
	}

	if err := c.store.Tombstone(ctx, id); errors.Is(err, store.ErrNotFound) {
		return notFound("credit limit history not found")
	} else if err != nil {
		return err
	}

	return nil
}

func validateEffectiveDate(effectiveDate string) error {
	if len(effectiveDate) != len("2006-01-02") {
		return invalidRequest("effective_date must use YYYY-MM-DD format")
	}
	parsed, err := time.Parse("2006-01-02", effectiveDate)
	if err != nil || parsed.Format("2006-01-02") != effectiveDate {
		return invalidRequest("effective_date must use YYYY-MM-DD format")
	}

	return nil
}

func validateCreditLimit(creditLimit string) error {
	if strings.TrimSpace(creditLimit) != creditLimit || creditLimit == "" {
		return invalidRequest("credit_limit must be a non-negative decimal")
	}

	parts := strings.Split(creditLimit, ".")
	if len(parts) > 2 || parts[0] == "" {
		return invalidRequest("credit_limit must be a non-negative decimal")
	}
	if len(parts) == 2 && (parts[1] == "" || len(parts[1]) > 8) {
		return invalidRequest("credit_limit must be a non-negative decimal with at most 8 fractional digits")
	}

	digitCount := 0
	for _, part := range parts {
		for i := range part {
			if part[i] < '0' || part[i] > '9' {
				return invalidRequest("credit_limit must be a non-negative decimal")
			}
			digitCount++
		}
	}
	if digitCount > 18 {
		return invalidRequest("credit_limit must have at most 18 digits")
	}

	return nil
}
