package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// Migration is one upgrade-only database schema change.
type Migration struct {
	Version int
	Name    string
	SQL     func(AccountingLocation) string
}

var migrations = []Migration{
	{
		Version: 1,
		Name:    "create_schema_primitives",
		SQL: migrationSQL(`
CREATE SEQUENCE {primary_key_gen_seq} START 1;

CREATE TYPE {posting_status} AS ENUM ('PENDING', 'POSTED', 'CANCELLED');
CREATE TYPE {reconciliation_status} AS ENUM ('RECONCILED', 'UNRECONCILED');
CREATE TYPE {source} AS ENUM ('MANUAL', 'IMPORTED', 'RECURRING_TEMPLATE');

CREATE TABLE {schema_version} (
	version INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`),
	},
	{
		Version: 2,
		Name:    "create_category",
		SQL: migrationSQL(`
CREATE TABLE {category} (
	category_id INTEGER PRIMARY KEY DEFAULT nextval({primary_key_gen_seq_literal}),
	fqn TEXT NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

CREATE UNIQUE INDEX {category_active_fqn_unique}
ON {category} ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));`),
	},
	{
		Version: 3,
		Name:    "create_tag",
		SQL: migrationSQL(`
CREATE TABLE {tag} (
	tag_id INTEGER PRIMARY KEY DEFAULT nextval({primary_key_gen_seq_literal}),
	fqn TEXT NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

CREATE UNIQUE INDEX {tag_active_fqn_unique}
ON {tag} ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));`),
	},
	{
		Version: 4,
		Name:    "create_member",
		SQL: migrationSQL(`
CREATE TABLE {member} (
	member_id INTEGER PRIMARY KEY DEFAULT nextval({primary_key_gen_seq_literal}),
	name TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(name, tombstoned_at)
);

CREATE UNIQUE INDEX {member_active_name_unique}
ON {member} ((CASE WHEN tombstoned_at IS NULL THEN name ELSE NULL END));`),
	},
	{
		Version: 5,
		Name:    "create_account",
		SQL: migrationSQL(`
CREATE TABLE {account} (
	account_id INTEGER PRIMARY KEY DEFAULT nextval({primary_key_gen_seq_literal}),
	fqn TEXT NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	currency TEXT,
	external_id TEXT,
	external_system TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	kind TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '^[^:]+')) VIRTUAL,
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

CREATE UNIQUE INDEX {account_active_fqn_unique}
ON {account} ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));`),
	},
	{
		Version: 6,
		Name:    "create_credit_limit_history",
		SQL: migrationSQL(`
CREATE TABLE {credit_limit_history} (
	credit_limit_history_id INTEGER PRIMARY KEY DEFAULT nextval({primary_key_gen_seq_literal}),
	account_id INTEGER NOT NULL,
	credit_limit DECIMAL(18,8) NOT NULL,
	effective_date DATE NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(account_id, effective_date, tombstoned_at)
);

CREATE UNIQUE INDEX {credit_limit_history_active_account_date_unique}
ON {credit_limit_history} ((CASE WHEN tombstoned_at IS NULL THEN CAST(account_id AS VARCHAR) || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));`),
	},
	{
		Version: 7,
		Name:    "create_exchange_rate",
		SQL: migrationSQL(`
CREATE TABLE {exchange_rate} (
	exchange_rate_id INTEGER PRIMARY KEY DEFAULT nextval({primary_key_gen_seq_literal}),
	from_currency TEXT NOT NULL,
	to_currency TEXT NOT NULL,
	rate DECIMAL(18,8) NOT NULL,
	effective_date DATE NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(from_currency, to_currency, effective_date, tombstoned_at)
);

CREATE UNIQUE INDEX {exchange_rate_active_pair_date_unique}
ON {exchange_rate} ((CASE WHEN tombstoned_at IS NULL THEN from_currency || ':' || to_currency || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));`),
	},
	{
		Version: 8,
		Name:    "create_transaction_and_journal_record",
		SQL: migrationSQL(`
CREATE TABLE {transaction} (
	transaction_id INTEGER PRIMARY KEY DEFAULT nextval({primary_key_gen_seq_literal}),
	initiated_date DATE NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

CREATE TABLE {journal_record} (
	record_id INTEGER PRIMARY KEY DEFAULT nextval({primary_key_gen_seq_literal}),
	transaction_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	member_id INTEGER,
	currency TEXT NOT NULL,
	amount DECIMAL(18,8) NOT NULL,
	amount_usd DECIMAL(18,8) NOT NULL,
	category_id INTEGER NOT NULL,
	tag_ids INTEGER[] NOT NULL DEFAULT [],
	memo TEXT,
	pending_date DATE,
	posted_date DATE,
	posting_status {posting_status} NOT NULL,
	reconciliation_status {reconciliation_status} NOT NULL DEFAULT 'RECONCILED',
	source {source} NOT NULL,
	external_id TEXT,
	external_system TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

CREATE INDEX {journal_record_transaction_id_idx}
ON {journal_record}(transaction_id);`),
	},
	{
		Version: 9,
		Name:    "create_budget",
		SQL: migrationSQL(`
CREATE TABLE {budget} (
	budget_id INTEGER PRIMARY KEY DEFAULT nextval({primary_key_gen_seq_literal}),
	category_fqn TEXT NOT NULL,
	month DATE NOT NULL,
	amount DECIMAL(18,8) NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(category_fqn, month, tombstoned_at)
);

CREATE UNIQUE INDEX {budget_active_category_month_unique}
ON {budget} ((CASE WHEN tombstoned_at IS NULL THEN category_fqn || ':' || CAST(month AS VARCHAR) ELSE NULL END));`),
	},
}

