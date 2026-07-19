package runtime

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/mishamsk/mina/internal/appconfig"
	"github.com/mishamsk/mina/internal/background"
	"github.com/mishamsk/mina/internal/httpapi"
	"github.com/mishamsk/mina/internal/mcpserver"
	backupfile "github.com/mishamsk/mina/internal/providers/backups/file"
	"github.com/mishamsk/mina/internal/providers/exchangerates/frankfurter"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/backups"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/creditlimits"
	"github.com/mishamsk/mina/internal/services/dbvalidation"
	"github.com/mishamsk/mina/internal/services/demo"
	"github.com/mishamsk/mina/internal/services/exchangerateloading"
	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/health"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/operationruns"
	"github.com/mishamsk/mina/internal/services/recurring"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/transactiontemplates"
	"github.com/mishamsk/mina/internal/store"
	"github.com/mishamsk/mina/internal/webui"
)

// App owns one opened accounting state, app services, and composed HTTP handler.
type App struct {
	appDB             *store.AppDB
	services          appServices
	handler           http.Handler
	background        *background.Runner
	executionProfile  ExecutionProfile
	operationsMu      sync.Mutex
	operationsStarted bool
}

type appServices struct {
	httpapi.Dependencies
	Backup                     *backups.Service
	ExchangeRateLoading        *exchangerateloading.Service
	StartupExchangeRateLoading *exchangerateloading.Service
	ReferenceSerializer        *referenceSerializer
}

// New opens the configured database, applies migrations, and wires the composed HTTP handler.
func New(ctx context.Context, cfg appconfig.Config, opts Options) (*App, error) {
	return newApp(ctx, cfg, opts, store.OpenAppDB)
}

// NewWithProcessDB applies migrations using an existing DuckDB process handle and wires the composed HTTP handler.
func NewWithProcessDB(ctx context.Context, db *sql.DB, cfg appconfig.Config, opts Options) (*App, error) {
	return newApp(ctx, cfg, opts, func(ctx context.Context, request store.AppDBOpenRequest) (*store.AppDB, error) {
		return store.OpenAppDBWithProcessDB(ctx, db, request)
	})
}

func newApp(
	ctx context.Context,
	cfg appconfig.Config,
	opts Options,
	openAppDB func(context.Context, store.AppDBOpenRequest) (*store.AppDB, error),
) (*App, error) {
	if err := opts.validateExecutionProfile(); err != nil {
		return nil, err
	}
	if err := Validate(cfg, opts.automaticOperationsEnabled()); err != nil {
		return nil, err
	}
	if cfg.DatabasePath != "" {
		if err := prepareDatabasePath(cfg.DatabasePath); err != nil {
			return nil, err
		}
	}

	appDB, err := openAppDB(ctx, AppDBOpenRequest(cfg))
	if err != nil {
		return nil, err
	}

	if err := store.Migrate(ctx, appDB); err != nil {
		return nil, closeAppDBAfterError(appDB, fmt.Errorf("migrate database: %w", err))
	}
	if opts.ExecutionProfile == ExecutionProfileLongRunning {
		if err := validateStartupDatabase(ctx, cfg, appDB); err != nil {
			return nil, closeAppDBAfterError(appDB, err)
		}
	}

	app, err := NewWithAppDB(ctx, appDB, cfg, opts)
	if err != nil {
		return nil, closeAppDBAfterError(appDB, err)
	}

	return app, nil
}

// ValidateDatabase opens and validates the selected accounting database without writing to it.
func ValidateDatabase(ctx context.Context, cfg appconfig.Config, level dbvalidation.Level) (dbvalidation.Report, error) {
	if err := Validate(cfg, false); err != nil {
		return dbvalidation.Report{}, err
	}
	appDB, err := store.OpenAppDBReadOnly(ctx, AppDBOpenRequest(cfg))
	if err != nil {
		return dbvalidation.Report{}, err
	}
	defer func() {
		_ = appDB.Close()
	}()
	exists, err := store.AccountingLocationExists(ctx, appDB)
	if err != nil {
		return dbvalidation.Report{}, err
	}
	if !exists {
		return dbvalidation.Report{}, fmt.Errorf("accounting schema %q does not exist in database %s", appDB.Location().Schema(), cfg.DatabasePath)
	}

	return dbvalidation.NewService(
		store.NewDBValidationStore(appDB),
		store.NewTransactionStore(appDB),
	).Validate(ctx, level)
}

