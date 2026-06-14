package apptest

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/services/exchangerateloading"
	"github.com/mishamsk/mina/internal/services/values"
)

// FakeExchangeRateProvider is a test provider for exchange-rate loading.
type FakeExchangeRateProvider struct {
	mu           sync.Mutex
	rates        map[string]map[string]string
	err          error
	blockReady   chan struct{}
	blockRelease chan struct{}
	blockOnce    sync.Once
}

// NewFakeExchangeRateProvider returns a provider that serves configured daily rates.
func NewFakeExchangeRateProvider() *FakeExchangeRateProvider {
	return &FakeExchangeRateProvider{
		rates: make(map[string]map[string]string),
	}
}

// UnavailableExchangeRateProvider fails with a retryable provider error.
type UnavailableExchangeRateProvider struct{}

// NewUnavailableExchangeRateProvider returns a provider that fails as unavailable.
func NewUnavailableExchangeRateProvider() *UnavailableExchangeRateProvider {
	return &UnavailableExchangeRateProvider{}
}

// SettledThroughDate returns a retryable provider error.
func (p *UnavailableExchangeRateProvider) SettledThroughDate(
	context.Context,
	string,
) (values.CivilDate, bool, error) {
	return values.CivilDate{}, false, exchangerateloading.ErrProviderUnavailable
}

// Rates is unused because SettledThroughDate always fails.
func (p *UnavailableExchangeRateProvider) Rates(
	context.Context,
	string,
	values.CivilDate,
	values.CivilDate,
) ([]exchangerateloading.ProviderRate, error) {
	return nil, nil
}

// Set configures one provider-returned rate.
func (p *FakeExchangeRateProvider) Set(currency string, date string, rate string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.rates[currency] == nil {
		p.rates[currency] = make(map[string]string)
	}
	p.rates[currency][date] = rate
}

// Fail makes provider calls fail with message.
func (p *FakeExchangeRateProvider) Fail(message string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.err = errors.New(message)
}

// BlockUntilReleased makes provider calls block until Release is called.
func (p *FakeExchangeRateProvider) BlockUntilReleased() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.blockReady = make(chan struct{})
	p.blockRelease = make(chan struct{})
	p.blockOnce = sync.Once{}
}

// WaitUntilBlocked waits until a provider call reaches the configured block.
func (p *FakeExchangeRateProvider) WaitUntilBlocked(t *testing.T) {
	t.Helper()

	p.mu.Lock()
	ready := p.blockReady
	p.mu.Unlock()
	if ready == nil {
		t.Fatal("provider is not configured to block")
	}

	select {
	case <-ready:
	case <-time.After(2 * time.Second):
		t.Fatal("provider was not called")
	}
}

// Release unblocks provider calls blocked by BlockUntilReleased.
func (p *FakeExchangeRateProvider) Release() {
	p.mu.Lock()
	release := p.blockRelease
	p.mu.Unlock()
	if release != nil {
		close(release)
	}
}

// SettledThroughDate returns the latest configured date for currency.
func (p *FakeExchangeRateProvider) SettledThroughDate(
	ctx context.Context,
	currency string,
) (values.CivilDate, bool, error) {
	if err := p.waitIfBlocked(ctx); err != nil {
		return values.CivilDate{}, false, err
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.err != nil {
		return values.CivilDate{}, false, p.err
	}
	rates := p.rates[currency]
	if len(rates) == 0 {
		return values.CivilDate{}, false, nil
	}

	var latest values.CivilDate
	for date := range rates {
		parsed, err := values.ParseCivilDate(date)
		if err != nil {
			return values.CivilDate{}, false, err
		}
		if latest.Time().IsZero() || parsed.Time().After(latest.Time()) {
			latest = parsed
		}
	}

	return latest, true, nil
}

// Rates returns configured rates and records the requested provider window.
func (p *FakeExchangeRateProvider) Rates(
	_ context.Context,
	currency string,
	start values.CivilDate,
	end values.CivilDate,
) ([]exchangerateloading.ProviderRate, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.err != nil {
		return nil, p.err
	}

	result := []exchangerateloading.ProviderRate{}
	for date, rate := range p.rates[currency] {
		parsedDate, err := values.ParseCivilDate(date)
		if err != nil {
			return nil, err
		}
		parsedRate, err := values.ParsePositiveDecimal(rate)
		if err != nil {
			return nil, err
		}
		if parsedDate.Time().Before(start.Time()) || parsedDate.Time().After(end.Time()) {
			continue
		}
		result = append(result, exchangerateloading.ProviderRate{
			Currency:      currency,
			EffectiveDate: parsedDate,
			Rate:          parsedRate,
		})
	}

	return result, nil
}

func (p *FakeExchangeRateProvider) waitIfBlocked(ctx context.Context) error {
	p.mu.Lock()
	ready := p.blockReady
	release := p.blockRelease
	p.mu.Unlock()
	if ready == nil || release == nil {
		return nil
	}

	p.blockOnce.Do(func() {
		close(ready)
	})
	select {
	case <-release:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
