package runtime

import (
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/mishamsk/mina/internal/background"
	"github.com/mishamsk/mina/internal/services/exchangerateloading"
	"github.com/mishamsk/mina/internal/store"
)

// Runtime-owned accounting-state defaults.
const (
	InMemoryAccountingDatabase = "memory"
	InMemoryAccountingSchema   = "mina"
	AttachedAccountingDatabase = "accounting"
	AttachedAccountingSchema   = "main"
)

// Config controls process-local Mina database lifecycle policy.
type Config struct {
	DatabasePath     string
	AccountingSchema string
	CacheDir         string
	HTTP             HTTPConfig
	Operations       OperationConfig
	ExchangeRates    ExchangeRateConfig
	Dependencies     Dependencies
}

// HTTPConfig controls process-local HTTP adapter behavior.
type HTTPConfig struct {
	AccessLog io.Writer
	Timeout   time.Duration
}

// Clock returns the current process time.
type Clock interface {
	Now() time.Time
}

// Dependencies contains side-effect boundary dependencies supplied by composition or tests.
type Dependencies struct {
	Clock                              Clock
	ExchangeRateProviderFactory        exchangerateloading.RateProvider
	StartupExchangeRateProviderFactory exchangerateloading.RateProvider
}

// OperationConfig controls whether and when runtime-owned background operations run.
type OperationConfig struct {
	Enabled    bool
	DeferStart bool
	ErrorLog   io.Writer
}

// ExchangeRateConfig controls automatic exchange-rate loading behavior.
type ExchangeRateConfig struct {
	AutomaticLoadingEnabled bool
	LoadScheduleUTC         string
	StartupProvider         string
	Providers               ExchangeRateProviderConfig
}

// ExchangeRateProviderConfig contains runtime exchange-rate provider settings.
type ExchangeRateProviderConfig struct {
	Frankfurter FrankfurterExchangeRateProviderConfig
}

// FrankfurterExchangeRateProviderConfig contains runtime Frankfurter settings.
type FrankfurterExchangeRateProviderConfig struct {
	BaseURL string
}

// Validate checks database lifecycle settings before composition starts.
func (c Config) Validate() error {
	if c.Operations.Enabled && c.ExchangeRates.AutomaticLoadingEnabled {
		if err := validateExchangeRateLoadSchedule(c.ExchangeRates.LoadScheduleUTC); err != nil {
			return err
		}
		if err := validateExchangeRateStartupProvider(c.ExchangeRates.StartupProvider); err != nil {
			return err
		}
	}
	return nil
}

// AccountingOpenRequest returns the store request selected by runtime database policy.
func (c Config) AccountingOpenRequest() store.AccountingOpenRequest {
	return store.AccountingOpenRequest{
		Path:     c.DatabasePath,
		Location: c.AccountingLocationConfig(),
	}
}

type systemClock struct{}

func (systemClock) Now() time.Time {
	return time.Now()
}

func (c Config) clock() Clock {
	if c.Dependencies.Clock != nil {
		return c.Dependencies.Clock
	}

	return systemClock{}
}

// AccountingLocationConfig returns the DuckDB accounting database and schema selected by runtime config.
func (c Config) AccountingLocationConfig() store.AccountingLocationConfig {
	if c.DatabasePath == "" {
		return store.AccountingLocationConfig{
			Database: InMemoryAccountingDatabase,
			Schema:   c.accountingSchemaOrDefault(InMemoryAccountingSchema),
		}
	}

	return store.AccountingLocationConfig{
		Database: AttachedAccountingDatabase,
		Schema:   c.accountingSchemaOrDefault(AttachedAccountingSchema),
	}
}

func (c Config) accountingSchemaOrDefault(defaultSchema string) string {
	if c.AccountingSchema != "" {
		return c.AccountingSchema
	}

	return defaultSchema
}

// ServeConfig controls the local REST API listener and database policy.
type ServeConfig struct {
	Config
	Host          string
	Port          int
	AccessLogPath string
	Quiet         bool
	Demo          bool
}

// Validate checks REST server process settings before startup.
func (c ServeConfig) Validate() error {
	cfg := c.Config
	cfg.Operations.Enabled = true
	if err := cfg.Validate(); err != nil {
		return err
	}
	if c.Port < 0 || c.Port > 65535 {
		return errors.New("--port must be between 0 and 65535")
	}
	if c.Quiet && c.AccessLogPath != "" {
		return errors.New("--quiet cannot be combined with --access-log")
	}

	return nil
}

func validateExchangeRateLoadSchedule(schedule string) error {
	if err := background.ValidateSchedule(schedule); err != nil {
		return fmt.Errorf("exchange-rate load schedule: %w", err)
	}

	return nil
}

func validateExchangeRateStartupProvider(provider string) error {
	switch provider {
	case "", "frankfurter_file", "frankfurter_api":
		return nil
	default:
		return fmt.Errorf("exchange-rate startup provider %q is not supported", provider)
	}
}
