package apptest

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	_ "github.com/duckdb/duckdb-go/v2"

	"github.com/mishamsk/mina/internal/runtime"
	"github.com/mishamsk/mina/internal/store"
)

const duckDBDriverName = "duckdb"

// Client sends typed JSON requests through an in-process app handler.
type Client struct {
	t        *testing.T
	app      *runtime.App
	location store.AccountingLocation
}

// Option customizes an in-process app test client.
type Option func(*clientOptions)

type clientOptions struct {
	config    runtime.Config
	processDB *ProcessDB
}

// Response is a typed JSON response captured from the app handler.
type Response[T any] struct {
	StatusCode int
	Header     http.Header
	Body       T
	RawBody    []byte
}

// Persistence exposes direct DB assertions for the narrow persistence-check tier.
type Persistence struct {
	t        *testing.T
	db       *sql.DB
	location store.AccountingLocation
}

// ProcessDB is a reusable in-memory DuckDB process handle for app tests.
type ProcessDB struct {
	db *sql.DB
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
	}
}

// WithProcessDB reuses an existing DuckDB process database for the test app.
func WithProcessDB(db *ProcessDB) Option {
	return func(opts *clientOptions) {
		opts.processDB = db
	}
}

// New creates an in-process app backed by migrated in-memory DuckDB state.
func New(t *testing.T, options ...Option) *Client {
	t.Helper()

	ctx := context.Background()
	schema := testSchemaName(t)
	opts := clientOptions{
		config: runtime.Config{
			AccountingSchema: schema,
		},
	}
	for _, option := range options {
		option(&opts)
	}
	if opts.config.AccountingSchema == "" {
		opts.config.AccountingSchema = schema
	}

	var appInstance *runtime.App
	var err error
	if opts.processDB != nil {
		appInstance, err = runtime.NewWithProcessDB(ctx, opts.processDB.db, opts.config)
	} else {
		appInstance, err = runtime.New(ctx, opts.config)
	}
	if err != nil {
		t.Fatalf("new test app: %v", err)
	}
	t.Cleanup(func() {
		if err := appInstance.Close(); err != nil {
			t.Fatalf("close test app: %v", err)
		}
	})

	return &Client{
		t:        t,
		app:      appInstance,
		location: appInstance.AccountingLocation(),
	}
}

// Persistence returns the direct database assertion helper.
func (c *Client) Persistence() *Persistence {
	return &Persistence{
		t:        c.t,
		db:       c.app.DB(),
		location: c.location,
	}
}

// JSON sends a JSON request and decodes the JSON response into T.
func (c *Client) JSON(method string, path string, body any) Response[json.RawMessage] {
	c.t.Helper()

	raw := c.do(method, path, body)
	return Response[json.RawMessage]{
		StatusCode: raw.StatusCode,
		Header:     raw.Header,
		Body:       json.RawMessage(raw.RawBody),
		RawBody:    raw.RawBody,
	}
}

// Decode sends a JSON request and decodes the response into the requested type.
func Decode[T any](c *Client, method string, path string, body any) Response[T] {
	c.t.Helper()

	raw := c.do(method, path, body)
	var decoded T
	if len(raw.RawBody) > 0 {
		if err := json.Unmarshal(raw.RawBody, &decoded); err != nil {
			c.t.Fatalf("decode response body: %v\nbody: %s", err, string(raw.RawBody))
		}
	}

	return Response[T]{
		StatusCode: raw.StatusCode,
		Header:     raw.Header,
		Body:       decoded,
		RawBody:    raw.RawBody,
	}
}

func (c *Client) do(method string, path string, body any) Response[struct{}] {
	c.t.Helper()

	var reader io.Reader
	if body != nil {
		var buf bytes.Buffer
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			c.t.Fatalf("encode request body: %v", err)
		}
		reader = &buf
	}

	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	recorder := httptest.NewRecorder()

	c.app.Handler().ServeHTTP(recorder, req)
	result := recorder.Result()
	defer func() {
		if err := result.Body.Close(); err != nil {
			c.t.Fatalf("close response body: %v", err)
		}
	}()

	rawBody, err := io.ReadAll(result.Body)
	if err != nil {
		c.t.Fatalf("read response body: %v", err)
	}

	return Response[struct{}]{
		StatusCode: result.StatusCode,
		Header:     result.Header.Clone(),
		RawBody:    rawBody,
	}
}

// QueryRowContext runs a direct SQL query against the test database.
func (p *Persistence) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	p.t.Helper()

	return p.db.QueryRowContext(ctx, query, args...)
}

// Location returns the per-test accounting location.
func (p *Persistence) Location() store.AccountingLocation {
	return p.location
}

// RequireAccountingSchema fails the test if the accounting schema is not want.
func (p *Persistence) RequireAccountingSchema(want string) {
	p.t.Helper()

	if p.location.Schema() != want {
		p.t.Fatalf("accounting schema = %q, want %q", p.location.Schema(), want)
	}
}

// RequireTableExists fails the test unless tableName exists at the accounting location.
func (p *Persistence) RequireTableExists(tableName string) {
	p.t.Helper()

	var count int
	err := p.QueryRowContext(
		context.Background(),
		`SELECT COUNT(*)
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = ?`,
		p.location.Database(),
		p.location.Schema(),
		tableName,
	).Scan(&count)
	if err != nil {
		p.t.Fatalf("check table %s location: %v", tableName, err)
	}
	if count != 1 {
		p.t.Fatalf("%s table count at %s.%s = %d, want 1", tableName, p.location.Database(), p.location.Schema(), count)
	}
}

// RequireMinimumTableCount fails the test unless at least minimum tables exist at the accounting location.
func (p *Persistence) RequireMinimumTableCount(minimum int) {
	p.t.Helper()

	var count int
	err := p.QueryRowContext(
		context.Background(),
		`SELECT COUNT(*)
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?`,
		p.location.Database(),
		p.location.Schema(),
	).Scan(&count)
	if err != nil {
		p.t.Fatalf("count tables at location: %v", err)
	}
	if count < minimum {
		p.t.Fatalf("table count at %s.%s = %d, want at least %d", p.location.Database(), p.location.Schema(), count, minimum)
	}
}

// QualifiedName returns a qualified object name in the per-test accounting location.
func (p *Persistence) QualifiedName(object string) string {
	p.t.Helper()

	name, err := p.location.QualifiedName(object)
	if err != nil {
		p.t.Fatalf("qualify %s: %v", object, err)
	}

	return name
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
