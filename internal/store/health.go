package store

import (
	"context"
	"fmt"
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
