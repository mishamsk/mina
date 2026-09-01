package health

import (
	"context"
)

// Status is the process health status.
type Status string

const (
	// StatusOK means the process is available.
	StatusOK Status = "ok"
)

// DevelopmentBuild identifies a development build from the Mina source repository.
type DevelopmentBuild struct {
	CommitSHA string
	RepoURL   string
}

// Health describes process availability and migrated accounting state.
type Health struct {
	DatabaseEncrypted     bool
	DatabaseFileSizeBytes *int64
	Status                Status
	SchemaVersion         int64
	Version               DevelopmentBuild
}

// Repository reads health-related state.
type Repository interface {
	CurrentSchemaVersion(context.Context) (int64, error)
	DatabaseEncrypted(context.Context) (bool, error)
	DatabaseFileSizeBytes(context.Context) (*int64, error)
}

// Service owns health use cases.
type Service struct {
	repo    Repository
	version DevelopmentBuild
}

// NewService creates a health service backed by repo with immutable development-build metadata.
func NewService(repo Repository, version DevelopmentBuild) *Service {
	return &Service{repo: repo, version: version}
}

// Check returns the current process health.
func (s *Service) Check(ctx context.Context) (Health, error) {
	version, err := s.repo.CurrentSchemaVersion(ctx)
	if err != nil {
		return Health{}, err
	}
	encrypted, err := s.repo.DatabaseEncrypted(ctx)
	if err != nil {
		return Health{}, err
	}
	fileSize, _ := s.repo.DatabaseFileSizeBytes(ctx)

	return Health{
		DatabaseEncrypted:     encrypted,
		DatabaseFileSizeBytes: fileSize,
		Status:                StatusOK,
		SchemaVersion:         version,
		Version:               s.version,
	}, nil
}
