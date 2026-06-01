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
)

const duckDBDriverName = "duckdb"

// Client sends typed JSON requests through an in-process app handler.
type Client struct {
	t   *testing.T
	app *runtime.App
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
		t:   t,
		app: appInstance,
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
