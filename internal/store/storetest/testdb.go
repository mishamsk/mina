package storetest

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"mina.local/mina/internal/store"
)

// OpenMigrated opens a migrated temporary database for boundary tests.
func OpenMigrated(t *testing.T, ctx context.Context) (*sql.DB, string) {
	t.Helper()

	path := filepath.Join(t.TempDir(), "mina.db")
	db, err := store.Open(ctx, path)
	if err != nil {
		t.Fatalf("open temporary database: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close temporary database: %v", err)
		}
	})

	if err := store.Migrate(ctx, db); err != nil {
		t.Fatalf("migrate temporary database: %v", err)
	}

	return db, path
}
