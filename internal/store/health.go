package store

import (
	"context"
	"fmt"
	"os"
)

// HealthStore reads health-related database state.
type HealthStore struct {
	db *AppDB
}

// NewHealthStore creates a health repository.
func NewHealthStore(db *AppDB) *HealthStore {
	return &HealthStore{db: db}
}

// CurrentSchemaVersion returns the highest applied migration version.
func (s *HealthStore) CurrentSchemaVersion(ctx context.Context) (int64, error) {
	var version int64
	if err := s.db.query().QueryRowContext(
		ctx,
		"SELECT COALESCE(MAX(version_id), 0) FROM "+s.db.accountingName("schema_version")+" WHERE is_applied",
	).Scan(&version); err != nil {
		return 0, fmt.Errorf("read current schema version: %w", err)
	}

	return version, nil
}

// DatabaseEncrypted reports whether the selected accounting database uses encryption at rest.
func (s *HealthStore) DatabaseEncrypted(ctx context.Context) (bool, error) {
	var encrypted bool
	if err := s.db.query().QueryRowContext(
		ctx,
		"SELECT encrypted FROM duckdb_databases() WHERE database_name = ?",
		s.db.accountingDatabaseName(),
	).Scan(&encrypted); err != nil {
		return false, fmt.Errorf("read database encryption status: %w", err)
	}

	return encrypted, nil
}

// DatabaseFileSizeBytes returns the selected accounting database file's on-disk size.
func (s *HealthStore) DatabaseFileSizeBytes(context.Context) (*int64, error) {
	if s.db.accountingPath == "" {
		return nil, nil
	}

	info, err := os.Stat(s.db.accountingPath)
	if err != nil {
		return nil, fmt.Errorf("read database file size: %w", err)
	}
	size := info.Size()
	return &size, nil
}
