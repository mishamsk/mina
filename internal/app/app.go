package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/routers"
	"mina.local/mina/internal/store"
)

// Config controls process-local app composition.
type Config struct {
	DatabasePath    string
	CreateIfMissing bool
	ApplyMigrations bool
}

// App is a composed in-process Mina application.
type App struct {
	db      *sql.DB
	handler http.Handler
}

// New opens the configured database, applies migrations when requested, and wires the REST handler.
func New(ctx context.Context, cfg Config) (*App, error) {
	if cfg.DatabasePath == "" {
		return nil, errors.New("database path is required")
	}

	if err := prepareDatabasePath(cfg.DatabasePath, cfg.CreateIfMissing); err != nil {
		return nil, err
	}

	db, err := store.Open(ctx, cfg.DatabasePath)
	if err != nil {
		return nil, err
	}

	if cfg.ApplyMigrations {
		if err := store.Migrate(ctx, db); err != nil {
			if closeErr := db.Close(); closeErr != nil {
				return nil, fmt.Errorf("migrate database: %w; close database: %w", err, closeErr)
			}
			return nil, fmt.Errorf("migrate database: %w", err)
		}
	}

	controllerSet := controllers.New()
	handler := routers.New(routers.Dependencies{Controllers: controllerSet})

	return &App{
		db:      db,
		handler: handler,
	}, nil
}

// DB returns the opened database handle.
func (a *App) DB() *sql.DB {
	return a.db
}

// Handler returns the composed REST API handler.
func (a *App) Handler() http.Handler {
	return a.handler
}

// Close releases process resources owned by the app.
func (a *App) Close() error {
	if a.db == nil {
		return nil
	}

	return a.db.Close()
}

func prepareDatabasePath(path string, createIfMissing bool) error {
	_, err := os.Stat(path)
	if err == nil {
		return nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat database path: %w", err)
	}
	if !createIfMissing {
		return fmt.Errorf("database path does not exist: %s", path)
	}

	parent := filepath.Dir(path)
	if parent == "." || parent == "" {
		return nil
	}
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return fmt.Errorf("create database parent directory: %w", err)
	}

	return nil
}