// Database validation levels exposed through runtime so commands stay thin.
const (
	DatabaseValidationLevelShallow = dbvalidation.LevelShallow
	DatabaseValidationLevelFull    = dbvalidation.LevelFull
)

// IsDatabaseValidationInternalError reports whether err should map to validator exit code 2.
func IsDatabaseValidationInternalError(err error) bool {
	return dbvalidation.IsInternal(err)
}

func validateStartupDatabase(ctx context.Context, cfg appconfig.Config, appDB *store.AppDB) error {
	if cfg.DatabasePath == "" {
		return nil
	}
	level, enabled, err := startupValidationLevel(cfg)
	if err != nil {
		return err
	}
	if !enabled {
		return nil
	}
	report, err := dbvalidation.NewService(
		store.NewDBValidationStore(appDB),
		store.NewTransactionStore(appDB),
	).Validate(ctx, level)
	if err != nil {
		return err
	}
	if !report.HasErrors() {
		return nil
	}

	var buffer bytes.Buffer
	if err := report.Write(&buffer); err != nil {
		return err
	}

	return fmt.Errorf("database validation failed:\n%s", strings.TrimSpace(buffer.String()))
}

// HasPendingMigrations reports whether the configured accounting database would be migrated at startup.
func HasPendingMigrations(ctx context.Context, cfg appconfig.Config, operationsEnabled bool) (bool, error) {
	if err := Validate(cfg, operationsEnabled); err != nil {
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

	appDB, err := store.OpenAppDBReadOnly(ctx, AppDBOpenRequest(cfg))
	if err != nil {
		return false, err
	}
	defer func() {
		_ = appDB.Close()
	}()

	return store.HasPendingMigrations(ctx, appDB)
}

// AccountingSchemaExists reports whether the configured file-backed accounting schema exists.
func AccountingSchemaExists(ctx context.Context, cfg appconfig.Config, operationsEnabled bool) (bool, error) {
	if err := Validate(cfg, operationsEnabled); err != nil {
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

	appDB, err := store.OpenAppDBReadOnly(ctx, AppDBOpenRequest(cfg))
	if err != nil {
		return false, err
	}
	defer func() {
		_ = appDB.Close()
	}()

	return store.AccountingLocationExists(ctx, appDB)
}

// NewWithAppDB wires services and the composed HTTP handler around an already-opened migrated AppDB.
func NewWithAppDB(ctx context.Context, appDB *store.AppDB, cfg appconfig.Config, opts Options) (*App, error) {
	if err := opts.validateExecutionProfile(); err != nil {
		return nil, err
	}
	operationRepo, err := store.NewOperationRunRepository(ctx, appDB)
	if err != nil {
		return nil, err
	}
	services, err := newAppServices(appDB, cfg, opts, operationRepo)
	if err != nil {
		return nil, err
	}
	backgroundRunner, err := newAppBackgroundRunner(cfg, opts, services)
	if err != nil {
		return nil, err
	}
	restHandler := httpapi.NewWithOptions(services.Dependencies, httpapi.Options{
		Timeout: opts.HTTP.Timeout,
	})
	var mcpHandler http.Handler
	if opts.ExecutionProfile == ExecutionProfileLongRunning {
		mcpHandler, err = mcpserver.NewStreamableHTTP(restHandler, mcpserver.Options{
			Version: opts.HTTP.MCPVersion,
		})
		if err != nil {
			return nil, err
		}
	}
	handler := composeHTTPHandler(restHandler, mcpHandler, webui.New())
	if opts.HTTP.AccessLog != nil {
		handler = httpapi.AccessLogger(opts.HTTP.AccessLog)(handler)
	}

	app := &App{
		appDB:            appDB,
		services:         services,
		handler:          handler,
		background:       backgroundRunner,
		executionProfile: opts.ExecutionProfile,
	}
	if opts.automaticOperationsEnabled() && !opts.Operations.DeferStart {
		app.StartOperations()
	}

	return app, nil
}

func newAppServices(appDB *store.AppDB, cfg appconfig.Config, opts Options, operationRepo operationruns.Repository) (appServices, error) {
	referenceSerializer := &referenceSerializer{}
	services, err := newAccountingServices(appDB, cfg, opts, operationRepo, referenceSerializer)
	if err != nil {
		return appServices{}, err
	}
	services.Demo = newDemoService(appDB, cfg, opts, services)

	return services, nil
}

func composeHTTPHandler(restHandler http.Handler, mcpHandler http.Handler, webUIHandler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			restHandler.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/mcp" && mcpHandler != nil {
			mcpHandler.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/ui" || strings.HasPrefix(r.URL.Path, "/ui/") {
			target := strings.TrimPrefix(r.URL.Path, "/ui")
			target = "/" + strings.TrimLeft(target, "/")
			if r.URL.RawQuery != "" {
				target += "?" + r.URL.RawQuery
			}
			http.Redirect(w, r, target, http.StatusPermanentRedirect)
			return
		}

		webUIHandler.ServeHTTP(w, r)
	})
}

