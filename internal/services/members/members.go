package members

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/mishamsk/mina/internal/services"
)

// Member is a household member used for journal record attribution.
type Member struct {
	ID           int64
	Name         string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	TombstonedAt *time.Time
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

// Reference is the household member data needed to validate write references.
type Reference struct {
	ID int64
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
	repo  Repository
	cache memberReferenceCache
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

	s.cacheActiveReference(member)

	return member, nil
}

// ValidateActiveReferences returns active household member references keyed by ID.
//
// Missing, tombstoned, and non-positive IDs return services.ErrInvalidReference.
func (s *Service) ValidateActiveReferences(ctx context.Context, ids []int64) (map[int64]Reference, error) {
	uniqueIDs := deduplicateIDs(ids)
	if len(uniqueIDs) == 0 {
		return map[int64]Reference{}, nil
	}

	if err := s.ensureReferenceCache(ctx); err != nil {
		return nil, err
	}

	s.cache.mu.RLock()
	defer s.cache.mu.RUnlock()

	refs := make(map[int64]Reference, len(uniqueIDs))
	for _, id := range uniqueIDs {
		state, ok := s.cache.entries[id]
		if !ok || !state.active {
			return nil, services.ErrInvalidReference
		}
		refs[id] = state.reference
	}

	return refs, nil
}

// ValidateActiveReference returns one active household member reference.
func (s *Service) ValidateActiveReference(ctx context.Context, id int64) (Reference, error) {
	refs, err := s.ValidateActiveReferences(ctx, []int64{id})
	if err != nil {
		return Reference{}, err
	}

	return refs[id], nil
}

// InvalidateReferenceCache forces the next reference validation to reload references.
func (s *Service) InvalidateReferenceCache() {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	s.cache.loaded = false
	s.cache.entries = nil
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

	s.cacheActiveReference(member)

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

	s.cacheInactiveReference(id)

	return nil
}

type memberReferenceCache struct {
	mu      sync.RWMutex
	loaded  bool
	entries map[int64]memberReferenceState
}

type memberReferenceState struct {
	reference Reference
	active    bool
}

func (s *Service) ensureReferenceCache(ctx context.Context) error {
	s.cache.mu.RLock()
	loaded := s.cache.loaded
	s.cache.mu.RUnlock()
	if loaded {
		return nil
	}

	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()
	if s.cache.loaded {
		return nil
	}

	members, err := s.repo.List(ctx, ListOptions{IncludeTombstoned: true})
	if err != nil {
		return err
	}

	entries := make(map[int64]memberReferenceState, len(members))
	for _, member := range members {
		entries[member.ID] = memberReferenceState{
			reference: Reference{
				ID: member.ID,
			},
			active: member.TombstonedAt == nil,
		}
	}
	s.cache.entries = entries
	s.cache.loaded = true

	return nil
}

func (s *Service) cacheActiveReference(member Member) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if s.cache.entries == nil {
		s.cache.entries = map[int64]memberReferenceState{}
	}
	s.cache.entries[member.ID] = memberReferenceState{
		reference: Reference{
			ID: member.ID,
		},
		active: member.TombstonedAt == nil,
	}
}

func (s *Service) cacheInactiveReference(id int64) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if s.cache.entries == nil {
		s.cache.entries = map[int64]memberReferenceState{}
	}
	state := s.cache.entries[id]
	state.reference.ID = id
	state.active = false
	s.cache.entries[id] = state
}

func deduplicateIDs(ids []int64) []int64 {
	seen := make(map[int64]struct{}, len(ids))
	uniqueIDs := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			return []int64{id}
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		uniqueIDs = append(uniqueIDs, id)
	}

	return uniqueIDs
}

func validateName(name string) error {
	if strings.TrimSpace(name) != name || name == "" {
		return services.InvalidRequest("name must be non-empty without leading or trailing whitespace")
	}

	return nil
}
