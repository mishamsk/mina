package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"

	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var embeddedMigrations embed.FS

// Migrate applies all pending upgrade-only migrations.
func Migrate(ctx context.Context, appDB *AppDB) error {
	if err := prepareAccountingLocation(ctx, appDB); err != nil {
		return err
	}
	if err := useAccountingLocation(ctx, appDB, appDB.db); err != nil {
		return err
	}
	if err := normalizeSchemaVersionTable(ctx, appDB); err != nil {
		return err
	}

	provider, err := newMigrationProvider(appDB)
	if err != nil {
		return fmt.Errorf("configure migrations: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}

	return nil
}

// HasPendingMigrations reports whether Goose has migrations left to apply.
func HasPendingMigrations(ctx context.Context, appDB *AppDB) (bool, error) {
	exists, err := AccountingLocationExists(ctx, appDB)
	if err != nil {
		return false, err
	}
	if !exists {
		return true, nil
	}
	if err := useAccountingLocation(ctx, appDB, appDB.db); err != nil {
		return false, err
	}

	exists, err = schemaVersionTableExists(ctx, appDB)
	if err != nil {
		return false, err
	}
	if !exists {
		return true, nil
	}
	shape, err := schemaVersionTableShape(ctx, appDB)
	if err != nil {
		return false, err
	}
	if shape == schemaVersionTableLegacy {
		return true, nil
	}

	provider, err := newMigrationProvider(appDB)
	if err != nil {
		return false, fmt.Errorf("configure migrations: %w", err)
	}
	pending, err := provider.HasPending(ctx)
	if err != nil {
		return false, fmt.Errorf("check pending migrations: %w", err)
	}

	return pending, nil
}

// AccountingLocationExists reports whether the selected accounting schema already exists.
func AccountingLocationExists(ctx context.Context, appDB *AppDB) (bool, error) {
	catalog, schema := appDB.accountingCatalogAndSchema()
	var count int
	if err := appDB.db.QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM information_schema.schemata
WHERE catalog_name = ?
  AND schema_name = ?`,
		catalog,
		schema,
	).Scan(&count); err != nil {
		return false, fmt.Errorf("check accounting schema: %w", err)
	}

	if count == 0 {
		return false, nil
	}
	if err := useAccountingLocation(ctx, appDB, appDB.db); err != nil {
		return false, err
	}

	return true, nil
}

func newMigrationProvider(appDB *AppDB) (*goose.Provider, error) {
	migrations, err := fs.Sub(embeddedMigrations, "migrations")
	if err != nil {
		return nil, fmt.Errorf("open embedded migrations: %w", err)
	}

	return goose.NewProvider(
		// Goose v3.27 has no DuckDB dialect; this built-in store uses
		// version-table SQL that DuckDB accepts through database/sql.
		goose.DialectAuroraDSQL,
		appDB.db,
		migrations,
		goose.WithTableName("schema_version"),
		goose.WithDisableGlobalRegistry(true),
	)
}

func useAccountingLocation(ctx context.Context, appDB *AppDB, queryer sqlQueryer) error {
	schemaName := appDB.accountingSchemaName()
	if _, err := queryer.ExecContext(ctx, "USE "+schemaName); err != nil {
		return fmt.Errorf("select accounting schema %s: %w", schemaName, err)
	}

	return nil
}

type schemaVersionShape int

const (
	schemaVersionTableUnknown schemaVersionShape = iota
	schemaVersionTableGoose
	schemaVersionTableLegacy
)

func normalizeSchemaVersionTable(ctx context.Context, appDB *AppDB) error {
	exists, err := schemaVersionTableExists(ctx, appDB)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}

	shape, err := schemaVersionTableShape(ctx, appDB)
	if err != nil {
		return err
	}
	switch shape {
	case schemaVersionTableGoose:
		return nil
	case schemaVersionTableLegacy:
		return convertLegacySchemaVersionTable(ctx, appDB)
	default:
		return fmt.Errorf("schema_version table has unsupported shape")
	}
}

func convertLegacySchemaVersionTable(ctx context.Context, appDB *AppDB) error {
	rows, err := appDB.db.QueryContext(ctx, "SELECT version FROM "+QuoteIdentifier("schema_version")+" ORDER BY version")
	if err != nil {
		return fmt.Errorf("read legacy schema versions: %w", err)
	}

	var versions []int64
	for rows.Next() {
		var version int64
		if err := rows.Scan(&version); err != nil {
			return fmt.Errorf("scan legacy schema version: %w", err)
		}
		versions = append(versions, version)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return fmt.Errorf("read legacy schema versions: %w", err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close legacy schema version rows: %w", err)
	}

	return withSQLTx(ctx, appDB.db, nil, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "DROP TABLE "+QuoteIdentifier("schema_version")); err != nil {
			return fmt.Errorf("drop legacy schema_version table: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `CREATE TABLE schema_version (
	id integer PRIMARY KEY,
	version_id bigint NOT NULL,
	is_applied boolean NOT NULL,
	tstamp timestamp NOT NULL DEFAULT now()
)`); err != nil {
			return fmt.Errorf("create goose schema_version table: %w", err)
		}
		if _, err := tx.ExecContext(
			ctx,
			"INSERT INTO "+QuoteIdentifier("schema_version")+" (id, version_id, is_applied) VALUES (?, ?, ?)",
			1,
			0,
			true,
		); err != nil {
			return fmt.Errorf("seed goose schema version zero: %w", err)
		}
		for i, version := range versions {
			if _, err := tx.ExecContext(
				ctx,
				"INSERT INTO "+QuoteIdentifier("schema_version")+" (id, version_id, is_applied) VALUES (?, ?, ?)",
				i+2,
				version,
				true,
			); err != nil {
				return fmt.Errorf("seed goose schema version %d: %w", version, err)
			}
		}

		return nil
	})
}

func schemaVersionTableExists(ctx context.Context, appDB *AppDB) (bool, error) {
	catalog, schema := appDB.accountingCatalogAndSchema()
	var count int
	if err := appDB.db.QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = 'schema_version'`,
		catalog,
		schema,
	).Scan(&count); err != nil {
		return false, fmt.Errorf("check schema version table: %w", err)
	}

	return count > 0, nil
}

func schemaVersionTableShape(ctx context.Context, appDB *AppDB) (schemaVersionShape, error) {
	catalog, schema := appDB.accountingCatalogAndSchema()
	rows, err := appDB.db.QueryContext(
		ctx,
		`SELECT column_name, data_type
FROM duckdb_columns()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = 'schema_version'`,
		catalog,
		schema,
	)
	if err != nil {
		return schemaVersionTableUnknown, fmt.Errorf("read schema_version columns: %w", err)
	}

	columns := map[string]string{}
	for rows.Next() {
		var column string
		var dataType string
		if err := rows.Scan(&column, &dataType); err != nil {
			return schemaVersionTableUnknown, fmt.Errorf("scan schema_version column: %w", err)
		}
		columns[column] = dataType
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return schemaVersionTableUnknown, fmt.Errorf("read schema_version columns: %w", err)
	}
	if err := rows.Close(); err != nil {
		return schemaVersionTableUnknown, fmt.Errorf("close schema_version columns: %w", err)
	}

	if schemaVersionColumnsMatch(columns, map[string]string{
		"id":         "INTEGER",
		"version_id": "BIGINT",
		"is_applied": "BOOLEAN",
		"tstamp":     "TIMESTAMP",
	}) {
		return schemaVersionTableGoose, nil
	}
	if _, ok := columns["version"]; ok && columns["name"] != "" && columns["applied_at"] != "" {
		return schemaVersionTableLegacy, nil
	}

	return schemaVersionTableUnknown, nil
}

func schemaVersionColumnsMatch(columns map[string]string, expected map[string]string) bool {
	for name, dataType := range expected {
		if columns[name] != dataType {
			return false
		}
	}

	return true
}