func newAccountingServices(
	appDB *store.AppDB,
	cfg appconfig.Config,
	opts Options,
	operationRepo operationruns.Repository,
	referenceSerializer *referenceSerializer,
) (appServices, error) {
	exchangeRateStore := store.NewExchangeRateStore(appDB)
	startupProvider, err := startupExchangeRateProvider(cfg, opts)
	if err != nil {
		return appServices{}, err
	}
	exchangeRates := exchangerates.NewService(exchangeRateStore)
	exchangeRateLoading := exchangerateloading.NewService(
		exchangeRateStore,
		exchangeRates,
		exchangeRateProvider(cfg, opts),
		opts.clock(),
	)
	startupExchangeRateLoading := exchangerateloading.NewService(
		exchangeRateStore,
		exchangeRates,
		startupProvider,
		opts.clock(),
	)
	currencyUsageChanged := func() {
		exchangeRateLoading.InvalidateCurrencyCache()
		startupExchangeRateLoading.InvalidateCurrencyCache()
	}
	backupProvider, err := fileBackupProvider(cfg, opts)
	if err != nil {
		return appServices{}, err
	}
	backupService := backups.NewService(
		store.NewBackupSource(appDB),
		backupProvider,
		opts.clock(),
	)
	operationRuns := operationruns.NewService(
		operationruns.Config{
			ExchangeRateLoading: operationruns.OperationConfig{
				Enabled:     cfg.ExchangeRates.AutomaticLoadingEnabled,
				ScheduleUTC: cfg.ExchangeRates.LoadScheduleUTC,
			},
			DatabaseBackup: operationruns.OperationConfig{
				Enabled:     cfg.Backups.File.Directory != "",
				ScheduleUTC: cfg.Backups.File.ScheduleUTC,
			},
		},
		operationRepo,
		opts.clock(),
	)
	accountStore := store.NewAccountStore(appDB)
	categoryStore := store.NewCategoryStore(appDB)
	tagStore := store.NewTagStore(appDB)
	memberStore := store.NewMemberStore(appDB)
	accountService := accounts.NewService(accountStore, referenceSerializer)
	categoryService := categories.NewService(categoryStore, referenceSerializer)
	tagService := tags.NewService(tagStore, referenceSerializer)
	memberService := members.NewService(memberStore, referenceSerializer)
	templateService := transactiontemplates.NewService(
		store.NewTransactionTemplateStore(appDB),
		accountService,
		categoryService,
		tagService,
		memberService,
		referenceSerializer,
	)
	transactionService := transactions.NewService(
		store.NewTransactionStore(appDB),
		accountService,
		categoryService,
		tagService,
		memberService,
		exchangeRates,
		referenceSerializer,
		currencyUsageChanged,
	)
	accountService.SetTypeChangeValidator(transactionService)
	return appServices{
		Dependencies: httpapi.Dependencies{
			Health:        health.NewService(store.NewHealthStore(appDB)),
			Operations:    operationRuns,
			Categories:    categoryService,
			Tags:          tagService,
			Members:       memberService,
			Accounts:      accountService,
			CreditLimits:  creditlimits.NewService(store.NewCreditLimitHistoryStore(appDB), accountService, referenceSerializer),
			ExchangeRates: exchangeRates,
			Transactions:  transactionService,
			Templates:     templateService,
			Recurring: recurring.NewService(
				store.NewRecurringStore(appDB),
				accountService,
				categoryService,
				tagService,
				memberService,
				templateService,
				exchangeRates,
				referenceSerializer,
				currencyUsageChanged,
			),
			Clock: opts.clock(),
		},
		Backup:                     backupService,
		ExchangeRateLoading:        exchangeRateLoading,
		StartupExchangeRateLoading: startupExchangeRateLoading,
		ReferenceSerializer:        referenceSerializer,
	}, nil
}

