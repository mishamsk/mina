package apptest

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	_ "github.com/duckdb/duckdb-go/v2"

	"github.com/mishamsk/mina/internal/appconfig"
	"github.com/mishamsk/mina/internal/httpclient"
	"github.com/mishamsk/mina/internal/runtime"
	"github.com/mishamsk/mina/internal/services/exchangerateloading"
)

const duckDBDriverName = "duckdb"

// Client sends generated REST requests through an in-process app handler.
type Client struct {
	t      *testing.T
	rest   *httpclient.ClientWithResponses
	app    *runtime.App
	closed bool
}

// FakeClock is a test clock for runtime-owned current-time decisions.
type FakeClock struct {
	mu  sync.Mutex
	now time.Time
}

// NewFakeClock returns a fake clock fixed at now.
func NewFakeClock(now time.Time) *FakeClock {
	return &FakeClock{now: now}
}

// Now returns the fake current time.
func (c *FakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.now
}

// Set moves the fake current time.
func (c *FakeClock) Set(now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.now = now
}

// Advance moves the fake current time forward.
func (c *FakeClock) Advance(duration time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.now = c.now.Add(duration)
}

// Option customizes an in-process app test client.
type Option func(*clientOptions)

type clientOptions struct {
	config                    appconfig.Config
	accountingSchemaSpecified bool
	runtimeOptions            runtime.Options
	processDB                 *ProcessDB
}

// ProcessDB is a reusable in-memory DuckDB process handle for app tests.
type ProcessDB struct {
	db *sql.DB
}

// SettingsSourceValues describes representative settings values by effective source.
type SettingsSourceValues struct {
	ConfigFile                  string
	ConfigFileMissing           bool
	EnvironmentBackupDirectory  string
	CLIOverrideAccountingSchema *string
	CLIOverrideServePort        *int
}

// WithSettingsSources creates a test-owned settings source scenario.
func WithSettingsSources(
	t *testing.T,
	values SettingsSourceValues,
) (Option, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.toml")
	if !values.ConfigFileMissing {
		if err := os.WriteFile(path, []byte(values.ConfigFile), 0o600); err != nil {
			t.Fatalf("write settings config fixture: %v", err)
		}
	}
	environment := map[string]string{}
	if values.EnvironmentBackupDirectory != "" {
		environment["MINA_BACKUP_FILE_DIRECTORY"] = values.EnvironmentBackupDirectory
	}
	restoreEnvironment := isolateSettingsEnvironment(t, environment)
	defer restoreEnvironment()

	overrides := appconfig.Overrides{CacheDir: appconfig.Set(filepath.Join(t.TempDir(), "cache"))}
	if values.CLIOverrideAccountingSchema != nil {
		overrides.AccountingSchema = appconfig.Set(*values.CLIOverrideAccountingSchema)
	}
	if values.CLIOverrideServePort != nil {
		overrides.Serve.Port = appconfig.Set(*values.CLIOverrideServePort)
	}
	cfg, err := appconfig.Load(
		appconfig.LoadOptions{ConfigFilePath: path},
		overrides,
	)
	if err != nil {
		t.Fatalf("load test app config: %v", err)
	}

	return func(opts *clientOptions) {
		opts.config = cfg
		opts.accountingSchemaSpecified = values.CLIOverrideAccountingSchema != nil
	}, path
}

func isolateSettingsEnvironment(
	t *testing.T,
	environment map[string]string,
) func() {
	t.Helper()
	type originalValue struct {
		value string
		set   bool
	}
	original := make(map[string]originalValue)
	for _, source := range appconfig.Sources() {
		if source.EnvVar == "" {
			continue
		}
		value, set := os.LookupEnv(source.EnvVar)
		original[source.EnvVar] = originalValue{value: value, set: set}
		requested, exists := environment[source.EnvVar]
		var err error
		if exists {
			err = os.Setenv(source.EnvVar, requested)
		} else {
			err = os.Unsetenv(source.EnvVar)
		}
		if err != nil {
			t.Fatalf("isolate test environment variable %s: %v", source.EnvVar, err)
		}
	}

	return func() {
		for name, value := range original {
			var err error
			if value.set {
				err = os.Setenv(name, value.value)
			} else {
				err = os.Unsetenv(name)
			}
			if err != nil {
				t.Fatalf("restore test environment variable %s: %v", name, err)
			}
		}
	}
}

