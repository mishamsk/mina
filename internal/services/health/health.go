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

// Health describes process availability and migrated accounting state.
type Health struct {
	DatabaseEncrypted bool
	Status            Status
	SchemaVersion     int64
}

// Repository reads health-related state.
type Repository interface {
	CurrentSchemaVersion(context.Context) (int64, error)
	DatabaseEncrypted(context.Context) (bool, error)
}

// Service owns health use cases.
type Service struct {
	repo Repository
}

// NewService creates a health service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
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

	return Health{
		DatabaseEncrypted: encrypted,
		Status:            StatusOK,
		SchemaVersion:     version,
	}, nil
}
