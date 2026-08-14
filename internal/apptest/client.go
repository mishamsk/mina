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
	"sync/atomic"
	"testing"
	"time"

	_ "github.com/duckdb/duckdb-go/v2"

	"github.com/mishamsk/mina/internal/appconfig"
	"github.com/mishamsk/mina/internal/httpclient"
	"github.com/mishamsk/mina/internal/runtime"
	"github.com/mishamsk/mina/internal/services/exchangerateloading"
)

const duckDBDriverName = "duckdb"

var accountingSchemaSequence atomic.Uint64
var accountingSchemaNames sync.Map

type accountingSchemaKey struct {
	t     testing.TB
	label string
}

// Client sends generated REST requests through an in-process app handler.
type Client struct {
	t      *testing.T
	rest   *httpclient.ClientWithResponses
	app    *runtime.App
	clock  runtime.Clock
	closed bool
}

// FakeClock is a test clock for runtime-owned current-time decisions.
type FakeClock struct {
	mu        sync.Mutex
	now       time.Time
	waiters   map[*fakeClockWaiter]struct{}
	waitCalls int
}

type fakeClockWaiter struct {
	deadline time.Time
	ready    chan struct{}
}

// NewFakeClock returns a fake clock fixed at now.
func NewFakeClock(now time.Time) *FakeClock {
	return &FakeClock{now: now, waiters: make(map[*fakeClockWaiter]struct{})}
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
	c.now = now
	due := c.dueWaitersLocked()
	c.mu.Unlock()
	for _, waiter := range due {
		close(waiter.ready)
	}
}

// Advance moves the fake current time forward.
func (c *FakeClock) Advance(duration time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(duration)
	due := c.dueWaitersLocked()
	c.mu.Unlock()
	for _, waiter := range due {
		close(waiter.ready)
	}
}

// WaitUntil blocks until fake time reaches deadline or ctx is canceled.
func (c *FakeClock) WaitUntil(ctx context.Context, deadline time.Time) bool {
	c.mu.Lock()
	c.waitCalls++
	if !c.now.Before(deadline) {
		c.mu.Unlock()
		return true
	}
	waiter := &fakeClockWaiter{deadline: deadline, ready: make(chan struct{})}
	c.waiters[waiter] = struct{}{}
	c.mu.Unlock()

	select {
	case <-waiter.ready:
		return true
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.waiters, waiter)
		c.mu.Unlock()
		return false
	}
}

// PendingDeadlineWaits returns the number of clock deadlines currently waiting.
func (c *FakeClock) PendingDeadlineWaits() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return len(c.waiters)
}

// DeadlineWaitCalls returns the total number of deadline waits begun.
func (c *FakeClock) DeadlineWaitCalls() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.waitCalls
}

// WaitForPendingDeadlineWaits waits for recurring operation loops to install their clock waits.
func (c *FakeClock) WaitForPendingDeadlineWaits(t testing.TB, count int) {
	t.Helper()
	awaitCondition(t, fmt.Sprintf("%d pending fake-clock deadline waits", count), func(context.Context) (struct{}, bool) {
		return struct{}{}, c.PendingDeadlineWaits() == count
	})
}

// WaitForDeadline waits until a fake-clock waiter is installed for deadline.
func (c *FakeClock) WaitForDeadline(t testing.TB, deadline time.Time) {
	t.Helper()
	awaitCondition(t, fmt.Sprintf("fake-clock deadline %s", deadline.Format(time.RFC3339Nano)), func(context.Context) (struct{}, bool) {
		c.mu.Lock()
		defer c.mu.Unlock()
		for waiter := range c.waiters {
			if waiter.deadline.Equal(deadline) {
				return struct{}{}, true
			}
		}
		return struct{}{}, false
	})
}

func (c *FakeClock) dueWaitersLocked() []*fakeClockWaiter {
	due := []*fakeClockWaiter{}
	for waiter := range c.waiters {
		if c.now.Before(waiter.deadline) {
			continue
		}
		delete(c.waiters, waiter)
		due = append(due, waiter)
	}

	return due
}

