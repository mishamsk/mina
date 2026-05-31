package runtime_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"

	_ "github.com/duckdb/duckdb-go/v2"
)

func TestNewMigratesExistingEmptyDatabaseAtConfiguredSchema(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "mina.db")
	createEmptyDuckDB(t, ctx, path)

	// This single startup case covers persistent DB open, custom non-default
	// schema selection, reserved-word schema quoting, and migration application.
	client := newSharedClient(t, apptest.WithDatabasePath(path), apptest.WithAccountingSchema("select"))
	persistence := client.Persistence()

	persistence.RequireAccountingSchema("select")
	persistence.RequireTableExists("schema_version")
	persistence.RequireMinimumTableCount(2)
}

func createEmptyDuckDB(t *testing.T, ctx context.Context, path string) {
	t.Helper()

	db, err := sql.Open("duckdb", path)
	if err != nil {
		t.Fatalf("create empty DuckDB database: %v", err)
	}
	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("ping empty DuckDB database: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close empty DuckDB database: %v", err)
	}
}
