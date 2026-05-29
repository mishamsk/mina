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
