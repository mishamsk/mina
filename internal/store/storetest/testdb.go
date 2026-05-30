package storetest

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/mishamsk/mina/internal/store"
)

// OpenMigrated opens a migrated temporary database for boundary tests.
func OpenMigrated(t *testing.T, ctx context.Context) (*store.AccountingStore, string) {
	t.Helper()

	path := filepath.Join(t.TempDir(), "mina.db")
	accounting, err := store.OpenAccounting(ctx, store.AccountingOpenRequest{
		Path:     path,
		Location: store.AttachedDatabaseAccountingLocation(),
		Migrate:  true,
	})
	if err != nil {
		t.Fatalf("open temporary accounting store: %v", err)
	}
	t.Cleanup(func() {
		if err := accounting.Close(); err != nil {
			t.Fatalf("close temporary accounting store: %v", err)
		}
	})

	return accounting, path
}
