package store_test

import (
	"context"
	"database/sql"
	"errors"
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
