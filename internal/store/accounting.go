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

// AccountingDB represents the DuckDB handle and selected accounting location.
type AccountingDB struct {
	db       *sql.DB
	tx       *sql.Tx
	location AccountingLocation
	close    func() error
}

// OpenAccounting opens the process DuckDB handle and prepares the accounting location.
func OpenAccounting(ctx context.Context, request AccountingOpenRequest) (*AccountingDB, error) {
	db, err := OpenInMemory(ctx)
	if err != nil {
		return nil, err
	}

	accounting, err := openAccounting(ctx, db, request, func(*AccountingDB) error {
		return db.Close()
	})
	if err != nil {
		if closeErr := db.Close(); closeErr != nil {
			return nil, fmt.Errorf("%w; close database: %w", err, closeErr)
		}

		return nil, err
	}

	return accounting, nil
}

// OpenAccountingWithProcessDB opens accounting state on an existing DuckDB process handle.
// Closing the returned accounting DB does not close the process handle.
func OpenAccountingWithProcessDB(ctx context.Context, db *sql.DB, request AccountingOpenRequest) (*AccountingDB, error) {
	return openAccounting(ctx, db, request, func(accounting *AccountingDB) error {
		if request.Path == "" {
			return nil
		}

		return detachDatabase(context.Background(), accounting)
	})
}

func openAccounting(
	ctx context.Context,
	db *sql.DB,
	request AccountingOpenRequest,
	close func(*AccountingDB) error,
) (*AccountingDB, error) {
	location, err := NewAccountingLocation(ctx, db, request.Location)
	if err != nil {
		return nil, err
	}
	accounting := &AccountingDB{
		db:       db,
		location: location,
	}
	accounting.close = func() error {
		return close(accounting)
	}

	if request.Path != "" {
		if err := attachDatabase(ctx, accounting, request.Path); err != nil {
			return nil, err
		}
	}

	return accounting, nil
}

// query returns the SQL executor repository methods must use for direct queries.
// Transaction-scoped accounting handles route queries to their active transaction.
func (s *AccountingDB) query() sqlQueryer {
	if s.tx != nil {
		return s.tx
	}

	return s.db
}

// Location returns the database and schema holding accounting state.
func (s *AccountingDB) Location() AccountingLocation {
	return s.location
}

// Close releases database resources owned by the accounting database handle.
func (s *AccountingDB) Close() error {
	if s.close == nil {
		return nil
	}

	return s.close()
}
