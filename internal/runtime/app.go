package runtime

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/mishamsk/mina/internal/background"
	"github.com/mishamsk/mina/internal/httpapi"
	"github.com/mishamsk/mina/internal/providers/exchangerates/frankfurter"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/creditlimits"
	"github.com/mishamsk/mina/internal/services/demo"
	"github.com/mishamsk/mina/internal/services/exchangerateloading"
	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/health"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/operationruns"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/store"
)

// App owns one opened accounting state, app services, and REST handler.
type App struct {
	accounting        *store.AccountingDB
	services          appServices
	handler           http.Handler
	background        *background.Runner
	operationsMu      sync.Mutex
	operationsStarted bool
}

type appServices struct {
	httpapi.Dependencies
	ExchangeRateLoading        *exchangerateloading.Service
	StartupExchangeRateLoading *exchangerateloading.Service
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

	app, err := NewWithAccountingDB(ctx, accounting, cfg)
	if err != nil {
		return nil, closeAccountingAfterError(accounting, err)
	}

	return app, nil
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

// AccountingSchemaExists reports whether the configured file-backed accounting schema exists.
func AccountingSchemaExists(ctx context.Context, cfg Config) (bool, error) {
	if err := cfg.Validate(); err != nil {
		return false, err
	}
	if cfg.DatabasePath == "" {
		return false, nil
	}
	exists, err := databasePathExists(cfg.DatabasePath)
	if err != nil {
		return false, err
	}
	if !exists {
		return false, nil
	}

	accounting, err := store.OpenAccounting(ctx, cfg.AccountingOpenRequest())
	if err != nil {
		return false, err
	}
	defer func() {
		_ = accounting.Close()
	}()

	return store.AccountingLocationExists(ctx, accounting)
}

// NewWithAccountingDB wires services and the REST handler around an already-opened migrated accounting database.
func NewWithAccountingDB(ctx context.Context, accounting *store.AccountingDB, cfg Config) (*App, error) {
	operationRepo, err := store.NewOperationRunRepository(ctx, accounting)
	if err != nil {
		return nil, err
	}
	services, err := newAppServices(accounting, cfg, operationRepo)
	if err != nil {
		return nil, err
	}
	backgroundRunner, err := newAppBackgroundRunner(cfg, services)
	if err != nil {
		return nil, err
	}
	handler := httpapi.NewWithOptions(services.Dependencies, httpapi.Options{
		AccessLog: cfg.HTTP.AccessLog,
		Timeout:   cfg.HTTP.Timeout,
	})

	app := &App{
		accounting: accounting,
		services:   services,
		handler:    handler,
		background: backgroundRunner,
	}
	if cfg.Operations.Enabled && !cfg.Operations.DeferStart {
		app.StartOperations()
	}

	return app, nil
}

func newAppServices(accounting *store.AccountingDB, cfg Config, operationRepo operationruns.Repository) (appServices, error) {
	services, err := newAccountingServices(accounting, cfg, operationRepo)
	if err != nil {
		return appServices{}, err
	}
	services.Demo = newDemoService(accounting, cfg)

	return services, nil
}

func newAccountingServices(accounting *store.AccountingDB, cfg Config, operationRepo operationruns.Repository) (appServices, error) {
	exchangeRateStore := store.NewExchangeRateStore(accounting)
	startupProvider, err := startupExchangeRateProvider(cfg)
	if err != nil {
		return appServices{}, err
	}
	exchangeRateLoading := exchangerateloading.NewService(
		exchangeRateStore,
		exchangeRateProvider(cfg),
		cfg.clock(),
	)
	startupExchangeRateLoading := exchangerateloading.NewService(
		exchangeRateStore,
		startupProvider,
		cfg.clock(),
	)
	operationRuns := operationruns.NewService(operationruns.ExchangeRateLoadingConfig{
		Enabled:     cfg.ExchangeRates.AutomaticLoadingEnabled,
		ScheduleUTC: cfg.ExchangeRates.LoadScheduleUTC,
	}, operationRepo, cfg.clock())
	return appServices{
		Dependencies: httpapi.Dependencies{
			Health:        health.NewService(store.NewHealthStore(accounting)),
			Operations:    operationRuns,
			Categories:    categories.NewService(store.NewCategoryStore(accounting)),
			Tags:          tags.NewService(store.NewTagStore(accounting)),
			Members:       members.NewService(store.NewMemberStore(accounting)),
			Accounts:      accounts.NewService(store.NewAccountStore(accounting)),
			CreditLimits:  creditlimits.NewService(store.NewCreditLimitHistoryStore(accounting)),
			ExchangeRates: exchangerates.NewService(exchangeRateStore),
			Transactions:  transactions.NewService(store.NewTransactionStore(accounting)),
		},
		ExchangeRateLoading:        exchangeRateLoading,
		StartupExchangeRateLoading: startupExchangeRateLoading,
	}, nil
}

func exchangeRateProvider(cfg Config) exchangerateloading.RateProvider {
	if cfg.Dependencies.ExchangeRateProviderFactory != nil {
		return cfg.Dependencies.ExchangeRateProviderFactory
	}

	return frankfurter.NewTargetedProvider(frankfurter.Options{
		BaseURL: cfg.ExchangeRates.Providers.Frankfurter.BaseURL,
		Clock:   cfg.clock(),
	})
}

func startupExchangeRateProvider(cfg Config) (exchangerateloading.RateProvider, error) {
	if cfg.Dependencies.StartupExchangeRateProviderFactory != nil {
		return cfg.Dependencies.StartupExchangeRateProviderFactory, nil
	}
	if !cfg.Operations.Enabled || !cfg.ExchangeRates.AutomaticLoadingEnabled {
		return exchangeRateProvider(cfg), nil
	}
	if exchangeRateStartupProvider(cfg) == "frankfurter_api" {
		return exchangeRateProvider(cfg), nil
	}
	path, err := frankfurter.CachePath(cfg.CacheDir)
	if err != nil {
		return nil, err
	}

	return frankfurter.NewFileProvider(frankfurter.FileOptions{Path: path}), nil
}

func demoDependencies(s appServices) demo.Services {
	return demo.Services{
		Accounts:      s.Accounts,
		Categories:    s.Categories,
		Tags:          s.Tags,
		Members:       s.Members,
		CreditLimits:  s.CreditLimits,
		ExchangeRates: s.ExchangeRates,
		Transactions:  s.Transactions,
	}
}

func newDemoService(accounting *store.AccountingDB, cfg Config) *demo.Service {
	return demo.NewService(demo.Dependencies{
		Atomic: func(ctx context.Context, fn func(demo.Services) error) error {
			return accounting.WithAccountingTx(ctx, nil, func(txAccounting *store.AccountingDB) error {
				services, err := newAccountingServices(txAccounting, cfg, nil)
				if err != nil {
					return err
				}

				return fn(demoDependencies(services))
			})
		},
	})
}

// AccountingLocation returns the database and schema holding accounting state.
func (a *App) AccountingLocation() store.AccountingLocation {
	return a.accounting.Location()
}

// SeedDemo seeds deterministic demo data for startup demo mode.
func (a *App) SeedDemo(ctx context.Context) (demo.Summary, error) {
	return a.services.Demo.Seed(ctx)
}

// StartOperations starts runtime-owned startup and recurring operations once.
func (a *App) StartOperations() {
	if a == nil || a.background == nil {
		return
	}
	a.operationsMu.Lock()
	defer a.operationsMu.Unlock()
	if a.operationsStarted {
		return
	}
	a.operationsStarted = true
	a.background.Start()
}

// Handler returns the composed REST API handler.
func (a *App) Handler() http.Handler {
	return a.handler
}

// Close releases process resources owned by the app.
func (a *App) Close() error {
	if a.background != nil {
		a.background.Close()
	}
	if a.accounting == nil {
		return nil
	}

	return a.accounting.Close()
}

func newAppBackgroundRunner(cfg Config, services appServices) (*background.Runner, error) {
	runner := background.NewRunner(services.Operations, cfg.clock(), cfg.Operations.ErrorLog)
	op := background.Operation{
		ID:         operationruns.ExchangeRateLoadingOperationID,
		Key:        string(operationruns.ExchangeRateLoadingOperationID),
		Run:        exchangeRateOperationRun(services.ExchangeRateLoading.Load),
		StartupRun: startupExchangeRateLoad(cfg, services.StartupExchangeRateLoading),
		Timeout:    2 * time.Minute,
		MaxRetries: 2,
	}
	if cfg.Operations.Enabled && cfg.ExchangeRates.AutomaticLoadingEnabled {
		op.Startup = true
		op.Schedule = cfg.ExchangeRates.LoadScheduleUTC
	}
	if err := runner.Register(op); err != nil {
		return nil, err
	}

	services.Operations.SetTrigger(runner)

	return runner, nil
}

func startupExchangeRateLoad(cfg Config, loader *exchangerateloading.Service) background.OperationFunc {
	return func(ctx context.Context) error {
		if cfg.Dependencies.StartupExchangeRateProviderFactory == nil &&
			exchangeRateStartupProvider(cfg) == "frankfurter_file" {
			if err := ensureFrankfurterCache(ctx, cfg); err != nil {
				return classifyExchangeRateOperationError(err)
			}
		}

		return classifyExchangeRateOperationError(loader.Load(ctx))
	}
}

func exchangeRateOperationRun(run background.OperationFunc) background.OperationFunc {
	return func(ctx context.Context) error {
		return classifyExchangeRateOperationError(run(ctx))
	}
}

func classifyExchangeRateOperationError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return background.Canceled(err)
	case errors.Is(err, exchangerateloading.ErrProviderUnavailable), errors.Is(err, exchangerateloading.ErrProviderTimeout):
		return background.Transient(err)
	default:
		return background.Permanent(err)
	}
}

func ensureFrankfurterCache(ctx context.Context, cfg Config) error {
	path, err := frankfurter.CachePath(cfg.CacheDir)
	if err != nil {
		return err
	}
	from, to := frankfurter.DefaultHistoryWindow(cfg.clock())

	return frankfurter.PopulateCache(ctx, frankfurter.CacheOptions{
		BaseURL: cfg.ExchangeRates.Providers.Frankfurter.BaseURL,
		Path:    path,
		From:    from,
		To:      to,
	})
}

func exchangeRateStartupProvider(cfg Config) string {
	if cfg.ExchangeRates.StartupProvider == "" {
		return "frankfurter_file"
	}

	return cfg.ExchangeRates.StartupProvider
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
