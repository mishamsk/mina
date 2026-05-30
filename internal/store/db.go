package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	_ "github.com/duckdb/duckdb-go/v2"
)

const duckDBDriverName = "duckdb"

// Open opens a DuckDB database handle and verifies it can be reached.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	if path == "" {
		return nil, errors.New("database path is required")
	}

	return open(ctx, path)
}

// OpenInMemory opens an in-memory DuckDB database handle and verifies it can be reached.
func OpenInMemory(ctx context.Context) (*sql.DB, error) {
	return open(ctx, ":memory:")
}

// PrepareAccountingLocation creates the accounting schema when needed.
func PrepareAccountingLocation(ctx context.Context, db *sql.DB, location AccountingLocation) error {
	if err := location.Validate(); err != nil {
		return err
	}

	schemaName := QuoteIdentifier(location.Catalog) + "." + QuoteIdentifier(location.Schema)
	if _, err := db.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS "+schemaName); err != nil {
		return fmt.Errorf("create accounting schema %s: %w", schemaName, err)
	}

	return nil
}

func open(ctx context.Context, path string) (*sql.DB, error) {
	db, err := sql.Open(duckDBDriverName, path)
	if err != nil {
		return nil, fmt.Errorf("open duckdb database: %w", err)
	}
	db.SetMaxOpenConns(1)

	if err := db.PingContext(ctx); err != nil {
		if closeErr := db.Close(); closeErr != nil {
			return nil, fmt.Errorf("ping database: %w; close database: %w", err, closeErr)
		}
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return db, nil
}
