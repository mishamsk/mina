package runtime_test

import (
	"context"
	"strings"
	"testing"

	"github.com/mishamsk/mina/internal/runtime"
	"github.com/mishamsk/mina/internal/store"
)

func TestMigrateAppliesLatestSchemaVersion(t *testing.T) {
	ctx := context.Background()
	appInstance := newMigratedApp(t, ctx)

	version, err := store.CurrentSchemaVersion(ctx, appInstance.AccountingStore())
	if err != nil {
		t.Fatalf("current schema version: %v", err)
	}
	if version != store.LatestSchemaVersion() {
		t.Fatalf("schema version = %d, want %d", version, store.LatestSchemaVersion())
	}

	if err := store.Migrate(ctx, appInstance.AccountingStore()); err != nil {
		t.Fatalf("migrate again: %v", err)
	}
}

func TestMigrateCreatesDuckDBPhaseOneSchema(t *testing.T) {
	ctx := context.Background()
	appInstance := newMigratedApp(t, ctx)

	assertTableExists(t, ctx, appInstance, "budget")
	assertTableExists(t, ctx, appInstance, "journal_record")
	assertTableMissing(t, ctx, appInstance, "journal_record_tag")

	assertColumnType(t, ctx, appInstance, "journal_record", "tag_ids", "INTEGER[]")
	assertColumnType(t, ctx, appInstance, "journal_record", "amount", "DECIMAL(18,8)")
	assertColumnType(t, ctx, appInstance, "journal_record", "amount_usd", "DECIMAL(18,8)")
	assertColumnType(t, ctx, appInstance, "journal_record", "pending_date", "DATE")
	assertColumnType(t, ctx, appInstance, "journal_record", "created_at", "TIMESTAMP")
	assertColumnType(t, ctx, appInstance, "journal_record", "posting_status", "ENUM('PENDING', 'POSTED', 'CANCELLED')")

	var transactionID int64
	transactionTable := qualifiedName(t, appInstance, "transaction")
	if err := appInstance.DB().QueryRowContext(
		ctx,
		`INSERT INTO `+transactionTable+` (initiated_date) VALUES (?) RETURNING transaction_id`,
		"2024-01-01",
	).Scan(&transactionID); err != nil {
		t.Fatalf("insert quoted transaction table: %v", err)
	}
	if transactionID <= 0 {
		t.Fatalf("transaction_id = %d, want positive", transactionID)
	}

	categoryTable := qualifiedName(t, appInstance, "category")
	if _, err := appInstance.DB().ExecContext(ctx, "INSERT INTO "+categoryTable+" (fqn) VALUES (?)", "Food:Dining"); err != nil {
		t.Fatalf("insert active category: %v", err)
	}
	var parentFQN string
	var name string
	var level int
	if err := appInstance.DB().QueryRowContext(
		ctx,
		"SELECT parent_fqn, name, level FROM "+categoryTable+" WHERE fqn = ?",
		"Food:Dining",
	).Scan(&parentFQN, &name, &level); err != nil {
		t.Fatalf("read generated category hierarchy: %v", err)
	}
	if parentFQN != "Food" || name != "Dining" || level != 1 {
		t.Fatalf("generated category hierarchy = %q/%q/%d, want Food/Dining/1", parentFQN, name, level)
	}
	if _, err := appInstance.DB().ExecContext(ctx, "INSERT INTO "+categoryTable+" (fqn) VALUES (?)", "Food:Dining"); err == nil {
		t.Fatalf("insert duplicate active category succeeded, want active uniqueness error")
	}
	if _, err := appInstance.DB().ExecContext(ctx, "UPDATE "+categoryTable+" SET tombstoned_at = CURRENT_TIMESTAMP WHERE fqn = ?", "Food:Dining"); err != nil {
		t.Fatalf("tombstone category: %v", err)
	}
	if _, err := appInstance.DB().ExecContext(ctx, "INSERT INTO "+categoryTable+" (fqn) VALUES (?)", "Food:Dining"); err != nil {
		t.Fatalf("recreate tombstoned category fqn: %v", err)
	}
}

func newMigratedApp(t *testing.T, ctx context.Context) *runtime.App {
	t.Helper()

	appInstance, err := runtime.New(ctx, runtime.Config{ApplyMigrations: true})
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := appInstance.Close(); err != nil {
			t.Fatalf("close app: %v", err)
		}
	})

	return appInstance
}

func assertTableExists(t *testing.T, ctx context.Context, appInstance *runtime.App, tableName string) {
	t.Helper()

	if !tableExists(t, ctx, appInstance, tableName) {
		t.Fatalf("table %s does not exist", tableName)
	}
}

func assertTableMissing(t *testing.T, ctx context.Context, appInstance *runtime.App, tableName string) {
	t.Helper()

	if tableExists(t, ctx, appInstance, tableName) {
		t.Fatalf("table %s exists, want missing", tableName)
	}
}

func tableExists(t *testing.T, ctx context.Context, appInstance *runtime.App, tableName string) bool {
	t.Helper()

	var count int
	location := appInstance.AccountingLocation()
	if err := appInstance.DB().QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = ?`,
		location.Database(),
		location.Schema(),
		tableName,
	).Scan(&count); err != nil {
		t.Fatalf("check table %s: %v", tableName, err)
	}

	return count == 1
}

func assertColumnType(t *testing.T, ctx context.Context, appInstance *runtime.App, tableName string, columnName string, want string) {
	t.Helper()

	var dataType string
	location := appInstance.AccountingLocation()
	if err := appInstance.DB().QueryRowContext(
		ctx,
		`SELECT data_type
FROM duckdb_columns()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = ?
  AND column_name = ?`,
		location.Database(),
		location.Schema(),
		tableName,
		columnName,
	).Scan(&dataType); err != nil {
		t.Fatalf("read %s.%s type: %v", tableName, columnName, err)
	}
	if !strings.EqualFold(dataType, want) {
		t.Fatalf("%s.%s data_type = %q, want %q", tableName, columnName, dataType, want)
	}
}

func qualifiedName(t *testing.T, appInstance *runtime.App, object string) string {
	t.Helper()

	name, err := appInstance.AccountingLocation().QualifiedName(object)
	if err != nil {
		t.Fatalf("qualify %s: %v", object, err)
	}

	return name
}
