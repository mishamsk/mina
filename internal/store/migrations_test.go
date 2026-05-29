package store_test

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"mina.local/mina/internal/store"
	"mina.local/mina/internal/store/storetest"
)

func TestMigrateAppliesLatestSchemaVersion(t *testing.T) {
	ctx := context.Background()
	db, _ := storetest.OpenMigrated(t, ctx)

	version, err := store.CurrentSchemaVersion(ctx, db)
	if err != nil {
		t.Fatalf("current schema version: %v", err)
	}
	if version != store.LatestSchemaVersion() {
		t.Fatalf("schema version = %d, want %d", version, store.LatestSchemaVersion())
	}

	if err := store.Migrate(ctx, db); err != nil {
		t.Fatalf("migrate again: %v", err)
	}
}

func TestWithTxCommitsAndRollsBack(t *testing.T) {
	ctx := context.Background()
	db, _ := storetest.OpenMigrated(t, ctx)
	if _, err := db.ExecContext(ctx, "CREATE TABLE tx_probe (value TEXT NOT NULL)"); err != nil {
		t.Fatalf("create probe table: %v", err)
	}

	if err := store.WithTx(ctx, db, nil, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, "INSERT INTO tx_probe(value) VALUES ('committed')")
		return err
	}); err != nil {
		t.Fatalf("commit transaction: %v", err)
	}

	sentinel := errors.New("rollback")
	if err := store.WithTx(ctx, db, nil, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "INSERT INTO tx_probe(value) VALUES ('rolled back')"); err != nil {
			return err
		}
		return sentinel
	}); !errors.Is(err, sentinel) {
		t.Fatalf("rollback transaction error = %v, want sentinel", err)
	}

	var count int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tx_probe").Scan(&count); err != nil {
		t.Fatalf("count probe rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("probe row count = %d, want 1", count)
	}
}

func TestMigrateCreatesDuckDBPhaseOneSchema(t *testing.T) {
	ctx := context.Background()
	db, _ := storetest.OpenMigrated(t, ctx)

	assertTableExists(t, ctx, db, "budget")
	assertTableExists(t, ctx, db, "journal_record")
	assertTableMissing(t, ctx, db, "journal_record_tag")

	assertColumnType(t, ctx, db, "journal_record", "tag_ids", "INTEGER[]")
	assertColumnType(t, ctx, db, "journal_record", "amount", "DECIMAL(18,8)")
	assertColumnType(t, ctx, db, "journal_record", "amount_usd", "DECIMAL(18,8)")
	assertColumnType(t, ctx, db, "journal_record", "pending_date", "DATE")
	assertColumnType(t, ctx, db, "journal_record", "created_at", "TIMESTAMP")

	var transactionID int64
	if err := db.QueryRowContext(
		ctx,
		`INSERT INTO "transaction" (initiated_date) VALUES (?) RETURNING transaction_id`,
		"2024-01-01",
	).Scan(&transactionID); err != nil {
		t.Fatalf("insert quoted transaction table: %v", err)
	}
	if transactionID <= 0 {
		t.Fatalf("transaction_id = %d, want positive", transactionID)
	}

	if _, err := db.ExecContext(ctx, "INSERT INTO category (fqn) VALUES (?)", "Food:Dining"); err != nil {
		t.Fatalf("insert active category: %v", err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO category (fqn) VALUES (?)", "Food:Dining"); err == nil {
		t.Fatalf("insert duplicate active category succeeded, want active uniqueness error")
	}
	if _, err := db.ExecContext(ctx, "UPDATE category SET tombstoned_at = CURRENT_TIMESTAMP WHERE fqn = ?", "Food:Dining"); err != nil {
		t.Fatalf("tombstone category: %v", err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO category (fqn) VALUES (?)", "Food:Dining"); err != nil {
		t.Fatalf("recreate tombstoned category fqn: %v", err)
	}
}

func assertTableExists(t *testing.T, ctx context.Context, db *sql.DB, tableName string) {
	t.Helper()

	if !tableExists(t, ctx, db, tableName) {
		t.Fatalf("table %s does not exist", tableName)
	}
}

func assertTableMissing(t *testing.T, ctx context.Context, db *sql.DB, tableName string) {
	t.Helper()

	if tableExists(t, ctx, db, tableName) {
		t.Fatalf("table %s exists, want missing", tableName)
	}
}

func tableExists(t *testing.T, ctx context.Context, db *sql.DB, tableName string) bool {
	t.Helper()

	var count int
	if err := db.QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema = current_schema()
  AND table_name = ?`,
		tableName,
	).Scan(&count); err != nil {
		t.Fatalf("check table %s: %v", tableName, err)
	}

	return count == 1
}

func assertColumnType(t *testing.T, ctx context.Context, db *sql.DB, tableName string, columnName string, want string) {
	t.Helper()

	var dataType string
	if err := db.QueryRowContext(
		ctx,
		`SELECT data_type
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = ?
  AND column_name = ?`,
		tableName,
		columnName,
	).Scan(&dataType); err != nil {
		t.Fatalf("read %s.%s type: %v", tableName, columnName, err)
	}
	if !strings.EqualFold(dataType, want) {
		t.Fatalf("%s.%s data_type = %q, want %q", tableName, columnName, dataType, want)
	}
}