func migrationSQL(template string) func(AccountingLocation) string {
	return func(location AccountingLocation) string {
		replacements := []string{
			"{primary_key_gen_seq}", location.mustQualifiedName("primary_key_gen_seq"),
			"{primary_key_gen_seq_literal}", location.sequenceLiteral("primary_key_gen_seq"),
			"{posting_status}", location.mustQualifiedName("posting_status"),
			"{reconciliation_status}", location.mustQualifiedName("reconciliation_status"),
			"{source}", location.mustQualifiedName("source"),
			"{schema_version}", location.mustQualifiedName("schema_version"),
			"{category}", location.mustQualifiedName("category"),
			"{tag}", location.mustQualifiedName("tag"),
			"{member}", location.mustQualifiedName("member"),
			"{account}", location.mustQualifiedName("account"),
			"{credit_limit_history}", location.mustQualifiedName("credit_limit_history"),
			"{exchange_rate}", location.mustQualifiedName("exchange_rate"),
			"{transaction}", location.mustQualifiedName("transaction"),
			"{journal_record}", location.mustQualifiedName("journal_record"),
			"{budget}", location.mustQualifiedName("budget"),
			// DuckDB places indexes through the qualified ON table and rejects
			// database-qualified index names in CREATE INDEX.
			"{category_active_fqn_unique}", QuoteIdentifier("category_active_fqn_unique"),
			"{tag_active_fqn_unique}", QuoteIdentifier("tag_active_fqn_unique"),
			"{member_active_name_unique}", QuoteIdentifier("member_active_name_unique"),
			"{account_active_fqn_unique}", QuoteIdentifier("account_active_fqn_unique"),
			"{credit_limit_history_active_account_date_unique}", QuoteIdentifier("credit_limit_history_active_account_date_unique"),
			"{exchange_rate_active_pair_date_unique}", QuoteIdentifier("exchange_rate_active_pair_date_unique"),
			"{journal_record_transaction_id_idx}", QuoteIdentifier("journal_record_transaction_id_idx"),
			"{budget_active_category_month_unique}", QuoteIdentifier("budget_active_category_month_unique"),
		}

		return strings.NewReplacer(replacements...).Replace(template)
	}
}

// LatestSchemaVersion returns the highest schema version known to this binary.
func LatestSchemaVersion() int {
	if len(migrations) == 0 {
		return 0
	}

	return migrations[len(migrations)-1].Version
}

// CurrentSchemaVersion returns the highest applied database schema version.
func CurrentSchemaVersion(ctx context.Context, accounting *AccountingStore) (int, error) {
	exists, err := schemaVersionTableExists(ctx, accounting)
	if err != nil {
		return 0, err
	}
	if !exists {
		return 0, nil
	}

	schemaVersion := accounting.location.mustQualifiedName("schema_version")
	var version int
	if err := accounting.db.QueryRowContext(ctx, "SELECT COALESCE(MAX(version), 0) FROM "+schemaVersion).Scan(&version); err != nil {
		return 0, fmt.Errorf("read schema version: %w", err)
	}

	return version, nil
}

// Migrate applies all pending upgrade-only migrations.
func Migrate(ctx context.Context, accounting *AccountingStore) error {
	if err := PrepareAccountingLocation(ctx, accounting); err != nil {
		return err
	}

	current, err := CurrentSchemaVersion(ctx, accounting)
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

		if err := applyMigration(ctx, accounting, migration); err != nil {
			return err
		}
	}

	return nil
}

func applyMigration(ctx context.Context, accounting *AccountingStore, migration Migration) error {
	schemaVersion := accounting.location.mustQualifiedName("schema_version")
	return WithTx(ctx, accounting.db, nil, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, migration.SQL(accounting.location)); err != nil {
			return fmt.Errorf("apply migration %d %s: %w", migration.Version, migration.Name, err)
		}

		if _, err := tx.ExecContext(
			ctx,
			"INSERT INTO "+schemaVersion+"(version, name) VALUES (?, ?)",
			migration.Version,
			migration.Name,
		); err != nil {
			return fmt.Errorf("record migration %d %s: %w", migration.Version, migration.Name, err)
		}

		return nil
	})
}

func schemaVersionTableExists(ctx context.Context, accounting *AccountingStore) (bool, error) {
	var tableName string
	err := accounting.db.QueryRowContext(
		ctx,
		`SELECT table_name
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = 'schema_version'
LIMIT 1`,
		accounting.location.database,
		accounting.location.schema,
	).Scan(&tableName)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check schema version table: %w", err)
	}

	return true, nil
}
