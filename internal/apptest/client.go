package apptest

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mishamsk/mina/internal/runtime"
	"github.com/mishamsk/mina/internal/store"
)

// Client sends typed JSON requests through an in-process app handler.
type Client struct {
	t        *testing.T
	app      *runtime.App
	location store.AccountingLocation
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

// New creates an in-process app backed by migrated in-memory DuckDB state.
func New(t *testing.T) *Client {
	t.Helper()

	ctx := context.Background()
	db, err := store.OpenInMemory(ctx)
	if err != nil {
		t.Fatalf("open in-memory test database: %v", err)
	}

	schema := testSchemaName(t)
	location := store.AccountingLocation{
		Catalog: store.InMemoryAccountingCatalog,
		Schema:  schema,
	}
	if err := store.PrepareAccountingLocation(ctx, db, location); err != nil {
		t.Fatalf("prepare test schema: %v", err)
	}
	if err := store.Migrate(ctx, db, location); err != nil {
		t.Fatalf("migrate test schema: %v", err)
	}
	appInstance := runtime.NewWithDB(db, location, runtime.HTTPConfig{})
	t.Cleanup(func() {
		if err := appInstance.Close(); err != nil {
			t.Fatalf("close test app: %v", err)
		}
	})

	return &Client{
		t:        t,
		app:      appInstance,
		location: location,
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
