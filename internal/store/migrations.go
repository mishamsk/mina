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
	{
		Version: 2,
		Name:    "create_category",
		SQL: `
CREATE TABLE category (
	category_id INTEGER PRIMARY KEY AUTOINCREMENT,
	fqn TEXT NOT NULL,
	is_hidden INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	tombstoned_at TEXT
);

CREATE UNIQUE INDEX category_active_fqn_unique
ON category(fqn)
WHERE tombstoned_at IS NULL;`,
	},
	{
		Version: 3,
		Name:    "create_tag",
		SQL: `
CREATE TABLE tag (
	tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
	fqn TEXT NOT NULL,
	is_hidden INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	tombstoned_at TEXT
);

CREATE UNIQUE INDEX tag_active_fqn_unique
ON tag(fqn)
WHERE tombstoned_at IS NULL;`,
	},
	{
		Version: 4,
		Name:    "create_member",
		SQL: `
CREATE TABLE member (
	member_id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	tombstoned_at TEXT
);

CREATE UNIQUE INDEX member_active_name_unique
ON member(name)
WHERE tombstoned_at IS NULL;`,
	},
	{
		Version: 5,
		Name:    "create_account",
		SQL: `
CREATE TABLE account (
	account_id INTEGER PRIMARY KEY AUTOINCREMENT,
	fqn TEXT NOT NULL,
	is_hidden INTEGER NOT NULL DEFAULT 0,
	currency TEXT,
	external_id TEXT,
	external_system TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	tombstoned_at TEXT
);

CREATE UNIQUE INDEX account_active_fqn_unique
ON account(fqn)
WHERE tombstoned_at IS NULL;`,
	},
	{
		Version: 6,
		Name:    "create_credit_limit_history",
		SQL: `
CREATE TABLE credit_limit_history (
	credit_limit_history_id INTEGER PRIMARY KEY AUTOINCREMENT,
	account_id INTEGER NOT NULL REFERENCES account(account_id),
	credit_limit TEXT NOT NULL,
	effective_date TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	tombstoned_at TEXT
);

CREATE UNIQUE INDEX credit_limit_history_active_account_date_unique
ON credit_limit_history(account_id, effective_date)
WHERE tombstoned_at IS NULL;`,
	},
	{
		Version: 7,
		Name:    "create_exchange_rate",
		SQL: `
CREATE TABLE exchange_rate (
	exchange_rate_id INTEGER PRIMARY KEY AUTOINCREMENT,
	from_currency TEXT NOT NULL,
	to_currency TEXT NOT NULL,
	rate TEXT NOT NULL,
	effective_date TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	tombstoned_at TEXT
);

CREATE UNIQUE INDEX exchange_rate_active_pair_date_unique
ON exchange_rate(from_currency, to_currency, effective_date)
WHERE tombstoned_at IS NULL;`,
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
