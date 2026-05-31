package store

import (
	"context"
	"database/sql"
	"fmt"
)

// AccountingOpenRequest describes how to open the accounting database handle.
type AccountingOpenRequest struct {
	Path     string
	Location AccountingLocationConfig
}

// AccountingDB owns the DuckDB handle and selected accounting location.
type AccountingDB struct {
	db       *sql.DB
	location AccountingLocation
}

func newAccountingDB(db *sql.DB, location AccountingLocation) *AccountingDB {
	return &AccountingDB{
		db:       db,
		location: location,
	}
}

// NewAccountingDB wraps an existing DuckDB handle with an accounting location.
func NewAccountingDB(db *sql.DB, location AccountingLocation) *AccountingDB {
	return newAccountingDB(db, location)
}

// OpenAccounting opens the process DuckDB handle and prepares the accounting location.
func OpenAccounting(ctx context.Context, request AccountingOpenRequest) (*AccountingDB, error) {
	db, err := OpenInMemory(ctx)
	if err != nil {
		return nil, err
	}
	location, err := NewAccountingLocation(ctx, db, request.Location)
	if err != nil {
		if closeErr := db.Close(); closeErr != nil {
			return nil, fmt.Errorf("%w; close database: %w", err, closeErr)
		}
		return nil, err
	}
	accounting := newAccountingDB(db, location)

	if request.Path != "" {
		if err := AttachDatabase(ctx, accounting, request.Path); err != nil {
			return nil, closeAccountingAfterError(accounting, err)
		}
	}

	return accounting, nil
}

// DB returns the opened DuckDB handle.
func (s *AccountingDB) DB() *sql.DB {
	return s.db
}

// Location returns the database and schema holding accounting state.
func (s *AccountingDB) Location() AccountingLocation {
	return s.location
}

// Close releases database resources owned by the accounting database handle.
func (s *AccountingDB) Close() error {
	if s.db == nil {
		return nil
	}

	return s.db.Close()
}

func closeAccountingAfterError(accounting *AccountingDB, err error) error {
	if closeErr := accounting.Close(); closeErr != nil {
		return fmt.Errorf("%w; close database: %w", err, closeErr)
	}

	return err
}