// Option customizes an in-process app test client.
type Option func(*clientOptions)

type clientOptions struct {
	config                    appconfig.Config
	accountingSchemaSpecified bool
	databaseEncryptionKey     *string
	runtimeOptions            runtime.Options
	processDB                 *ProcessDB
}

// ProcessDB is a reusable in-memory DuckDB process handle for app tests.
type ProcessDB struct {
	db *sql.DB
}

// SettingsSourceValues describes representative settings values by effective source.
type SettingsSourceValues struct {
	ConfigFile                            string
	ConfigFileMissing                     bool
	AuthenticationEmail                   string
	AuthenticationPassword                string
	EnvironmentBackupDirectory            string
	CLIOverrideAccountingSchema           *string
	CLIOverrideServePort                  *int
	CLIOverrideAuditRetentionMonths       *int
	CLIOverrideAuditCompactionScheduleUTC *string
}

// AuthenticationFixture is test-owned CLI-managed authentication state.
type AuthenticationFixture struct {
	Path     string
	Email    string
	Password string
	APIKey   string
}

// NewAuthenticationFixture initializes a user and active API key in a test-owned file.
func NewAuthenticationFixture(t *testing.T) AuthenticationFixture {
	t.Helper()
	fixture := AuthenticationFixture{
		Path: filepath.Join(t.TempDir(), "auth.toml"), Email: "admin@local", Password: "test-password",
	}
	manager := newAuthenticationAdministration(t, fixture.Path)
	password := []byte(fixture.Password)
	if _, err := manager.Initialize(fixture.Email, password); err != nil {
		clear(password)
		t.Fatalf("initialize authentication file: %v", err)
	}
	clear(password)
	_, token, err := manager.CreateAPIKey("test-automation")
	if err != nil {
		t.Fatalf("create authentication API key: %v", err)
	}
	fixture.APIKey = token
	return fixture
}

