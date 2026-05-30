package runtime

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/mishamsk/mina/internal/httpapi"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/creditlimits"
	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/store"
)

// App is a composed in-process Mina application.
type App struct {
	db      *sql.DB
	handler http.Handler
}

// New opens the configured database, applies migrations when requested, and wires the REST handler.
func New(ctx context.Context, cfg Config) (*App, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
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

	return NewWithDB(db, cfg.HTTP), nil
}

// NewWithDB wires the REST handler around an already-opened migrated database.
func NewWithDB(db *sql.DB, httpConfig HTTPConfig) *App {
	handler := httpapi.NewWithOptions(httpapi.Dependencies{
		Categories:    categories.NewService(store.NewCategoryStore(db)),
		Tags:          tags.NewService(store.NewTagStore(db)),
		Members:       members.NewService(store.NewMemberStore(db)),
		Accounts:      accounts.NewService(store.NewAccountStore(db)),
		CreditLimits:  creditlimits.NewService(store.NewCreditLimitHistoryStore(db)),
		ExchangeRates: exchangerates.NewService(store.NewExchangeRateStore(db)),
		Transactions:  transactions.NewService(store.NewTransactionStore(db)),
	}, httpapi.Options{
		AccessLog: httpConfig.AccessLog,
		Timeout:   httpConfig.Timeout,
	})

	return &App{
		db:      db,
		handler: handler,
	}
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
