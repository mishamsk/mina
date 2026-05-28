package controllers

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/store"
)

// ExchangeRateListOptions controls exchange rate list filters and visibility.
type ExchangeRateListOptions struct {
	FromCurrency      *string
	ToCurrency        *string
	EffectiveDate     *string
	IncludeTombstoned bool
}

// ExchangeRateController owns exchange rate use cases and validation.
type ExchangeRateController struct {
	store *store.ExchangeRateStore
}

// NewExchangeRateController creates an ExchangeRateController backed by db.
func NewExchangeRateController(db *sql.DB) *ExchangeRateController {
	return &ExchangeRateController{
		store: store.NewExchangeRateStore(db),
	}
}

// Create validates and creates an exchange rate.
func (c *ExchangeRateController) Create(ctx context.Context, req models.CreateExchangeRateRequest) (models.ExchangeRate, error) {
	if err := validateCurrencyCode("from_currency", req.FromCurrency); err != nil {
		return models.ExchangeRate{}, err
	}
	if err := validateCurrencyCode("to_currency", req.ToCurrency); err != nil {
		return models.ExchangeRate{}, err
	}
	if err := validatePositiveDecimal("rate", req.Rate); err != nil {
		return models.ExchangeRate{}, err
	}
	if err := validateEffectiveDate(req.EffectiveDate); err != nil {
		return models.ExchangeRate{}, err
	}

	rate, err := c.store.Create(ctx, req)
	if errors.Is(err, store.ErrConflict) {
		return models.ExchangeRate{}, conflict("active exchange rate already exists for currency pair and effective date")
	}
	if err != nil {
		return models.ExchangeRate{}, err
	}

	return rate, nil
}

// Get returns an exchange rate by ID.
func (c *ExchangeRateController) Get(ctx context.Context, id int64, includeTombstoned bool) (models.ExchangeRate, error) {
	if id <= 0 {
		return models.ExchangeRate{}, invalidRequest("exchange_rate_id must be positive")
	}

	rate, err := c.store.Get(ctx, id, includeTombstoned)
	if errors.Is(err, store.ErrNotFound) {
		return models.ExchangeRate{}, notFound("exchange rate not found")
	}
	if err != nil {
		return models.ExchangeRate{}, err
	}

	return rate, nil
}

// List returns exchange rates using exact filters.
func (c *ExchangeRateController) List(ctx context.Context, opts ExchangeRateListOptions) ([]models.ExchangeRate, error) {
	if opts.FromCurrency != nil {
		if err := validateCurrencyCode("from_currency", *opts.FromCurrency); err != nil {
			return nil, err
		}
	}
	if opts.ToCurrency != nil {
		if err := validateCurrencyCode("to_currency", *opts.ToCurrency); err != nil {
			return nil, err
		}
	}
	if opts.EffectiveDate != nil {
		if err := validateEffectiveDate(*opts.EffectiveDate); err != nil {
			return nil, err
		}
	}

	return c.store.List(ctx, store.ExchangeRateListOptions{
		FromCurrency:      opts.FromCurrency,
		ToCurrency:        opts.ToCurrency,
		EffectiveDate:     opts.EffectiveDate,
		IncludeTombstoned: opts.IncludeTombstoned,
	})
}

// UpdateRate validates and updates an exchange rate value.
func (c *ExchangeRateController) UpdateRate(ctx context.Context, id int64, req models.UpdateExchangeRateRequest) (models.ExchangeRate, error) {
	if id <= 0 {
		return models.ExchangeRate{}, invalidRequest("exchange_rate_id must be positive")
	}
	if err := validatePositiveDecimal("rate", req.Rate); err != nil {
		return models.ExchangeRate{}, err
	}

	rate, err := c.store.UpdateRate(ctx, id, req.Rate)
	if errors.Is(err, store.ErrNotFound) {
		return models.ExchangeRate{}, notFound("exchange rate not found")
	}
	if err != nil {
		return models.ExchangeRate{}, err
	}

	return rate, nil
}

// Delete tombstones an exchange rate.
func (c *ExchangeRateController) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return invalidRequest("exchange_rate_id must be positive")
	}

	if err := c.store.Tombstone(ctx, id); errors.Is(err, store.ErrNotFound) {
		return notFound("exchange rate not found")
	} else if err != nil {
		return err
	}

	return nil
}

func validateCurrencyCode(name string, currency string) error {
	if len(currency) != 3 {
		return invalidRequest(name + " must be a three-letter uppercase code")
	}
	for i := range currency {
		if currency[i] < 'A' || currency[i] > 'Z' {
			return invalidRequest(name + " must be a three-letter uppercase code")
		}
	}

	return nil
}

func validatePositiveDecimal(name string, value string) error {
	if strings.TrimSpace(value) != value || value == "" {
		return invalidRequest(name + " must be a positive decimal")
	}

	parts := strings.Split(value, ".")
	if len(parts) > 2 || parts[0] == "" {
		return invalidRequest(name + " must be a positive decimal")
	}
	if len(parts) == 2 && (parts[1] == "" || len(parts[1]) > 8) {
		return invalidRequest(name + " must be a positive decimal with at most 8 fractional digits")
	}

	digitCount := 0
	hasNonZero := false
	for _, part := range parts {
		for i := range part {
			if part[i] < '0' || part[i] > '9' {
				return invalidRequest(name + " must be a positive decimal")
			}
			if part[i] != '0' {
				hasNonZero = true
			}
			digitCount++
		}
	}
	if digitCount > 18 {
		return invalidRequest(name + " must have at most 18 digits")
	}
	if !hasNonZero {
		return invalidRequest(name + " must be greater than zero")
	}

	return nil
}