func fileBackupProvider(cfg appconfig.Config, opts Options) (backups.Provider, error) {
	if opts.Dependencies.BackupProvider != nil {
		return opts.Dependencies.BackupProvider, nil
	}
	if cfg.Backups.File.Directory == "" {
		return nil, nil
	}

	return backupfile.New(backupfile.Options{
		Directory:      cfg.Backups.File.Directory,
		RetentionCount: cfg.Backups.File.RetentionCount,
	})
}

func exchangeRateProvider(cfg appconfig.Config, opts Options) exchangerateloading.RateProvider {
	if opts.Dependencies.ExchangeRateProviderFactory != nil {
		return opts.Dependencies.ExchangeRateProviderFactory
	}

	return frankfurter.NewTargetedProvider(frankfurter.Options{
		BaseURL: cfg.ExchangeRates.Frankfurter.BaseURL,
		Clock:   opts.clock(),
	})
}

func startupExchangeRateProvider(cfg appconfig.Config, opts Options) (exchangerateloading.RateProvider, error) {
	if opts.Dependencies.StartupExchangeRateProviderFactory != nil {
		return opts.Dependencies.StartupExchangeRateProviderFactory, nil
	}
	if !opts.automaticOperationsEnabled() || !cfg.ExchangeRates.AutomaticLoadingEnabled {
		return exchangeRateProvider(cfg, opts), nil
	}
	if exchangeRateStartupProvider(cfg) == "frankfurter_api" {
		return exchangeRateProvider(cfg, opts), nil
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
		Recurring:     s.Recurring,
		Transactions:  s.Transactions,
	}
}

func newDemoService(appDB *store.AppDB, cfg appconfig.Config, opts Options, mainServices appServices) *demo.Service {
	return demo.NewService(demo.Dependencies{
		Clock: opts.clock(),
		Atomic: func(ctx context.Context, fn func(demo.Services) error) error {
			if err := appDB.WithTx(ctx, nil, func(txAppDB *store.AppDB) error {
				txServices, err := newAccountingServices(txAppDB, cfg, opts, nil, mainServices.ReferenceSerializer)
				if err != nil {
					return err
				}

				return fn(demoDependencies(txServices))
			}); err != nil {
				return err
			}

			invalidateReferenceCaches(mainServices)
			return nil
		},
	})
}

func invalidateReferenceCaches(services appServices) {
	services.Accounts.InvalidateReferenceCache()
	services.Categories.InvalidateReferenceCache()
	services.Tags.InvalidateReferenceCache()
	services.Members.InvalidateReferenceCache()
	services.ExchangeRateLoading.InvalidateCurrencyCache()
	services.StartupExchangeRateLoading.InvalidateCurrencyCache()
}

// AccountingLocation returns the database and schema holding accounting state.
func (a *App) AccountingLocation() store.AccountingLocation {
	return a.appDB.Location()
}

// SeedDemo seeds deterministic demo data for startup demo mode.
func (a *App) SeedDemo(ctx context.Context) (demo.Summary, error) {
	return a.services.Demo.Seed(ctx)
}

