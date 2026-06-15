package backups

import (
	"context"
	"errors"
	"time"
)

var (
	// ErrProviderRequired identifies a missing backup provider dependency.
	ErrProviderRequired = errors.New("backup provider is not configured")
	// ErrSourceRequired identifies a missing backup source dependency.
	ErrSourceRequired = errors.New("backup source is not configured")
	// ErrInMemorySource identifies backup attempts against process-local accounting state.
	ErrInMemorySource = errors.New("in-memory accounting database cannot be backed up")
	// ErrSourceCopyFailed identifies a failed source database copy.
	ErrSourceCopyFailed = errors.New("backup source copy failed")
	// ErrProviderConfigInvalid identifies invalid backup provider configuration.
	ErrProviderConfigInvalid = errors.New("backup provider configuration invalid")
	// ErrProviderFailed identifies a failed backup destination operation.
	ErrProviderFailed = errors.New("backup provider failed")
)

// Source copies Mina's selected accounting database to a provider-owned DuckDB target file.
type Source interface {
	CopyDatabaseToDuckDBFile(ctx context.Context, path string) error
}

// Provider owns a backup destination lifecycle.
type Provider interface {
	Backup(ctx context.Context, source Source, requestedAt time.Time) error
}

// Clock returns the current process time.
type Clock interface {
	Now() time.Time
}

// Service owns database backup execution.
type Service struct {
	source   Source
	provider Provider
	clock    Clock
}

// NewService creates a backup service.
func NewService(source Source, provider Provider, clock Clock) *Service {
	return &Service{source: source, provider: provider, clock: clock}
}

// Run creates one provider-owned database backup.
func (s *Service) Run(ctx context.Context) error {
	if s.source == nil {
		return ErrSourceRequired
	}
	if s.provider == nil {
		return ErrProviderRequired
	}

	return s.provider.Backup(ctx, s.source, s.clock.Now().UTC())
}
