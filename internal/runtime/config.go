package runtime

import (
	"context"
	"fmt"
	"io"
	"net/http"
	goruntime "runtime"
	"time"

	"github.com/mishamsk/mina/internal/appconfig"
	"github.com/mishamsk/mina/internal/background"
	"github.com/mishamsk/mina/internal/services/backups"
	"github.com/mishamsk/mina/internal/services/dbvalidation"
	"github.com/mishamsk/mina/internal/services/exchangerateloading"
	"github.com/mishamsk/mina/internal/store"
)

// Runtime-owned accounting-state defaults.
const (
	InMemoryAccountingDatabase = "memory"
	InMemoryAccountingSchema   = "mina"
	AttachedAccountingDatabase = "accounting"
	AttachedAccountingSchema   = "main"
	defaultDuckDBMaxOpenConns  = 2
)

// bundledHTTPFSExtensionPath is set by supported container builds. Direct
// binaries leave it empty and use DuckDB's signed, version-matched cache.
var bundledHTTPFSExtensionPath string

// Options contains live process dependencies and controls supplied by composition.
type Options struct {
	ExecutionProfile ExecutionProfile
	HTTP             HTTPConfig
	Operations       OperationConfig
	Dependencies     Dependencies
}

// ExecutionProfile selects the runtime lifecycle policy used by an app.
type ExecutionProfile string

const (
	// ExecutionProfileLongRunning preserves server startup validation and automatic operation execution.
	ExecutionProfileLongRunning ExecutionProfile = "long-running"
	// ExecutionProfileOneShot skips startup database validation and automatic operation execution.
	ExecutionProfileOneShot ExecutionProfile = "one-shot"
	// ExecutionProfileMigration validates the migrated database without loading authentication or starting operations.
	ExecutionProfileMigration ExecutionProfile = "migration"
)

func (opts Options) validateExecutionProfile() error {
	switch opts.ExecutionProfile {
	case ExecutionProfileLongRunning, ExecutionProfileOneShot, ExecutionProfileMigration:
		return nil
	default:
		return fmt.Errorf("runtime execution profile must be %q, %q, or %q", ExecutionProfileLongRunning, ExecutionProfileOneShot, ExecutionProfileMigration)
	}
}

func (opts Options) automaticOperationsEnabled() bool {
	return opts.ExecutionProfile == ExecutionProfileLongRunning && opts.Operations.Enabled
}

func (opts Options) startupValidationEnabled() bool {
	return opts.ExecutionProfile == ExecutionProfileLongRunning || opts.ExecutionProfile == ExecutionProfileMigration
}

func resolveRuntimeDefaults(cfg appconfig.Config) appconfig.Config {
	if cfg.AccountingSchema == "" {
		cfg.SettingSources[appconfig.SourceAccountingSchema] = appconfig.SettingSourceDefault
	}
	cfg.AccountingSchema = AccountingLocationConfig(cfg).Schema
	if cfg.StartupValidation == "" {
		cfg.SettingSources[appconfig.SourceStartupValidation] = appconfig.SettingSourceDefault
		cfg.StartupValidation = "shallow"
	}
	if cfg.ExchangeRates.StartupProvider == "" {
		cfg.SettingSources[appconfig.SourceExchangeRateStartupProvider] = appconfig.SettingSourceDefault
	}
	cfg.ExchangeRates.StartupProvider = exchangeRateStartupProvider(cfg)

	return cfg
}

// HTTPConfig controls process-local HTTP adapter behavior.
type HTTPConfig struct {
	AccessLog  io.Writer
	ErrorLog   io.Writer
	MCPVersion string
	Timeout    time.Duration
}

// Clock returns process time and provides cancelable deadline waits.
type Clock interface {
	Now() time.Time
	WaitUntil(context.Context, time.Time) bool
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
	if _, _, err := startupValidationLevel(cfg); err != nil {
		return err
	}
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
	if cfg.AuditLog.RetentionMonths <= 0 {
		return fmt.Errorf("audit-log retention months must be positive")
	}
	if operationsEnabled {
		if err := validateAuditLogCompactionSchedule(cfg.AuditLog.CompactionScheduleUTC); err != nil {
			return err
		}
	}
	return nil
}

func validateAuditLogCompactionSchedule(schedule string) error {
	if err := background.ValidateSchedule(schedule); err != nil {
		return fmt.Errorf("audit-log compaction schedule: %w", err)
	}

	return nil
}

// appDBOpenRequest returns the store request selected by runtime database policy.
func appDBOpenRequest(cfg appconfig.Config) (store.AppDBOpenRequest, error) {
	encryptionKey, err := appconfig.DatabaseEncryptionKeyFromEnvironment()
	if err != nil {
		return store.AppDBOpenRequest{}, err
	}

	return store.AppDBOpenRequest{
		Path:                cfg.DatabasePath,
		AccountingLocation:  AccountingLocationConfig(cfg),
		MaxOpenConns:        duckDBMaxOpenConns(),
		EncryptionKey:       encryptionKey,
		HTTPFSExtensionPath: bundledHTTPFSExtensionPath,
	}, nil
}

func duckDBMaxOpenConns() int {
	// Revisit this if real local workloads show higher user or read concurrency.
	// Two connections currently guard ordinary activity from being fully blocked
	// by an accidental overlap with one slow read or write.
	maxOpenConns := defaultDuckDBMaxOpenConns
	if cpuCount := goruntime.NumCPU(); cpuCount < maxOpenConns {
		maxOpenConns = cpuCount
	}
	return maxOpenConns
}

type systemClock struct{}

func (systemClock) Now() time.Time {
	return time.Now()
}

func (systemClock) WaitUntil(ctx context.Context, deadline time.Time) bool {
	duration := time.Until(deadline)
	if duration <= 0 {
		return true
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
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

func startupValidationLevel(cfg appconfig.Config) (dbvalidation.Level, bool, error) {
	switch cfg.StartupValidation {
	case "", "shallow":
		return dbvalidation.LevelShallow, true, nil
	case "full":
		return dbvalidation.LevelFull, true, nil
	case "none":
		return "", false, nil
	default:
		return "", false, fmt.Errorf("startup_validation must be one of none, shallow, or full")
	}
}
