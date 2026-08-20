package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// AppDBOpenRequest describes how to open the app database handle.
type AppDBOpenRequest struct {
	Path                string
	AccountingLocation  AccountingLocationConfig
	MaxOpenConns        int
	EncryptionKey       string
	HTTPFSExtensionPath string
}

// AppDB represents the DuckDB handle and selected accounting location.
type AppDB struct {
	db             *sql.DB
	tx             *sql.Tx
	location       AccountingLocation
	accountingPath string
	runtimeSchema  string
	encryptionKey  string
	close          func() error
}

// OpenAppDB opens the process DuckDB handle and prepares the accounting location.
func OpenAppDB(ctx context.Context, request AppDBOpenRequest) (*AppDB, error) {
	return openAppDBWithAttach(ctx, request, attachDatabase, true, true)
}

// OpenAppDBReadOnly opens the process DuckDB handle and attaches file-backed accounting state read-only.
func OpenAppDBReadOnly(ctx context.Context, request AppDBOpenRequest) (*AppDB, error) {
	return openAppDBWithAttach(ctx, request, attachDatabaseReadOnly, false, false)
}

func openAppDBWithAttach(
	ctx context.Context,
	request AppDBOpenRequest,
	attach func(context.Context, *AppDB, string) error,
	prepareEncryptedWrites bool,
	checkpointOnClose bool,
) (*AppDB, error) {
	db, err := open(ctx, ":memory:", request.MaxOpenConns)
	if err != nil {
		return nil, err
	}

	appDB, err := openAppDB(ctx, db, request, attach, prepareEncryptedWrites, func(appDB *AppDB) error {
		var detachErr error
		if request.Path != "" {
			detachErr = closeAttachedDatabase(context.Background(), appDB, checkpointOnClose)
		}

		return errors.Join(detachErr, db.Close())
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
	return openAppDB(ctx, db, request, attachDatabase, true, func(appDB *AppDB) error {
		if request.Path == "" {
			return nil
		}

		return closeAttachedDatabase(context.Background(), appDB, true)
	})
}

func openAppDB(
	ctx context.Context,
	db *sql.DB,
	request AppDBOpenRequest,
	attach func(context.Context, *AppDB, string) error,
	prepareEncryptedWrites bool,
	close func(*AppDB) error,
) (*AppDB, error) {
	if prepareEncryptedWrites {
		if err := prepareEncryptedDatabaseSupport(ctx, db, request); err != nil {
			return nil, err
		}
	}
	location, err := NewAccountingLocation(ctx, db, request.AccountingLocation)
	if err != nil {
		return nil, err
	}
	runtimeSchema, err := newRuntimeSchemaName()
	if err != nil {
		return nil, err
	}
	appDB := &AppDB{
		db:             db,
		location:       location,
		accountingPath: request.Path,
		runtimeSchema:  runtimeSchema,
		encryptionKey:  request.EncryptionKey,
	}
	appDB.close = func() error {
		return close(appDB)
	}
	if err := appDB.prepareRuntimeSchema(ctx); err != nil {
		return nil, err
	}

	if request.Path != "" {
		if err := attach(ctx, appDB, request.Path); err != nil {
			return nil, errors.Join(err, appDB.dropRuntimeSchema(context.Background()))
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

func (s *AppDB) runtimeSchemaName() string {
	return QuoteIdentifier("memory") + "." + QuoteIdentifier(s.runtimeSchema)
}

func (s *AppDB) runtimeName(object string) string {
	return s.runtimeSchemaName() + "." + QuoteIdentifier(object)
}

func (s *AppDB) runtimeSequenceNextVal(sequence string) string {
	return "nextval(" + quoteStringLiteral("memory."+s.runtimeSchema+"."+sequence) + ")"
}

func (s *AppDB) isInMemoryAccounting() bool {
	return s.location.Database() == "memory"
}

// Close releases database resources owned by the AppDB handle.
func (s *AppDB) Close() error {
	if s.close == nil {
		return nil
	}

	return errors.Join(
		s.dropRuntimeSchema(context.Background()),
		s.close(),
	)
}
