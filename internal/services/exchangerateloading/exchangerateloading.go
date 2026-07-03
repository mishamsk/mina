package exchangerateloading

import (
	"context"
	"errors"
	"time"

	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/values"
	"github.com/mishamsk/mina/internal/x/refcache"
)

const usdCurrency = "USD"
const priorInterpolationBracketLookback = 7 * 24 * time.Hour

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
	Currency string
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
}

// RateWriter persists loaded active USD rates.
type RateWriter interface {
	UpsertActiveUSDRates(context.Context, []exchangerates.UpsertRate) error
}

// Clock returns the current process time.
type Clock interface {
	Now() time.Time
}

// Service owns exchange-rate loading planning and execution.
type Service struct {
	repo             Repository
	rateWriter       RateWriter
	provider         RateProvider
	clock            Clock
	neededCurrencies *refcache.Value[[]NeededCurrency]
}

// NewService creates an exchange-rate loading service.
func NewService(repo Repository, rateWriter RateWriter, provider RateProvider, clock Clock) *Service {
	service := &Service{repo: repo, rateWriter: rateWriter, provider: provider, clock: clock}
	service.neededCurrencies = refcache.NewValue(service.repo.NeededCurrencies)
	return service
}

// Load plans and loads needed exchange rates.
func (s *Service) Load(ctx context.Context) error {
	if s.provider == nil {
		return errProviderRequired
	}

	needed, err := s.neededCurrencies.Get(ctx)
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

	upserts := []exchangerates.UpsertRate{}
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
			upserts = append(upserts, exchangerates.UpsertRate{
				ToCurrency:    rate.Currency,
				EffectiveDate: rate.EffectiveDate,
				Rate:          rate.Rate,
			})
		}
	}
	if len(upserts) == 0 {
		return firstErr
	}

	if err := s.rateWriter.UpsertActiveUSDRates(ctx, upserts); err != nil {
		return err
	}

	return firstErr
}

// InvalidateCurrencyCache forces the next load to reload needed currencies.
func (s *Service) InvalidateCurrencyCache() {
	s.neededCurrencies.Invalidate()
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
	settledThrough, ok, err := s.provider.SettledThroughDate(ctx, need.Currency)
	if err != nil {
		return loadWindow{}, false, err
	}
	if !ok {
		settledThrough = values.CivilDateFromTime(s.clock.Now())
	}

	start := settledThrough
	if !latest.Time().IsZero() {
		start = latest
	}
	if !missing.Time().IsZero() && (latest.Time().IsZero() || missing.Time().Before(latest.Time())) {
		start = values.CivilDateFromTime(missing.Time().Add(-priorInterpolationBracketLookback))
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
