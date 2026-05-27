package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	_ "modernc.org/sqlite"
)

const sqliteDriverName = "sqlite"

// Open opens a SQLite database handle and verifies it can be reached.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	if path == "" {
		return nil, errors.New("database path is required")
	}

	db, err := sql.Open(sqliteDriverName, path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	db.SetMaxOpenConns(1)

	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		if closeErr := db.Close(); closeErr != nil {
			return nil, fmt.Errorf("enable foreign keys: %w; close database: %w", err, closeErr)
		}
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}
	if err := db.PingContext(ctx); err != nil {
		if closeErr := db.Close(); closeErr != nil {
			return nil, fmt.Errorf("ping database: %w; close database: %w", err, closeErr)
		}
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return db, nil
}
