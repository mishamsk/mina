package store

import "database/sql"

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
