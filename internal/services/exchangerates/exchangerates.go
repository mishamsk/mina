package exchangerates

import (
	"context"
	"errors"
	"strings"
	"time"

	"mina.local/mina/internal/services"
)

// ExchangeRate is one historical currency conversion rate.
type ExchangeRate struct {
	ID            int64
	FromCurrency  string
	ToCurrency    string
	Rate          string
	EffectiveDate string
	CreatedAt     string
	TombstonedAt  *string
}

// CreateInput contains fields for creating an exchange rate.
type CreateInput struct {
	FromCurrency  string
	ToCurrency    string
	Rate          string
	EffectiveDate string
}

// UpdateInput contains mutable exchange rate fields.
type UpdateInput struct {
	Rate string
}

// ListOptions controls exchange rate list filters and visibility.
type ListOptions struct {
	FromCurrency      *string
	ToCurrency        *string
	EffectiveDate     *string
	IncludeTombstoned bool
	List              services.ListOptions
}

// Repository persists exchange rate state.
type Repository interface {
	Create(context.Context, CreateInput) (ExchangeRate, error)
	Get(context.Context, int64, bool) (ExchangeRate, error)
	List(context.Context, ListOptions) ([]ExchangeRate, error)
	UpdateRate(context.Context, int64, string) (ExchangeRate, error)
	Tombstone(context.Context, int64) error
}

// Service owns exchange rate use cases and validation.
type Service struct {
	repo Repository
}

// NewService creates an exchange rate service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Create validates and creates an exchange rate.
func (s *Service) Create(ctx context.Context, input CreateInput) (ExchangeRate, error) {
	if err := validateCurrencyCode("from_currency", input.FromCurrency); err != nil {
		return ExchangeRate{}, err
	}
	if err := validateCurrencyCode("to_currency", input.ToCurrency); err != nil {
		return ExchangeRate{}, err
	}
	if err := validatePositiveDecimal("rate", input.Rate); err != nil {
		return ExchangeRate{}, err
	}
	if err := validateEffectiveDate(input.EffectiveDate); err != nil {
		return ExchangeRate{}, err
	}

	rate, err := s.repo.Create(ctx, input)
	if errors.Is(err, services.ErrConflict) {
		return ExchangeRate{}, services.Conflict("active exchange rate already exists for currency pair and effective date")
	}
	if err != nil {
		return ExchangeRate{}, err
	}

	return rate, nil
}

// Get returns an exchange rate by ID.
func (s *Service) Get(ctx context.Context, id int64, includeTombstoned bool) (ExchangeRate, error) {
	if id <= 0 {
		return ExchangeRate{}, services.InvalidRequest("exchange_rate_id must be positive")
	}

	rate, err := s.repo.Get(ctx, id, includeTombstoned)
	if errors.Is(err, services.ErrNotFound) {
		return ExchangeRate{}, services.NotFound("exchange rate not found")
	}
	if err != nil {
		return ExchangeRate{}, err
	}

	return rate, nil
}

// List returns exchange rates using exact filters.
func (s *Service) List(ctx context.Context, opts ListOptions) ([]ExchangeRate, error) {
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

	return s.repo.List(ctx, opts)
}

// UpdateRate validates and updates an exchange rate value.
func (s *Service) UpdateRate(ctx context.Context, id int64, input UpdateInput) (ExchangeRate, error) {
	if id <= 0 {
		return ExchangeRate{}, services.InvalidRequest("exchange_rate_id must be positive")
	}
	if err := validatePositiveDecimal("rate", input.Rate); err != nil {
		return ExchangeRate{}, err
	}

	rate, err := s.repo.UpdateRate(ctx, id, input.Rate)
	if errors.Is(err, services.ErrNotFound) {
		return ExchangeRate{}, services.NotFound("exchange rate not found")
	}
	if err != nil {
		return ExchangeRate{}, err
	}

	return rate, nil
}

// Delete tombstones an exchange rate.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("exchange_rate_id must be positive")
	}

	if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
		return services.NotFound("exchange rate not found")
	} else if err != nil {
		return err
	}

	return nil
}

func validateCurrencyCode(name string, currency string) error {
	if len(currency) != 3 {
		return services.InvalidRequest(name + " must be a three-letter uppercase code")
	}
	for i := range currency {
		if currency[i] < 'A' || currency[i] > 'Z' {
			return services.InvalidRequest(name + " must be a three-letter uppercase code")
		}
	}

	return nil
}

func validatePositiveDecimal(name string, value string) error {
	if strings.TrimSpace(value) != value || value == "" {
		return services.InvalidRequest(name + " must be a positive decimal")
	}

	parts := strings.Split(value, ".")
	if len(parts) > 2 || parts[0] == "" {
		return services.InvalidRequest(name + " must be a positive decimal")
	}
	if len(parts) == 2 && (parts[1] == "" || len(parts[1]) > 8) {
		return services.InvalidRequest(name + " must be a positive decimal with at most 8 fractional digits")
	}
	if len(parts[0]) > 10 {
		return services.InvalidRequest(name + " must have at most 10 integer digits")
	}

	digitCount := 0
	hasNonZero := false
	for _, part := range parts {
		for i := range part {
			if part[i] < '0' || part[i] > '9' {
				return services.InvalidRequest(name + " must be a positive decimal")
			}
			if part[i] != '0' {
				hasNonZero = true
			}
			digitCount++
		}
	}
	if digitCount > 18 {
		return services.InvalidRequest(name + " must have at most 10 integer digits and 8 fractional digits")
	}
	if !hasNonZero {
		return services.InvalidRequest(name + " must be greater than zero")
	}

	return nil
}

func validateEffectiveDate(effectiveDate string) error {
	if len(effectiveDate) != len("2006-01-02") {
		return services.InvalidRequest("effective_date must use YYYY-MM-DD format")
	}
	parsed, err := time.Parse("2006-01-02", effectiveDate)
	if err != nil || parsed.Format("2006-01-02") != effectiveDate {
		return services.InvalidRequest("effective_date must use YYYY-MM-DD format")
	}

	return nil
}
