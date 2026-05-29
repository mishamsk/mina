package runtime

import (
	"errors"
	"fmt"
	"os"
)

// Config controls process-local Mina database lifecycle policy.
type Config struct {
	DatabasePath    string
	CreateIfMissing bool
	ApplyMigrations bool
}

// Validate checks database lifecycle settings before composition starts.
func (c Config) Validate() error {
	if c.DatabasePath == "" {
		return errors.New("database path is required")
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

// ServeConfig controls the local REST API listener and database policy.
type ServeConfig struct {
	Config
	Host string
	Port int
}

// Validate checks REST server process settings before startup.
func (c ServeConfig) Validate() error {
	if err := c.Config.Validate(); err != nil {
		return err
	}
	if c.Port < 0 || c.Port > 65535 {
		return errors.New("--port must be between 0 and 65535")
	}

	return nil
}
