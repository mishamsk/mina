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
	accounting *store.AccountingStore
	handler    http.Handler
}

// New opens the configured database, applies migrations when requested, and wires the REST handler.
func New(ctx context.Context, cfg Config) (*App, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	location := store.InMemoryAccountingLocationConfig()
	if cfg.DatabasePath != "" {
		if err := prepareDatabasePath(cfg.DatabasePath, cfg.CreateIfMissing); err != nil {
			return nil, err
		}

		location = store.AttachedDatabaseAccountingLocationConfig()
	}

	accounting, err := store.OpenAccounting(ctx, store.AccountingOpenRequest{
		Path:     cfg.DatabasePath,
		Location: location,
		Migrate:  cfg.ApplyMigrations,
	})
	if err != nil {
		return nil, err
	}

	return NewWithStore(accounting, cfg.HTTP), nil
}

// NewWithStore wires the REST handler around an already-opened migrated accounting store.
func NewWithStore(accounting *store.AccountingStore, httpConfig HTTPConfig) *App {
	handler := httpapi.NewWithOptions(httpapi.Dependencies{
		Categories:    categories.NewService(store.NewCategoryStore(accounting)),
		Tags:          tags.NewService(store.NewTagStore(accounting)),
		Members:       members.NewService(store.NewMemberStore(accounting)),
		Accounts:      accounts.NewService(store.NewAccountStore(accounting)),
		CreditLimits:  creditlimits.NewService(store.NewCreditLimitHistoryStore(accounting)),
		ExchangeRates: exchangerates.NewService(store.NewExchangeRateStore(accounting)),
		Transactions:  transactions.NewService(store.NewTransactionStore(accounting)),
	}, httpapi.Options{
		AccessLog: httpConfig.AccessLog,
		Timeout:   httpConfig.Timeout,
	})

	return &App{
		accounting: accounting,
		handler:    handler,
	}
}

// DB returns the opened database handle.
func (a *App) DB() *sql.DB {
	return a.accounting.DB()
}

// AccountingLocation returns the database and schema holding accounting state.
func (a *App) AccountingLocation() store.AccountingLocation {
	return a.accounting.Location()
}

// AccountingStore returns the initialized accounting store.
func (a *App) AccountingStore() *store.AccountingStore {
	return a.accounting
}

// Handler returns the composed REST API handler.
func (a *App) Handler() http.Handler {
	return a.handler
}

// Close releases process resources owned by the app.
func (a *App) Close() error {
	if a.accounting == nil {
		return nil
	}

	return a.accounting.Close()
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
