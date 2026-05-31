package runtime_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/runtime"
	"github.com/mishamsk/mina/internal/store"

	_ "github.com/duckdb/duckdb-go/v2"
)

func TestNewMigratesExistingEmptyDatabaseAtConfiguredSchema(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "mina.db")
	createEmptyDuckDB(t, ctx, path)

	// This single startup case covers persistent DB open, custom non-default
	// schema selection, reserved-word schema quoting, and migration application.
	client := newClient(t, apptest.WithConfig(runtime.Config{
		DatabasePath:     path,
		AccountingSchema: "select",
	}))
	persistence := client.Persistence()

	location := persistence.Location()
	if location.Schema() != "select" {
		t.Fatalf("accounting schema = %q, want select", location.Schema())
	}
	assertTableExistsAtLocation(t, ctx, persistence, location, "schema_version")
	assertTableCountAtLocation(t, ctx, persistence, location, 2)
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

func assertTableExistsAtLocation(
	t *testing.T,
	ctx context.Context,
	persistence *apptest.Persistence,
	location store.AccountingLocation,
	tableName string,
) {
	t.Helper()

	var count int
	err := persistence.QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = ?`,
		location.Database(),
		location.Schema(),
		tableName,
	).Scan(&count)
	if err != nil {
		t.Fatalf("check table %s location: %v", tableName, err)
	}
	if count != 1 {
		t.Fatalf("%s table count at %s.%s = %d, want 1", tableName, location.Database(), location.Schema(), count)
	}
}

func assertTableCountAtLocation(
	t *testing.T,
	ctx context.Context,
	persistence *apptest.Persistence,
	location store.AccountingLocation,
	minimum int,
) {
	t.Helper()

	var count int
	err := persistence.QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?`,
		location.Database(),
		location.Schema(),
	).Scan(&count)
	if err != nil {
		t.Fatalf("count tables at location: %v", err)
	}
	if count < minimum {
		t.Fatalf("table count at %s.%s = %d, want at least %d", location.Database(), location.Schema(), count, minimum)
	}
}