// NewAuthenticationFile initializes a test-owned authentication file.
func NewAuthenticationFile(t *testing.T, email string, password string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "auth.toml")
	manager := newAuthenticationAdministration(t, path)
	secret := []byte(password)
	if _, err := manager.Initialize(email, secret); err != nil {
		clear(secret)
		t.Fatalf("initialize authentication file: %v", err)
	}
	clear(secret)
	return path
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
	if values.AuthenticationEmail != "" {
		manager := newAuthenticationAdministration(t, filepath.Join(filepath.Dir(path), "auth.toml"))
		password := []byte(values.AuthenticationPassword)
		if _, err := manager.Initialize(values.AuthenticationEmail, password); err != nil {
			clear(password)
			t.Fatalf("initialize settings authentication file: %v", err)
		}
		clear(password)
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
	if values.CLIOverrideAuditRetentionMonths != nil {
		overrides.AuditLog.RetentionMonths = appconfig.Set(*values.CLIOverrideAuditRetentionMonths)
	}
	if values.CLIOverrideAuditCompactionScheduleUTC != nil {
		overrides.AuditLog.CompactionScheduleUTC = appconfig.Set(*values.CLIOverrideAuditCompactionScheduleUTC)
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

func newAuthenticationAdministration(t *testing.T, path string) *runtime.AuthenticationAdministration {
	t.Helper()
	manager, err := runtime.NewAuthenticationAdministration(appconfig.Config{AuthFile: path})
	if err != nil {
		t.Fatalf("create authentication administration: %v", err)
	}
	return manager
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

// WithDatabaseEncryptionKey supplies the database key through the test app's process environment.
func WithDatabaseEncryptionKey(key string) Option {
	return func(opts *clientOptions) {
		opts.databaseEncryptionKey = &key
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

// WithAuthenticationFile enables authentication from a test-owned file.
func WithAuthenticationFile(path string) Option {
	return func(opts *clientOptions) {
		opts.config.AuthFile = path
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

// WithAuditLogRetentionMonths configures API audit-history retention through app config.
func WithAuditLogRetentionMonths(months int) Option {
	return func(opts *clientOptions) {
		opts.config.AuditLog.RetentionMonths = months
	}
}

// WithAuditLogCompactionScheduleUTC configures the API audit-history compaction schedule through app config.
func WithAuditLogCompactionScheduleUTC(schedule string) Option {
	return func(opts *clientOptions) {
		opts.config.AuditLog.CompactionScheduleUTC = schedule
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
	restoreEncryptionKey := isolateDatabaseEncryptionKey(t)
	defer restoreEncryptionKey()

	ctx := context.Background()
	schema := testSchemaName(t)
	cfg := appconfig.DefaultConfig()
	cfg.AccountingSchema = schema
	operationalDir := t.TempDir()
	cfg.CacheDir = filepath.Join(operationalDir, "cache")
	cfg.ConfigFilePath = filepath.Join(operationalDir, "config.toml")
	cfg.ExchangeRates.AutomaticLoadingEnabled = false
	clock := NewFakeClock(Timestamp("2026-08-14T12:00:00Z"))
	opts := clientOptions{
		config: cfg,
		runtimeOptions: runtime.Options{
			ExecutionProfile: runtime.ExecutionProfileLongRunning,
			Dependencies: runtime.Dependencies{
				Clock: clock,
			},
		},
	}
	for _, option := range options {
		option(&opts)
	}
	if opts.databaseEncryptionKey != nil {
		if err := os.Setenv(appconfig.DatabaseEncryptionKeyEnvironment, *opts.databaseEncryptionKey); err != nil {
			t.Fatalf("set test database encryption key: %v", err)
		}
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
		t:     t,
		rest:  restClient,
		app:   appInstance,
		clock: opts.runtimeOptions.Dependencies.Clock,
	}
	t.Cleanup(client.Close)

	return client, nil
}

func isolateDatabaseEncryptionKey(t *testing.T) func() {
	t.Helper()
	key, present := os.LookupEnv(appconfig.DatabaseEncryptionKeyEnvironment)
	if err := os.Unsetenv(appconfig.DatabaseEncryptionKeyEnvironment); err != nil {
		t.Fatalf("isolate test database encryption key: %v", err)
	}

	return func() {
		if !present {
			return
		}
		if err := os.Setenv(appconfig.DatabaseEncryptionKeyEnvironment, key); err != nil {
			t.Fatalf("restore test database encryption key: %v", err)
		}
	}
}

// REST returns the generated in-process REST client.
func (c *Client) REST() *httpclient.ClientWithResponses {
	c.t.Helper()

	return c.rest
}

// Now returns the test app's current time.
func (c *Client) Now() time.Time {
	c.t.Helper()
	return c.clock.Now()
}

// SetTime moves the test app's fake clock to now.
func (c *Client) SetTime(now time.Time) {
	c.t.Helper()
	c.fakeClock().Set(now)
}

// AdvanceTime advances the test app's fake clock by duration.
func (c *Client) AdvanceTime(duration time.Duration) {
	c.t.Helper()
	c.fakeClock().Advance(duration)
}

func (c *Client) fakeClock() *FakeClock {
	c.t.Helper()
	clock, ok := c.clock.(*FakeClock)
	if !ok {
		c.t.Fatal("test app clock is not an apptest fake clock")
	}
	return clock
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
	return AccountingSchemaName(t, "app")
}

// AccountingSchemaName returns a process-unique schema name without wall time or randomness.
func AccountingSchemaName(t testing.TB, label string) string {
	t.Helper()
	key := accountingSchemaKey{t: t, label: label}
	if existing, ok := accountingSchemaNames.Load(key); ok {
		return existing.(string)
	}

	name := strings.ToLower(t.Name() + "_" + label)
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
	fmt.Fprintf(&builder, "_%d", accountingSchemaSequence.Add(1))

	candidate := builder.String()
	actual, loaded := accountingSchemaNames.LoadOrStore(key, candidate)
	if !loaded {
		t.Cleanup(func() {
			accountingSchemaNames.Delete(key)
		})
	}
	return actual.(string)
}
