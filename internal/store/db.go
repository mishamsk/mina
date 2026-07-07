package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	_ "github.com/duckdb/duckdb-go/v2"
)

const duckDBDriverName = "duckdb"

// OpenInMemory opens an in-memory DuckDB database handle and verifies it can be reached.
func OpenInMemory(ctx context.Context) (*sql.DB, error) {
	return open(ctx, ":memory:", 1)
}

func attachDatabase(ctx context.Context, appDB *AppDB, path string) error {
	return attachDatabaseWithOptions(ctx, appDB, path, "")
}

func attachDatabaseReadOnly(ctx context.Context, appDB *AppDB, path string) error {
	return attachDatabaseWithOptions(ctx, appDB, path, " (READ_ONLY)")
}

func attachDatabaseWithOptions(ctx context.Context, appDB *AppDB, path string, options string) error {
	if path == "" {
		return errors.New("database path is required")
	}
	// DuckDB does not accept bind parameters in ATTACH, so the file path is
	// rendered as a SQL string literal with standard single-quote escaping.
	if _, err := appDB.db.ExecContext(ctx, "ATTACH "+quoteStringLiteral(path)+" AS "+appDB.accountingDatabaseIdentifier()+options); err != nil {
		return fmt.Errorf("attach accounting database %s: %w", path, err)
	}

	return nil
}

func detachDatabase(ctx context.Context, appDB *AppDB) error {
	if _, err := appDB.db.ExecContext(ctx, "USE memory.main"); err != nil {
		return fmt.Errorf("select memory database before detach: %w", err)
	}
	if _, err := appDB.db.ExecContext(ctx, "DETACH "+QuoteIdentifier(appDB.accountingDatabaseName())); err != nil {
		return fmt.Errorf("detach accounting database %s: %w", appDB.accountingDatabaseName(), err)
	}

	return nil
}

func prepareAccountingLocation(ctx context.Context, appDB *AppDB) error {
	schemaName := appDB.accountingSchemaName()
	if _, err := appDB.db.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS "+schemaName); err != nil {
		return fmt.Errorf("create accounting schema %s: %w", schemaName, err)
	}

	return nil
}

func open(ctx context.Context, path string, maxOpenConns int) (*sql.DB, error) {
	db, err := sql.Open(duckDBDriverName, path)
	if err != nil {
		return nil, fmt.Errorf("open duckdb database: %w", err)
	}
	db.SetMaxOpenConns(maxOpenConns)

	if err := db.PingContext(ctx); err != nil {
		if closeErr := db.Close(); closeErr != nil {
			return nil, fmt.Errorf("ping database: %w; close database: %w", err, closeErr)
		}
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return db, nil
}

func quoteStringLiteral(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}
