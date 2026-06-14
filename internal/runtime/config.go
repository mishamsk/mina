package runtime

import (
	"fmt"
	"io"
	"time"

	"github.com/mishamsk/mina/internal/appconfig"
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

// Options contains live process dependencies and controls supplied by composition.
type Options struct {
	HTTP         HTTPConfig
	Operations   OperationConfig
	Dependencies Dependencies
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

// Validate checks runtime-owned settings before composition starts.
func Validate(cfg appconfig.Config, operationsEnabled bool) error {
	if operationsEnabled && cfg.ExchangeRates.AutomaticLoadingEnabled {
		if err := validateExchangeRateLoadSchedule(cfg.ExchangeRates.LoadScheduleUTC); err != nil {
			return err
		}
		if err := validateExchangeRateStartupProvider(cfg.ExchangeRates.StartupProvider); err != nil {
			return err
		}
	}
	return nil
}

// AccountingOpenRequest returns the store request selected by runtime database policy.
func AccountingOpenRequest(cfg appconfig.Config) store.AccountingOpenRequest {
	return store.AccountingOpenRequest{
		Path:     cfg.DatabasePath,
		Location: AccountingLocationConfig(cfg),
	}
}

type systemClock struct{}

func (systemClock) Now() time.Time {
	return time.Now()
}

func (opts Options) clock() Clock {
	if opts.Dependencies.Clock != nil {
		return opts.Dependencies.Clock
	}

	return systemClock{}
}

// AccountingLocationConfig returns the DuckDB accounting database and schema selected by app config.
func AccountingLocationConfig(cfg appconfig.Config) store.AccountingLocationConfig {
	if cfg.DatabasePath == "" {
		return store.AccountingLocationConfig{
			Database: InMemoryAccountingDatabase,
			Schema:   accountingSchemaOrDefault(cfg, InMemoryAccountingSchema),
		}
	}

	return store.AccountingLocationConfig{
		Database: AttachedAccountingDatabase,
		Schema:   accountingSchemaOrDefault(cfg, AttachedAccountingSchema),
	}
}

func accountingSchemaOrDefault(cfg appconfig.Config, defaultSchema string) string {
	if cfg.AccountingSchema != "" {
		return cfg.AccountingSchema
	}

	return defaultSchema
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
