package app_test

import (
	"context"
	"net/http"
	"path/filepath"
	"testing"

	"mina.local/mina/internal/app"
	"mina.local/mina/internal/apptest"
	"mina.local/mina/internal/models"
	"mina.local/mina/internal/store"
)

func TestNewCreatesAndMigratesDatabase(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "nested", "mina.db")

	appInstance, err := app.New(ctx, app.Config{
		DatabasePath:    path,
		CreateIfMissing: true,
		ApplyMigrations: true,
	})
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	defer func() {
		if err := appInstance.Close(); err != nil {
			t.Fatalf("close app: %v", err)
		}
	}()

	version, err := store.CurrentSchemaVersion(ctx, appInstance.DB())
	if err != nil {
		t.Fatalf("current schema version: %v", err)
	}
	if version != store.LatestSchemaVersion() {
		t.Fatalf("schema version = %d, want %d", version, store.LatestSchemaVersion())
	}
}

func TestNewRequiresExistingDatabaseWhenCreateDisabled(t *testing.T) {
	_, err := app.New(context.Background(), app.Config{
		DatabasePath:    filepath.Join(t.TempDir(), "missing.db"),
		CreateIfMissing: false,
		ApplyMigrations: true,
	})
	if err == nil {
		t.Fatal("new app succeeded, want missing database error")
	}
}

func TestBoundaryHealthAndJSONErrorResponses(t *testing.T) {
	client := apptest.New(t)

	health := apptest.Decode[struct {
		Status string `json:"status"`
	}](client, http.MethodGet, "/health", nil)
	if health.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want %d", health.StatusCode, http.StatusOK)
	}
	if health.Body.Status != "ok" {
		t.Fatalf("health body status = %q, want ok", health.Body.Status)
	}

	missing := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/missing", nil)
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("missing status = %d, want %d", missing.StatusCode, http.StatusNotFound)
	}
	if missing.Body.Error.Code != models.ErrorCodeNotFound {
		t.Fatalf("missing error code = %q, want %q", missing.Body.Error.Code, models.ErrorCodeNotFound)
	}

	method := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/health", nil)
	if method.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("method status = %d, want %d", method.StatusCode, http.StatusMethodNotAllowed)
	}
	if method.Body.Error.Code != models.ErrorCodeMethodNotAllowed {
		t.Fatalf("method error code = %q, want %q", method.Body.Error.Code, models.ErrorCodeMethodNotAllowed)
	}
}
