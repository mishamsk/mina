package store

import (
	"context"
	"database/sql"
	"fmt"
)

// AppDBOpenRequest describes how to open the app database handle.
type AppDBOpenRequest struct {
	Path               string
	AccountingLocation AccountingLocationConfig
}

// AppDB represents the DuckDB handle and selected accounting location.
type AppDB struct {
	db       *sql.DB
	tx       *sql.Tx
	location AccountingLocation
	close    func() error
}

// OpenAppDB opens the process DuckDB handle and prepares the accounting location.
func OpenAppDB(ctx context.Context, request AppDBOpenRequest) (*AppDB, error) {
	db, err := OpenInMemory(ctx)
	if err != nil {
		return nil, err
	}

	appDB, err := openAppDB(ctx, db, request, func(*AppDB) error {
		return db.Close()
	})
	if err != nil {
		if closeErr := db.Close(); closeErr != nil {
			return nil, fmt.Errorf("%w; close database: %w", err, closeErr)
		}

		return nil, err
	}

	return appDB, nil
}

// OpenAppDBWithProcessDB opens accounting state on an existing DuckDB process handle.
// Closing the returned AppDB does not close the process handle.
func OpenAppDBWithProcessDB(ctx context.Context, db *sql.DB, request AppDBOpenRequest) (*AppDB, error) {
	return openAppDB(ctx, db, request, func(appDB *AppDB) error {
		if request.Path == "" {
			return nil
		}

		return detachDatabase(context.Background(), appDB)
	})
}

func openAppDB(
	ctx context.Context,
	db *sql.DB,
	request AppDBOpenRequest,
	close func(*AppDB) error,
) (*AppDB, error) {
	location, err := NewAccountingLocation(ctx, db, request.AccountingLocation)
	if err != nil {
		return nil, err
	}
	appDB := &AppDB{
		db:       db,
		location: location,
	}
	appDB.close = func() error {
		return close(appDB)
	}

	if request.Path != "" {
		if err := attachDatabase(ctx, appDB, request.Path); err != nil {
			return nil, err
		}
	}

	return appDB, nil
}

// query returns the SQL executor repository methods must use for direct queries.
// Transaction-scoped AppDB handles route queries to their active transaction.
func (s *AppDB) query() sqlQueryer {
	if s.tx != nil {
		return s.tx
	}

	return s.db
}

// Location returns the database and schema holding accounting state.
func (s *AppDB) Location() AccountingLocation {
	return s.location
}

func (s *AppDB) accountingName(object string) string {
	return s.location.mustQualifiedName(object)
}

func (s *AppDB) accountingSchemaName() string {
	return s.location.databaseIdentifier + "." + s.location.schemaIdentifier
}

func (s *AppDB) accountingCatalogAndSchema() (string, string) {
	return s.location.database, s.location.schema
}

func (s *AppDB) accountingDatabaseIdentifier() string {
	return s.location.databaseIdentifier
}

func (s *AppDB) accountingDatabaseName() string {
	return s.location.database
}

func (s *AppDB) isInMemoryAccounting() bool {
	return s.location.Database() == "memory"
}

// Close releases database resources owned by the AppDB handle.
func (s *AppDB) Close() error {
	if s.close == nil {
		return nil
	}

	return s.close()
}
