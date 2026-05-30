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

	"github.com/mishamsk/mina/internal/apptest"
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

	version, err := store.CurrentSchemaVersion(ctx, appInstance.AccountingStore())
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

	version, err := store.CurrentSchemaVersion(ctx, appInstance.AccountingStore())
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

func TestAppSupportsQuotedAccountingSchemaLocations(t *testing.T) {
	tests := []struct {
		name   string
		schema string
	}{
		{name: "reserved word", schema: "select"},
		{name: "unicode", schema: "mina_é"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := apptest.New(t, apptest.WithLocationConfig(store.AccountingLocationConfig{
				Database: store.InMemoryAccountingDatabase,
				Schema:   tt.schema,
			}))
			persistence := client.Persistence()
			location := persistence.Location()

			var count int
			if err := persistence.QueryRowContext(
				context.Background(),
				`SELECT COUNT(*)
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = 'schema_version'`,
				location.Database(),
				location.Schema(),
			).Scan(&count); err != nil {
				t.Fatalf("check schema version table: %v", err)
			}
			if count != 1 {
				t.Fatalf("schema_version table count = %d, want 1", count)
			}

			response := client.JSON(http.MethodPost, "/categories", map[string]any{
				"fqn": "Food:Dining",
			})
			if response.StatusCode != http.StatusCreated {
				t.Fatalf("create category status = %d, want %d; body %s", response.StatusCode, http.StatusCreated, response.RawBody)
			}
			if err := persistence.QueryRowContext(
				context.Background(),
				"SELECT COUNT(*) FROM "+persistence.QualifiedName("category")+" WHERE fqn = ?",
				"Food:Dining",
			).Scan(&count); err != nil {
				t.Fatalf("count category in quoted schema: %v", err)
			}
			if count != 1 {
				t.Fatalf("category count = %d, want 1", count)
			}
		})
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
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = 'schema_version'`,
		location.Database(),
		location.Schema(),
	).Scan(&count)
	if err != nil {
		t.Fatalf("check schema version table location: %v", err)
	}
	if count != 1 {
		t.Fatalf("schema_version table count at %s.%s = %d, want 1", location.Database(), location.Schema(), count)
	}
}
