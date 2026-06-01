package runtime

import (
	"errors"
	"io"
	"time"

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
	HTTP             HTTPConfig
}

// HTTPConfig controls process-local HTTP adapter behavior.
type HTTPConfig struct {
	AccessLog io.Writer
	Timeout   time.Duration
}

// Validate checks database lifecycle settings before composition starts.
func (c Config) Validate() error {
	return nil
}

// AccountingOpenRequest returns the store request selected by runtime database policy.
func (c Config) AccountingOpenRequest() store.AccountingOpenRequest {
	return store.AccountingOpenRequest{
		Path:     c.DatabasePath,
		Location: c.AccountingLocationConfig(),
	}
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
	if err := c.Config.Validate(); err != nil {
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