// OpenProcessDB opens a reusable in-memory DuckDB process handle for app tests.
func OpenProcessDB(ctx context.Context) (*ProcessDB, error) {
	db, err := sql.Open(duckDBDriverName, ":memory:")
	if err != nil {
		return nil, fmt.Errorf("open in-memory duckdb process database: %w", err)
	}
	db.SetMaxOpenConns(1)

	if err := db.PingContext(ctx); err != nil {
		if closeErr := db.Close(); closeErr != nil {
			return nil, fmt.Errorf("ping in-memory duckdb process database: %w; close database: %w", err, closeErr)
		}
		return nil, fmt.Errorf("ping in-memory duckdb process database: %w", err)
	}

	return &ProcessDB{db: db}, nil
}

// Close releases the reusable process database.
func (db *ProcessDB) Close() error {
	if db == nil || db.db == nil {
		return nil
	}

	return db.db.Close()
}

// WithDatabasePath uses an attached DuckDB file as the app accounting database.
func WithDatabasePath(path string) Option {
	return func(opts *clientOptions) {
		opts.config.DatabasePath = path
	}
}

// WithAccountingSchema customizes the accounting schema used by the test app.
func WithAccountingSchema(schema string) Option {
	return func(opts *clientOptions) {
		opts.config.AccountingSchema = schema
		opts.accountingSchemaSpecified = true
	}
}

// WithCacheDir customizes the process cache directory used by the test app.
func WithCacheDir(path string) Option {
	return func(opts *clientOptions) {
		opts.config.CacheDir = path
	}
}

// WithProcessDB reuses an existing DuckDB process database for the test app.
func WithProcessDB(db *ProcessDB) Option {
	return func(opts *clientOptions) {
		opts.processDB = db
	}
}

// WithClock injects a runtime clock dependency.
func WithClock(clock runtime.Clock) Option {
	return func(opts *clientOptions) {
		opts.runtimeOptions.Dependencies.Clock = clock
	}
}

// WithExchangeRateProviderFactory injects the provider factory used by exchange-rate loading.
func WithExchangeRateProviderFactory(factory exchangerateloading.RateProvider) Option {
	return func(opts *clientOptions) {
		opts.runtimeOptions.Dependencies.ExchangeRateProviderFactory = factory
		opts.runtimeOptions.Dependencies.StartupExchangeRateProviderFactory = factory
	}
}

// WithExchangeRateLoading configures automatic exchange-rate loading through app config.
func WithExchangeRateLoading(enabled bool) Option {
	return func(opts *clientOptions) {
		opts.config.ExchangeRates.AutomaticLoadingEnabled = enabled
	}
}

// WithExchangeRateLoadScheduleUTC configures the automatic exchange-rate loading schedule through app config.
func WithExchangeRateLoadScheduleUTC(schedule string) Option {
	return func(opts *clientOptions) {
		opts.config.ExchangeRates.LoadScheduleUTC = schedule
	}
}

// WithExchangeRateStartupProvider configures the automatic startup exchange-rate provider.
func WithExchangeRateStartupProvider(provider string) Option {
	return func(opts *clientOptions) {
		opts.config.ExchangeRates.StartupProvider = provider
	}
}

// WithFrankfurterCacheHTTPClient injects the HTTP client used to populate the Frankfurter cache.
func WithFrankfurterCacheHTTPClient(client *http.Client) Option {
	return func(opts *clientOptions) {
		opts.runtimeOptions.Dependencies.FrankfurterCacheHTTPClient = client
	}
}

// WithBackupFileDirectory configures the local backup directory through app config.
func WithBackupFileDirectory(path string) Option {
	return func(opts *clientOptions) {
		opts.config.Backups.File.Directory = path
	}
}

