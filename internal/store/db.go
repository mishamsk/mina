package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"

	_ "github.com/duckdb/duckdb-go/v2"
)

const duckDBDriverName = "duckdb"

var schemaNamePattern = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

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

// UseSchema creates the named schema when needed and makes it the current schema.
func UseSchema(ctx context.Context, db *sql.DB, schema string) error {
	if !schemaNamePattern.MatchString(schema) {
		return fmt.Errorf("invalid schema name: %s", schema)
	}

	if _, err := db.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS "+schema); err != nil {
		return fmt.Errorf("create schema %s: %w", schema, err)
	}
	if _, err := db.ExecContext(ctx, "SET schema="+schema); err != nil {
		return fmt.Errorf("set schema %s: %w", schema, err)
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