// StartOperations starts runtime-owned startup and recurring operations once.
func (a *App) StartOperations() {
	if a == nil || a.background == nil || a.executionProfile != ExecutionProfileLongRunning {
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

// Handler returns the composed HTTP handler.
func (a *App) Handler() http.Handler {
	return a.handler
}

// Close releases process resources owned by the app.
func (a *App) Close() error {
	if a.background != nil {
		a.background.Close()
	}
	if a.appDB == nil {
		return nil
	}

	return a.appDB.Close()
}

func newAppBackgroundRunner(cfg appconfig.Config, opts Options, services appServices) (*background.Runner, error) {
	runner := background.NewRunner(services.Operations, opts.clock(), opts.Operations.ErrorLog)
	op := background.Operation{
		ID:         operationruns.ExchangeRateLoadingOperationID,
		Key:        string(operationruns.ExchangeRateLoadingOperationID),
		Run:        exchangeRateOperationRun(services.ExchangeRateLoading.Load, services.Transactions.BackfillMissingAmountUSD),
		StartupRun: startupExchangeRateLoad(cfg, opts, services.StartupExchangeRateLoading, services.Transactions.BackfillMissingAmountUSD),
		Timeout:    2 * time.Minute,
		MaxRetries: 2,
	}
	if opts.automaticOperationsEnabled() && cfg.ExchangeRates.AutomaticLoadingEnabled {
		op.Startup = true
		op.Schedule = cfg.ExchangeRates.LoadScheduleUTC
	}
	if err := runner.Register(op); err != nil {
		return nil, err
	}

	backupOp := background.Operation{
		ID:         operationruns.DatabaseBackupOperationID,
		Key:        string(operationruns.DatabaseBackupOperationID),
		Run:        databaseBackupOperationRun(services.Backup.Run),
		Timeout:    2 * time.Minute,
		MaxRetries: 0,
	}
	if opts.automaticOperationsEnabled() && cfg.Backups.File.ScheduleUTC != "" {
		backupOp.Schedule = cfg.Backups.File.ScheduleUTC
	}
	if err := runner.Register(backupOp); err != nil {
		return nil, err
	}

	services.Operations.SetTrigger(runner)

	return runner, nil
}

func startupExchangeRateLoad(
	cfg appconfig.Config,
	opts Options,
	loader *exchangerateloading.Service,
	backfill func(context.Context) error,
) background.OperationFunc {
	return func(ctx context.Context) error {
		if opts.Dependencies.StartupExchangeRateProviderFactory == nil &&
			exchangeRateStartupProvider(cfg) == "frankfurter_file" {
			if err := ensureFrankfurterCache(ctx, cfg, opts); err != nil {
				return classifyExchangeRateOperationError(err)
			}
		}

		return runExchangeRateLoadWithBackfill(ctx, loader.Load, backfill)
	}
}

func exchangeRateOperationRun(run background.OperationFunc, backfill func(context.Context) error) background.OperationFunc {
	return func(ctx context.Context) error {
		return runExchangeRateLoadWithBackfill(ctx, run, backfill)
	}
}

func runExchangeRateLoadWithBackfill(ctx context.Context, run background.OperationFunc, backfill func(context.Context) error) error {
	loadErr := run(ctx)
	if errors.Is(loadErr, context.Canceled) || errors.Is(loadErr, context.DeadlineExceeded) {
		return classifyExchangeRateOperationError(loadErr)
	}
	if backfill != nil {
		if err := backfill(ctx); err != nil {
			return classifyExchangeRateOperationError(err)
		}
	}

	return classifyExchangeRateOperationError(loadErr)
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

func databaseBackupOperationRun(run background.OperationFunc) background.OperationFunc {
	return func(ctx context.Context) error {
		return classifyDatabaseBackupOperationError(run(ctx))
	}
}

func classifyDatabaseBackupOperationError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return background.Canceled(err)
	default:
		return background.Permanent(err)
	}
}

func ensureFrankfurterCache(ctx context.Context, cfg appconfig.Config, opts Options) error {
	path, err := frankfurter.CachePath(cfg.CacheDir)
	if err != nil {
		return err
	}
	from, to := frankfurter.DefaultHistoryWindow(opts.clock())

	return frankfurter.PopulateCache(ctx, frankfurter.CacheOptions{
		BaseURL:    cfg.ExchangeRates.Frankfurter.BaseURL,
		Path:       path,
		From:       from,
		To:         to,
		HTTPClient: opts.Dependencies.FrankfurterCacheHTTPClient,
	})
}

func exchangeRateStartupProvider(cfg appconfig.Config) string {
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

func closeAppDBAfterError(appDB *store.AppDB, err error) error {
	if closeErr := appDB.Close(); closeErr != nil {
		return fmt.Errorf("%w; close database: %w", err, closeErr)
	}

	return err
}