// WithBackupFileRetentionCount configures local backup retention through app config.
func WithBackupFileRetentionCount(count int) Option {
	return func(opts *clientOptions) {
		opts.config.Backups.File.RetentionCount = count
	}
}

// WithBackupFileScheduleUTC configures the local backup schedule through app config.
func WithBackupFileScheduleUTC(schedule string) Option {
	return func(opts *clientOptions) {
		opts.config.Backups.File.ScheduleUTC = schedule
	}
}

// WithBlockedDatabaseBackup makes database backup runs block until the blocker is released.
func WithBlockedDatabaseBackup(blocker *BlockedDatabaseBackup) Option {
	return func(opts *clientOptions) {
		if blocker != nil {
			opts.runtimeOptions.Dependencies.BackupProvider = blocker.provider
		}
	}
}

// WithOperationsEnabled configures runtime operation execution through runtime options.
func WithOperationsEnabled(enabled bool) Option {
	return func(opts *clientOptions) {
		opts.runtimeOptions.Operations.Enabled = enabled
	}
}

// WithOneShotExecutionProfile selects the one-shot runtime policy for the test app.
func WithOneShotExecutionProfile() Option {
	return func(opts *clientOptions) {
		opts.runtimeOptions.ExecutionProfile = runtime.ExecutionProfileOneShot
	}
}

// New creates an in-process app backed by migrated in-memory DuckDB state.
func New(t *testing.T, options ...Option) *Client {
	t.Helper()

	client, err := NewResult(t, options...)
	if err != nil {
		t.Fatalf("new test app: %v", err)
	}

	return client
}

// NewResult creates an in-process app and returns composition errors to the caller.
func NewResult(t *testing.T, options ...Option) (*Client, error) {
	t.Helper()

	ctx := context.Background()
	schema := testSchemaName(t)
	cfg := appconfig.DefaultConfig()
	cfg.AccountingSchema = schema
	operationalDir := t.TempDir()
	cfg.CacheDir = filepath.Join(operationalDir, "cache")
	cfg.ConfigFilePath = filepath.Join(operationalDir, "config.toml")
	cfg.ExchangeRates.AutomaticLoadingEnabled = false
	opts := clientOptions{
		config: cfg,
		runtimeOptions: runtime.Options{
			ExecutionProfile: runtime.ExecutionProfileLongRunning,
		},
	}
	for _, option := range options {
		option(&opts)
	}
	if opts.config.AccountingSchema == "" && !opts.accountingSchemaSpecified {
		opts.config.AccountingSchema = schema
	}

	var appInstance *runtime.App
	var err error
	if opts.processDB != nil {
		appInstance, err = runtime.NewWithProcessDB(ctx, opts.processDB.db, opts.config, opts.runtimeOptions)
	} else {
		appInstance, err = runtime.New(ctx, opts.config, opts.runtimeOptions)
	}
	if err != nil {
		return nil, err
	}
	restClient, err := httpclient.NewInProcessClient(appInstance.Handler())
	if err != nil {
		if closeErr := appInstance.Close(); closeErr != nil {
			return nil, fmt.Errorf("new generated REST client: %w; close app: %w", err, closeErr)
		}
		return nil, fmt.Errorf("new generated REST client: %w", err)
	}
	client := &Client{
		t:    t,
		rest: restClient,
		app:  appInstance,
	}
	t.Cleanup(client.Close)

	return client, nil
}

// REST returns the generated in-process REST client.
func (c *Client) REST() *httpclient.ClientWithResponses {
	c.t.Helper()

	return c.rest
}

// Close releases resources owned by the in-process test app.
func (c *Client) Close() {
	c.t.Helper()
	if c.closed {
		return
	}
	c.closed = true
	if err := c.app.Close(); err != nil {
		c.t.Fatalf("close test app: %v", err)
	}
}

func testSchemaName(t *testing.T) string {
	t.Helper()

	name := strings.ToLower(t.Name())
	var builder strings.Builder
	builder.WriteString("test_")
	for _, char := range name {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
		default:
			builder.WriteByte('_')
		}
	}

	return builder.String()
}
