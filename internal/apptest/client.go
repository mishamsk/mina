package apptest

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"mina.local/mina/internal/app"
)

// Client sends typed JSON requests through an in-process app handler.
type Client struct {
	t   *testing.T
	app *app.App
}

// Response is a typed JSON response captured from the app handler.
type Response[T any] struct {
	StatusCode int
	Header     http.Header
	Body       T
	RawBody    []byte
}

// New creates an in-process app backed by a migrated temporary database.
func New(t *testing.T) *Client {
	t.Helper()

	path := t.TempDir() + "/mina.db"
	appInstance, err := app.New(context.Background(), app.Config{
		DatabasePath:    path,
		CreateIfMissing: true,
		ApplyMigrations: true,
	})
	if err != nil {
		t.Fatalf("create test app: %v", err)
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

// App returns the composed app used by this client.
func (c *Client) App() *app.App {
	return c.app
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
