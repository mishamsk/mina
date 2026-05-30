package runtime_test

import (
	"context"
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

	version, err := store.CurrentSchemaVersion(ctx, appInstance.DB())
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

	version, err := store.CurrentSchemaVersion(ctx, appInstance.DB())
	if err != nil {
		t.Fatalf("current schema version: %v", err)
	}
	if version != store.LatestSchemaVersion() {
		t.Fatalf("schema version = %d, want %d", version, store.LatestSchemaVersion())
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
