package store

import (
	"context"
	"database/sql"
	"fmt"
)

// AccountingOpenRequest describes how to open the accounting store.
type AccountingOpenRequest struct {
	Path     string
	Location AccountingLocation
	Migrate  bool
}

// AccountingStore owns the DuckDB handle and selected accounting location.
type AccountingStore struct {
	db       *sql.DB
	location AccountingLocation
}

// NewAccountingStore wraps an opened DuckDB handle and selected accounting location.
func NewAccountingStore(db *sql.DB, location AccountingLocation) *AccountingStore {
	return &AccountingStore{
		db:       db,
		location: location,
	}
}

// OpenAccounting opens the process DuckDB handle and prepares the accounting location.
func OpenAccounting(ctx context.Context, request AccountingOpenRequest) (*AccountingStore, error) {
	db, err := OpenInMemory(ctx)
	if err != nil {
		return nil, err
	}
	accounting := NewAccountingStore(db, request.Location)

	if request.Path != "" {
		if err := AttachDatabase(ctx, accounting, request.Path); err != nil {
			return nil, closeAccountingAfterError(accounting, err)
		}
	}

	if err := PrepareAccountingLocation(ctx, accounting); err != nil {
		return nil, closeAccountingAfterError(accounting, err)
	}
	if request.Migrate {
		if err := Migrate(ctx, accounting); err != nil {
			return nil, closeAccountingAfterError(accounting, fmt.Errorf("migrate database: %w", err))
		}
	}

	return accounting, nil
}

// DB returns the opened DuckDB handle.
func (s *AccountingStore) DB() *sql.DB {
	return s.db
}

// Location returns the database and schema holding accounting state.
func (s *AccountingStore) Location() AccountingLocation {
	return s.location
}

// Close releases database resources owned by the store.
func (s *AccountingStore) Close() error {
	if s.db == nil {
		return nil
	}

	return s.db.Close()
}

func closeAccountingAfterError(accounting *AccountingStore, err error) error {
	if closeErr := accounting.Close(); closeErr != nil {
		return fmt.Errorf("%w; close database: %w", err, closeErr)
	}

	return err
}
