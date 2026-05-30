package runtime_test

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/mishamsk/mina/internal/runtime"
	"github.com/mishamsk/mina/internal/store"
)

func TestNewCreatesAndMigratesDatabase(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "nested", "mina.db")

	appInstance, err := runtime.New(ctx, runtime.Config{
		DatabasePath:    path,
		CreateIfMissing: true,
		ApplyMigrations: true,
	})
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := appInstance.Close(); err != nil {
			t.Fatalf("close app: %v", err)
		}
	})
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("stat created database: %v", err)
	}
	if appInstance.AccountingLocation() != store.AttachedDatabaseAccountingLocation() {
		t.Fatalf("accounting location = %#v, want %#v", appInstance.AccountingLocation(), store.AttachedDatabaseAccountingLocation())
	}
	assertSchemaVersionTableAtLocation(t, ctx, appInstance, store.AttachedDatabaseAccountingLocation())

	version, err := store.CurrentSchemaVersion(ctx, appInstance.DB(), appInstance.AccountingLocation())
	if err != nil {
		t.Fatalf("current schema version: %v", err)
	}
	if version != store.LatestSchemaVersion() {
		t.Fatalf("schema version = %d, want %d", version, store.LatestSchemaVersion())
	}
}

func TestNewWithoutDatabasePathUsesEphemeralAccountingSchema(t *testing.T) {
	ctx := context.Background()

	appInstance, err := runtime.New(ctx, runtime.Config{
		ApplyMigrations: true,
	})
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := appInstance.Close(); err != nil {
			t.Fatalf("close app: %v", err)
		}
	})
	if appInstance.AccountingLocation() != store.InMemoryAccountingLocation() {
		t.Fatalf("accounting location = %#v, want %#v", appInstance.AccountingLocation(), store.InMemoryAccountingLocation())
	}
	assertSchemaVersionTableAtLocation(t, ctx, appInstance, store.InMemoryAccountingLocation())

	version, err := store.CurrentSchemaVersion(ctx, appInstance.DB(), appInstance.AccountingLocation())
	if err != nil {
		t.Fatalf("current schema version: %v", err)
	}
	if version != store.LatestSchemaVersion() {
		t.Fatalf("schema version = %d, want %d", version, store.LatestSchemaVersion())
	}
}

func TestNewWithoutDatabasePathServesFromNonDefaultAccountingSchema(t *testing.T) {
	ctx := context.Background()

	appInstance, err := runtime.New(ctx, runtime.Config{
		ApplyMigrations: true,
	})
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := appInstance.Close(); err != nil {
			t.Fatalf("close app: %v", err)
		}
	})

	request := httptest.NewRequest(http.MethodPost, "/categories", bytes.NewBufferString(`{"fqn":"Food:Dining"}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	appInstance.Handler().ServeHTTP(recorder, request)
	response := recorder.Result()
	body, readErr := io.ReadAll(response.Body)
	closeErr := response.Body.Close()
	if readErr != nil {
		t.Fatalf("read response: %v", readErr)
	}
	if closeErr != nil {
		t.Fatalf("close response: %v", closeErr)
	}
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", response.StatusCode, http.StatusCreated, body)
	}

	categoryTable, err := appInstance.AccountingLocation().QualifiedName("category")
	if err != nil {
		t.Fatalf("qualify category: %v", err)
	}
	var count int
	if err := appInstance.DB().QueryRowContext(ctx, "SELECT COUNT(*) FROM "+categoryTable+" WHERE fqn = ?", "Food:Dining").Scan(&count); err != nil {
		t.Fatalf("count qualified categories: %v", err)
	}
	if count != 1 {
		t.Fatalf("category count in qualified location = %d, want 1", count)
	}
}

func TestNewRequiresExistingDatabaseWhenCreateDisabled(t *testing.T) {
	_, err := runtime.New(context.Background(), runtime.Config{
		DatabasePath:    filepath.Join(t.TempDir(), "missing.db"),
		CreateIfMissing: false,
		ApplyMigrations: true,
	})
	if err == nil {
		t.Fatal("new app succeeded, want missing database error")
	}
}

func TestNewWithoutDatabasePathRequiresMigrations(t *testing.T) {
	_, err := runtime.New(context.Background(), runtime.Config{
		ApplyMigrations: false,
	})
	if err == nil {
		t.Fatal("new app succeeded, want migration-required error")
	}
}

func assertSchemaVersionTableAtLocation(t *testing.T, ctx context.Context, appInstance *runtime.App, location store.AccountingLocation) {
	t.Helper()

	var count int
	err := appInstance.DB().QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM information_schema.tables
WHERE table_catalog = ?
  AND table_schema = ?
  AND table_name = 'schema_version'`,
		location.Catalog,
		location.Schema,
	).Scan(&count)
	if err != nil {
		t.Fatalf("check schema version table location: %v", err)
	}
	if count != 1 {
		t.Fatalf("schema_version table count at %s.%s = %d, want 1", location.Catalog, location.Schema, count)
	}
}
