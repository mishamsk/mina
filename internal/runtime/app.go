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
	accounting *store.AccountingDB
	handler    http.Handler
}

// New opens the configured database, applies migrations, and wires the REST handler.
func New(ctx context.Context, cfg Config) (*App, error) {
	return newApp(ctx, cfg, store.OpenAccounting)
}

// NewWithProcessDB applies migrations using an existing DuckDB process handle and wires the REST handler.
func NewWithProcessDB(ctx context.Context, db *sql.DB, cfg Config) (*App, error) {
	return newApp(ctx, cfg, func(ctx context.Context, request store.AccountingOpenRequest) (*store.AccountingDB, error) {
		return store.OpenAccountingWithProcessDB(ctx, db, request)
	})
}

func newApp(
	ctx context.Context,
	cfg Config,
	openAccounting func(context.Context, store.AccountingOpenRequest) (*store.AccountingDB, error),
) (*App, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if cfg.DatabasePath != "" {
		if err := prepareDatabasePath(cfg.DatabasePath); err != nil {
			return nil, err
		}
	}

	accounting, err := openAccounting(ctx, cfg.AccountingOpenRequest())
	if err != nil {
		return nil, err
	}

	if err := store.Migrate(ctx, accounting); err != nil {
		return nil, closeAccountingAfterError(accounting, fmt.Errorf("migrate database: %w", err))
	}

	return NewWithAccountingDB(accounting, cfg.HTTP), nil
}

// HasPendingMigrations reports whether the configured accounting database would be migrated at startup.
func HasPendingMigrations(ctx context.Context, cfg Config) (bool, error) {
	if err := cfg.Validate(); err != nil {
		return false, err
	}
	if cfg.DatabasePath != "" {
		exists, err := databasePathExists(cfg.DatabasePath)
		if err != nil {
			return false, err
		}
		if !exists {
			return true, nil
		}
	}

	accounting, err := store.OpenAccounting(ctx, cfg.AccountingOpenRequest())
	if err != nil {
		return false, err
	}
	defer func() {
		_ = accounting.Close()
	}()

	return store.HasPendingMigrations(ctx, accounting)
}

// NewWithAccountingDB wires the REST handler around an already-opened migrated accounting database.
func NewWithAccountingDB(accounting *store.AccountingDB, httpConfig HTTPConfig) *App {
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

// AccountingDB returns the initialized accounting database handle.
func (a *App) AccountingDB() *store.AccountingDB {
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

func prepareDatabasePath(path string) error {
	_, err := os.Stat(path)
	if err == nil {
		return nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat database path: %w", err)
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

func databasePathExists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return false, fmt.Errorf("stat database path: %w", err)
	}

	return false, nil
}

func closeAccountingAfterError(accounting *store.AccountingDB, err error) error {
	if closeErr := accounting.Close(); closeErr != nil {
		return fmt.Errorf("%w; close database: %w", err, closeErr)
	}

	return err
}
