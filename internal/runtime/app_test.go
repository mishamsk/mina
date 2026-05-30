package runtime_test

import (
	"context"
	"path/filepath"
	"testing"

	"mina.local/mina/internal/runtime"
	"mina.local/mina/internal/store"
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
	_, err := runtime.New(context.Background(), runtime.Config{
		DatabasePath:    filepath.Join(t.TempDir(), "missing.db"),
		CreateIfMissing: false,
		ApplyMigrations: true,
	})
	if err == nil {
		t.Fatal("new app succeeded, want missing database error")
	}
}
