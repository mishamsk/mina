package runtime

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/mishamsk/mina/internal/appconfig"
	"github.com/mishamsk/mina/internal/background"
	"github.com/mishamsk/mina/internal/services/backups"
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
	BackupProvider                     backups.Provider
	ExchangeRateProviderFactory        exchangerateloading.RateProvider
	StartupExchangeRateProviderFactory exchangerateloading.RateProvider
	FrankfurterCacheHTTPClient         *http.Client
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
	if cfg.Backups.File.RetentionCount < 0 {
		return fmt.Errorf("backup file retention count must be greater than or equal to 0")
	}
	if operationsEnabled && cfg.Backups.File.ScheduleUTC != "" {
		if err := validateBackupFileSchedule(cfg.Backups.File.ScheduleUTC); err != nil {
			return err
		}
		if cfg.Backups.File.Directory == "" {
			return fmt.Errorf("backup file directory is required when backup file schedule is configured")
		}
	}
	return nil
}

// AppDBOpenRequest returns the store request selected by runtime database policy.
func AppDBOpenRequest(cfg appconfig.Config) store.AppDBOpenRequest {
	return store.AppDBOpenRequest{
		Path:               cfg.DatabasePath,
		AccountingLocation: AccountingLocationConfig(cfg),
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

func validateBackupFileSchedule(schedule string) error {
	if err := background.ValidateSchedule(schedule); err != nil {
		return fmt.Errorf("backup file schedule: %w", err)
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
