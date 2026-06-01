package tags

import (
	"context"
	"errors"
	"strings"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/values"
)

// Tag is a hierarchical label used for flexible journal record grouping.
type Tag struct {
	ID           int64
	FQN          string
	IsHidden     bool
	ParentFQN    *string
	Name         string
	Level        int
	CreatedAt    values.AuditTimestamp
	UpdatedAt    values.AuditTimestamp
	TombstonedAt *values.AuditTimestamp
}

// CreateInput contains fields for creating a tag.
type CreateInput struct {
	FQN      string
	IsHidden bool
}

// ListOptions controls tag list visibility.
type ListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
	List              services.ListOptions
}

// Repository persists tag state.
type Repository interface {
	Create(context.Context, CreateInput) (Tag, error)
	Get(context.Context, int64, bool) (Tag, error)
	List(context.Context, ListOptions) ([]Tag, error)
	UpdateHidden(context.Context, int64, bool) (Tag, error)
	Tombstone(context.Context, int64) error
}

// Service owns tag use cases and validation.
type Service struct {
	repo Repository
}

// NewService creates a tag service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Create validates and creates a tag.
func (s *Service) Create(ctx context.Context, input CreateInput) (Tag, error) {
	if err := validateFQN(input.FQN); err != nil {
		return Tag{}, err
	}

	tag, err := s.repo.Create(ctx, input)
	if errors.Is(err, services.ErrConflict) {
		return Tag{}, services.Conflict("active tag fqn already exists")
	}
	if err != nil {
		return Tag{}, err
	}

	return tag, nil
}

// Get returns a tag by ID.
func (s *Service) Get(ctx context.Context, id int64, includeTombstoned bool) (Tag, error) {
	if id <= 0 {
		return Tag{}, services.InvalidRequest("tag_id must be positive")
	}

	tag, err := s.repo.Get(ctx, id, includeTombstoned)
	if errors.Is(err, services.ErrNotFound) {
		return Tag{}, services.NotFound("tag not found")
	}
	if err != nil {
		return Tag{}, err
	}

	return tag, nil
}

// List returns tags using default visibility rules unless explicitly overridden.
func (s *Service) List(ctx context.Context, opts ListOptions) ([]Tag, error) {
	return s.repo.List(ctx, opts)
}

// UpdateHidden validates and updates a tag hidden state.
func (s *Service) UpdateHidden(ctx context.Context, id int64, isHidden *bool) (Tag, error) {
	if id <= 0 {
		return Tag{}, services.InvalidRequest("tag_id must be positive")
	}
	if isHidden == nil {
		return Tag{}, services.InvalidRequest("is_hidden is required")
	}

	tag, err := s.repo.UpdateHidden(ctx, id, *isHidden)
	if errors.Is(err, services.ErrNotFound) {
		return Tag{}, services.NotFound("tag not found")
	}
	if err != nil {
		return Tag{}, err
	}

	return tag, nil
}

// Delete tombstones a tag.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("tag_id must be positive")
	}

	if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
		return services.NotFound("tag not found")
	} else if err != nil {
		return err
	}

	return nil
}

func validateFQN(fqn string) error {
	if strings.TrimSpace(fqn) != fqn || fqn == "" {
		return services.InvalidRequest("fqn must be non-empty without leading or trailing whitespace")
	}
	if strings.HasPrefix(fqn, ":") || strings.HasSuffix(fqn, ":") || strings.Contains(fqn, "::") {
		return services.InvalidRequest("fqn must be colon-separated with non-empty segments")
	}
	for segment := range strings.SplitSeq(fqn, ":") {
		if strings.TrimSpace(segment) != segment || segment == "" {
			return services.InvalidRequest("fqn segments must be non-empty without leading or trailing whitespace")
		}
	}

	return nil
}
