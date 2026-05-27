package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// Migration is one upgrade-only database schema change.
type Migration struct {
	Version int
	Name    string
	SQL     string
}

var migrations = []Migration{
	{
		Version: 1,
		Name:    "create_schema_version",
		SQL: `
CREATE TABLE IF NOT EXISTS schema_version (
	version INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);`,
	},
}

// LatestSchemaVersion returns the highest schema version known to this binary.
func LatestSchemaVersion() int {
	if len(migrations) == 0 {
		return 0
	}

	return migrations[len(migrations)-1].Version
}

// CurrentSchemaVersion returns the highest applied database schema version.
func CurrentSchemaVersion(ctx context.Context, db *sql.DB) (int, error) {
	exists, err := schemaVersionTableExists(ctx, db)
	if err != nil {
		return 0, err
	}
	if !exists {
		return 0, nil
	}

	var version int
	if err := db.QueryRowContext(ctx, "SELECT COALESCE(MAX(version), 0) FROM schema_version").Scan(&version); err != nil {
		return 0, fmt.Errorf("read schema version: %w", err)
	}

	return version, nil
}

// Migrate applies all pending upgrade-only migrations.
func Migrate(ctx context.Context, db *sql.DB) error {
	current, err := CurrentSchemaVersion(ctx, db)
	if err != nil {
		return err
	}
	if current > LatestSchemaVersion() {
		return fmt.Errorf("database schema version %d is newer than binary schema version %d", current, LatestSchemaVersion())
	}

	for _, migration := range migrations {
		if migration.Version <= current {
			continue
		}

		if err := applyMigration(ctx, db, migration); err != nil {
			return err
		}
	}

	return nil
}

func applyMigration(ctx context.Context, db *sql.DB, migration Migration) error {
	return WithTx(ctx, db, nil, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, migration.SQL); err != nil {
			return fmt.Errorf("apply migration %d %s: %w", migration.Version, migration.Name, err)
		}

		if _, err := tx.ExecContext(
			ctx,
			"INSERT INTO schema_version(version, name) VALUES (?, ?)",
			migration.Version,
			migration.Name,
		); err != nil {
			return fmt.Errorf("record migration %d %s: %w", migration.Version, migration.Name, err)
		}

		return nil
	})
}

func schemaVersionTableExists(ctx context.Context, db *sql.DB) (bool, error) {
	var name string
	err := db.QueryRowContext(
		ctx,
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
	).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check schema version table: %w", err)
	}

	return true, nil
}
