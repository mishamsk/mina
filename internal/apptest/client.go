package apptest

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	_ "github.com/duckdb/duckdb-go/v2"

	"github.com/mishamsk/mina/internal/httpclient"
	"github.com/mishamsk/mina/internal/runtime"
)

const duckDBDriverName = "duckdb"
const testServerURL = "http://mina.test"

// Client sends generated REST requests through an in-process app handler.
type Client struct {
	t    *testing.T
	rest *httpclient.ClientWithResponses
}

// Option customizes an in-process app test client.
type Option func(*clientOptions)

type clientOptions struct {
	config    runtime.Config
	processDB *ProcessDB
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
	restClient, err := httpclient.NewClientWithResponses(testServerURL, httpclient.WithHTTPClient(inProcessDoer{
		handler: appInstance.Handler(),
	}))
	if err != nil {
		t.Fatalf("new generated REST client: %v", err)
	}
	t.Cleanup(func() {
		if err := appInstance.Close(); err != nil {
			t.Fatalf("close test app: %v", err)
		}
	})

	return &Client{
		t:    t,
		rest: restClient,
	}
}

// REST returns the generated in-process REST client.
func (c *Client) REST() *httpclient.ClientWithResponses {
	c.t.Helper()

	return c.rest
}

type inProcessDoer struct {
	handler http.Handler
}

func (d inProcessDoer) Do(req *http.Request) (*http.Response, error) {
	if err := req.Context().Err(); err != nil {
		return nil, err
	}
	if req.Body != nil {
		defer func() {
			_ = req.Body.Close()
		}()
	}

	recorder := httptest.NewRecorder()
	d.handler.ServeHTTP(recorder, req)
	return recorder.Result(), nil
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
