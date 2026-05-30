package runtime

import (
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/mishamsk/mina/internal/store"
)

// Config controls process-local Mina database lifecycle policy.
type Config struct {
	DatabasePath     string
	AccountingSchema string
	CreateIfMissing  bool
	ApplyMigrations  bool
	HTTP             HTTPConfig
}

// HTTPConfig controls process-local HTTP adapter behavior.
type HTTPConfig struct {
	AccessLog io.Writer
	Timeout   time.Duration
}

// Validate checks database lifecycle settings before composition starts.
func (c Config) Validate() error {
	if c.DatabasePath == "" {
		if !c.ApplyMigrations {
			return errors.New("--migrate=false requires an existing database")
		}
		return nil
	}
	if c.CreateIfMissing && !c.ApplyMigrations {
		if _, err := os.Stat(c.DatabasePath); errors.Is(err, os.ErrNotExist) {
			return errors.New("--migrate=false requires an existing database")
		} else if err != nil {
			return fmt.Errorf("stat database path: %w", err)
		}
	}

	return nil
}

// AccountingOpenRequest returns the store request selected by runtime database policy.
func (c Config) AccountingOpenRequest() store.AccountingOpenRequest {
	return store.AccountingOpenRequest{
		Path:     c.DatabasePath,
		Location: c.AccountingLocationConfig(),
		Migrate:  c.ApplyMigrations,
	}
}

// AccountingLocationConfig returns the DuckDB accounting database and schema selected by runtime config.
func (c Config) AccountingLocationConfig() store.AccountingLocationConfig {
	if c.DatabasePath == "" {
		return store.AccountingLocationConfig{
			Database: store.InMemoryAccountingDatabase,
			Schema:   c.accountingSchemaOrDefault(store.InMemoryAccountingSchema),
		}
	}

	return store.AccountingLocationConfig{
		Database: store.AttachedAccountingDatabase,
		Schema:   c.accountingSchemaOrDefault(store.AttachedAccountingSchema),
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
