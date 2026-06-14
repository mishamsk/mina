package exchangerateloading

import (
	"context"
	"errors"
	"time"

	"github.com/mishamsk/mina/internal/services/values"
)

const usdCurrency = "USD"

var errProviderRequired = errors.New("exchange-rate loading provider is not configured")

var (
	// ErrProviderUnavailable identifies a provider outage or retryable server-side failure.
	ErrProviderUnavailable = errors.New("exchange-rate provider unavailable")
	// ErrProviderTimeout identifies a provider timeout or canceled provider request.
	ErrProviderTimeout = errors.New("exchange-rate provider timeout")
	// ErrUnsupportedPair identifies a currency pair unsupported by the provider.
	ErrUnsupportedPair = errors.New("exchange-rate provider unsupported pair")
	// ErrNoProviderRate identifies a missing provider rate for the requested date or pair.
	ErrNoProviderRate = errors.New("exchange-rate provider rate not found")
	// ErrInvalidProviderConfig identifies invalid provider configuration.
	ErrInvalidProviderConfig = errors.New("exchange-rate provider configuration invalid")
	// ErrProviderAuth identifies provider authentication or authorization failure.
	ErrProviderAuth = errors.New("exchange-rate provider authentication failed")
	// ErrMalformedProviderResponse identifies malformed provider data.
	ErrMalformedProviderResponse = errors.New("exchange-rate provider response malformed")
)

// NeededCurrency is one non-USD currency requiring rates.
type NeededCurrency struct {
	Currency     string
	EarliestDate values.CivilDate
}

// UpsertRate is one active USD rate to create or update.
type UpsertRate struct {
	ToCurrency    string
	EffectiveDate values.CivilDate
	Rate          values.Decimal
}

// ProviderRate is one provider-returned daily USD conversion rate.
type ProviderRate struct {
	Currency      string
	EffectiveDate values.CivilDate
	Rate          values.Decimal
}

// RateProvider loads daily USD rates from an exchange-rate provider boundary.
type RateProvider interface {
	SettledThroughDate(context.Context, string) (values.CivilDate, bool, error)
	Rates(context.Context, string, values.CivilDate, values.CivilDate) ([]ProviderRate, error)
}

// Repository provides loader planning and persistence.
type Repository interface {
	NeededCurrencies(context.Context) ([]NeededCurrency, error)
	LatestActiveUSDRateDates(context.Context, []string) (map[string]values.CivilDate, error)
	EarliestMissingActiveUSDRateDates(context.Context, []string) (map[string]values.CivilDate, error)
	UpsertActiveUSDRates(context.Context, []UpsertRate) error
}

// Clock returns the current process time.
type Clock interface {
	Now() time.Time
}

// Service owns exchange-rate loading planning and execution.
type Service struct {
	repo     Repository
	provider RateProvider
	clock    Clock
}

// NewService creates an exchange-rate loading service.
func NewService(repo Repository, provider RateProvider, clock Clock) *Service {
	return &Service{repo: repo, provider: provider, clock: clock}
}

// Load plans and loads needed exchange rates.
func (s *Service) Load(ctx context.Context) error {
	if s.provider == nil {
		return errProviderRequired
	}

	needed, err := s.repo.NeededCurrencies(ctx)
	if err != nil {
		return err
	}
	currencies := neededCurrencyCodes(needed)
	latest, err := s.repo.LatestActiveUSDRateDates(ctx, currencies)
	if err != nil {
		return err
	}
	missing, err := s.repo.EarliestMissingActiveUSDRateDates(ctx, currencies)
	if err != nil {
		return err
	}

	upserts := []UpsertRate{}
	var firstErr error
	for _, need := range needed {
		window, ok, err := s.window(ctx, need, latest[need.Currency], missing[need.Currency])
		if err != nil {
			if providerSkipError(err) {
				continue
			}
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if !ok {
			continue
		}
		rates, err := s.provider.Rates(ctx, need.Currency, window.start, window.end)
		if err != nil {
			if providerSkipError(err) {
				continue
			}
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		for _, rate := range rates {
			upserts = append(upserts, UpsertRate{
				ToCurrency:    rate.Currency,
				EffectiveDate: rate.EffectiveDate,
				Rate:          rate.Rate,
			})
		}
	}
	if len(upserts) == 0 {
		return firstErr
	}

	if err := s.repo.UpsertActiveUSDRates(ctx, upserts); err != nil {
		return err
	}

	return firstErr
}

func providerSkipError(err error) bool {
	return errors.Is(err, ErrUnsupportedPair) ||
		errors.Is(err, ErrNoProviderRate)
}

type loadWindow struct {
	start values.CivilDate
	end   values.CivilDate
}

func (s *Service) window(
	ctx context.Context,
	need NeededCurrency,
	latest values.CivilDate,
	missing values.CivilDate,
) (loadWindow, bool, error) {
	start := need.EarliestDate
	if !latest.Time().IsZero() {
		start = latest
	}
	if !missing.Time().IsZero() && missing.Time().Before(start.Time()) {
		start = missing
	}

	settledThrough, ok, err := s.provider.SettledThroughDate(ctx, need.Currency)
	if err != nil {
		return loadWindow{}, false, err
	}
	if !ok {
		settledThrough = values.CivilDateFromTime(s.clock.Now())
	}
	end := settledThrough
	if start.Time().After(end.Time()) {
		return loadWindow{}, false, nil
	}

	return loadWindow{start: start, end: end}, true, nil
}

func neededCurrencyCodes(needed []NeededCurrency) []string {
	currencies := make([]string, 0, len(needed))
	for _, need := range needed {
		if need.Currency == usdCurrency {
			continue
		}
		currencies = append(currencies, need.Currency)
	}

	return currencies
}
