package members

import (
	"context"
	"errors"
	"strings"

	"github.com/mishamsk/mina/internal/services"
)

// Member is a household member used for journal record attribution.
type Member struct {
	ID           int64
	Name         string
	CreatedAt    string
	UpdatedAt    string
	TombstonedAt *string
}

// CreateInput contains fields for creating a household member.
type CreateInput struct {
	Name string
}

// UpdateInput contains fields for updating a household member.
type UpdateInput struct {
	Name string
}

// ListOptions controls member list visibility.
type ListOptions struct {
	IncludeTombstoned bool
	List              services.ListOptions
}

// Repository persists household member state.
type Repository interface {
	Create(context.Context, CreateInput) (Member, error)
	Get(context.Context, int64, bool) (Member, error)
	List(context.Context, ListOptions) ([]Member, error)
	UpdateName(context.Context, int64, string) (Member, error)
	Tombstone(context.Context, int64) error
}

// Service owns household member use cases and validation.
type Service struct {
	repo Repository
}

// NewService creates a member service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Create validates and creates a household member.
func (s *Service) Create(ctx context.Context, input CreateInput) (Member, error) {
	if err := validateName(input.Name); err != nil {
		return Member{}, err
	}

	member, err := s.repo.Create(ctx, input)
	if errors.Is(err, services.ErrConflict) {
		return Member{}, services.Conflict("active member name already exists")
	}
	if err != nil {
		return Member{}, err
	}

	return member, nil
}

// Get returns a household member by ID.
func (s *Service) Get(ctx context.Context, id int64, includeTombstoned bool) (Member, error) {
	if id <= 0 {
		return Member{}, services.InvalidRequest("member_id must be positive")
	}

	member, err := s.repo.Get(ctx, id, includeTombstoned)
	if errors.Is(err, services.ErrNotFound) {
		return Member{}, services.NotFound("member not found")
	}
	if err != nil {
		return Member{}, err
	}

	return member, nil
}

// List returns household members using default visibility rules unless explicitly overridden.
func (s *Service) List(ctx context.Context, opts ListOptions) ([]Member, error) {
	return s.repo.List(ctx, opts)
}

// UpdateName validates and updates a household member name.
func (s *Service) UpdateName(ctx context.Context, id int64, input UpdateInput) (Member, error) {
	if id <= 0 {
		return Member{}, services.InvalidRequest("member_id must be positive")
	}
	if err := validateName(input.Name); err != nil {
		return Member{}, err
	}

	member, err := s.repo.UpdateName(ctx, id, input.Name)
	if errors.Is(err, services.ErrConflict) {
		return Member{}, services.Conflict("active member name already exists")
	}
	if errors.Is(err, services.ErrNotFound) {
		return Member{}, services.NotFound("member not found")
	}
	if err != nil {
		return Member{}, err
	}

	return member, nil
}

// Delete tombstones a household member.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("member_id must be positive")
	}

	if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
		return services.NotFound("member not found")
	} else if err != nil {
		return err
	}

	return nil
}

func validateName(name string) error {
	if strings.TrimSpace(name) != name || name == "" {
		return services.InvalidRequest("name must be non-empty without leading or trailing whitespace")
	}

	return nil
}
