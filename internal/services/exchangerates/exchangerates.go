package exchangerates

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/values"
)

// ExchangeRate is one historical currency conversion rate.
type ExchangeRate struct {
	ID            int64
	FromCurrency  string
	ToCurrency    string
	Rate          values.Decimal
	EffectiveDate time.Time
	CreatedAt     time.Time
	TombstonedAt  *time.Time
}

// CreateInput contains fields for creating an exchange rate.
type CreateInput struct {
	FromCurrency  string
	ToCurrency    string
	Rate          values.Decimal
	EffectiveDate time.Time
}

// UpdateInput contains mutable exchange rate fields.
type UpdateInput struct {
	Rate values.Decimal
}

// ListOptions controls exchange rate list filters and visibility.
type ListOptions struct {
	FromCurrency      *string
	ToCurrency        *string
	EffectiveDate     *time.Time
	IncludeTombstoned bool
	List              services.ListOptions
}

// UpsertRate is one active USD rate to create or update.
type UpsertRate struct {
	ToCurrency    string
	EffectiveDate values.CivilDate
	Rate          values.Decimal
}

// USDRateBracket contains the active USD rates around a lookup date.
type USDRateBracket struct {
	AtOrBefore *ExchangeRate
	AtOrAfter  *ExchangeRate
}

// Repository persists exchange rate state.
type Repository interface {
	Create(context.Context, CreateInput) (ExchangeRate, error)
	Get(context.Context, int64, bool) (ExchangeRate, error)
	List(context.Context, ListOptions) ([]ExchangeRate, error)
	UpdateRate(context.Context, int64, values.Decimal) (ExchangeRate, error)
	Tombstone(context.Context, int64) error
	UpsertActiveUSDRates(context.Context, []UpsertRate) error
	BracketingActiveUSDRates(context.Context, string, values.CivilDate) (USDRateBracket, error)
}

// Service owns exchange rate use cases and validation.
type Service struct {
	repo Repository
}

// NewService creates an exchange rate service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// SignedAmountUSD derives the signed USD value for a journal record amount.
// Callers must pass a currency already validated by the service that owns the input.
func (s *Service) SignedAmountUSD(
	ctx context.Context,
	currency string,
	amount values.Decimal,
	effectiveDate values.CivilDate,
) (*values.Decimal, error) {
	if currency == "USD" {
		amountUSD := amount
		return &amountUSD, nil
	}

	bracket, err := s.repo.BracketingActiveUSDRates(ctx, currency, effectiveDate)
	if err != nil {
		return nil, err
	}
	if bracket.AtOrBefore == nil || bracket.AtOrAfter == nil {
		return nil, nil
	}

	lookupDate := effectiveDate.Time()
	beforeDate := values.CivilDateFromTime(bracket.AtOrBefore.EffectiveDate).Time()
	afterDate := values.CivilDateFromTime(bracket.AtOrAfter.EffectiveDate).Time()

	rate := bracket.AtOrBefore.Rate
	if !beforeDate.Equal(lookupDate) {
		if !beforeDate.Before(lookupDate) || !afterDate.After(lookupDate) {
			return nil, nil
		}
		rate, err = interpolatedRate(bracket.AtOrBefore.Rate, bracket.AtOrAfter.Rate, beforeDate, afterDate, lookupDate)
		if err != nil {
			return nil, err
		}
	}

	amountUSD, err := amount.Div(rate)
	if err != nil {
		if inferredAmountOutsideDecimalRange(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("derive amount_usd: %w", err)
	}
	if amountUSD.IsZero() {
		return nil, nil
	}

	return &amountUSD, nil
}

// Create validates and creates an exchange rate.
func (s *Service) Create(ctx context.Context, input CreateInput) (ExchangeRate, error) {
	if err := validateCurrencyCode("from_currency", input.FromCurrency); err != nil {
		return ExchangeRate{}, err
	}
	if err := validateCurrencyCode("to_currency", input.ToCurrency); err != nil {
		return ExchangeRate{}, err
	}
	if input.Rate.Sign() <= 0 {
		return ExchangeRate{}, services.InvalidRequest("rate must be greater than zero")
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
	return s.repo.List(ctx, opts)
}

// UpsertActiveUSDRates creates or updates active USD exchange rates.
func (s *Service) UpsertActiveUSDRates(ctx context.Context, rates []UpsertRate) error {
	for _, rate := range rates {
		if err := validateCurrencyCode("to_currency", rate.ToCurrency); err != nil {
			return err
		}
		if rate.Rate.Sign() <= 0 {
			return services.InvalidRequest("rate must be greater than zero")
		}
	}

	return s.repo.UpsertActiveUSDRates(ctx, rates)
}

// UpdateRate validates and updates an exchange rate value.
func (s *Service) UpdateRate(ctx context.Context, id int64, input UpdateInput) (ExchangeRate, error) {
	if id <= 0 {
		return ExchangeRate{}, services.InvalidRequest("exchange_rate_id must be positive")
	}
	if input.Rate.Sign() <= 0 {
		return ExchangeRate{}, services.InvalidRequest("rate must be greater than zero")
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

func inferredAmountOutsideDecimalRange(err error) bool {
	return errors.Is(err, values.ErrDecimalIntegerDigits) ||
		errors.Is(err, values.ErrDecimalPrecision) ||
		errors.Is(err, values.ErrDecimalTotalDigits)
}

func validateCurrencyCode(name string, currency string) error {
	if !values.ValidCurrencyCode(currency) {
		return services.InvalidRequest(name + " must be an ISO 4217 code or crypto code prefixed with C::")
	}

	return nil
}

func interpolatedRate(
	before values.Decimal,
	after values.Decimal,
	beforeDate time.Time,
	afterDate time.Time,
	lookupDate time.Time,
) (values.Decimal, error) {
	elapsedDays := int64(lookupDate.Sub(beforeDate).Hours() / 24)
	totalDays := int64(afterDate.Sub(beforeDate).Hours() / 24)
	if elapsedDays <= 0 || totalDays <= 0 || elapsedDays >= totalDays {
		return values.Decimal{}, services.InvalidRequest("exchange-rate interpolation requires an interior date")
	}

	elapsed, err := values.DecimalFromInt64(elapsedDays)
	if err != nil {
		return values.Decimal{}, fmt.Errorf("build elapsed-day decimal: %w", err)
	}
	total, err := values.DecimalFromInt64(totalDays)
	if err != nil {
		return values.Decimal{}, fmt.Errorf("build total-day decimal: %w", err)
	}
	delta, err := after.Sub(before)
	if err != nil {
		return values.Decimal{}, fmt.Errorf("interpolate rate delta: %w", err)
	}
	weightedDelta, err := delta.Mul(elapsed)
	if err != nil {
		return values.Decimal{}, fmt.Errorf("interpolate weighted rate delta: %w", err)
	}
	increment, err := weightedDelta.Div(total)
	if err != nil {
		return values.Decimal{}, fmt.Errorf("interpolate rate increment: %w", err)
	}
	rate, err := before.Add(increment)
	if err != nil {
		return values.Decimal{}, fmt.Errorf("interpolate rate: %w", err)
	}

	return rate, nil
}
