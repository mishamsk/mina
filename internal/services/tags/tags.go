package tags

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/refcache"
)

// Tag is a hierarchical label used for flexible journal record grouping.
type Tag struct {
	ID           int64
	FQN          string
	IsHidden     bool
	ParentFQN    *string
	Name         string
	Level        int
	CreatedAt    time.Time
	UpdatedAt    time.Time
	TombstonedAt *time.Time
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

// ReferenceOptions controls tag reference validation.
type ReferenceOptions struct {
	// AllowHidden permits hidden active tags as valid write references.
	AllowHidden bool
}

// Reference is the tag data needed to validate write references.
type Reference struct {
	ID       int64
	IsHidden bool
}

// ActiveUsage reports active resources that reference a tag.
type ActiveUsage struct {
	JournalRecords             bool
	TransactionTemplateRecords bool
}

// HasActiveDependents reports whether any active resource references the tag.
func (u ActiveUsage) HasActiveDependents() bool {
	return u.JournalRecords || u.TransactionTemplateRecords
}

// Repository persists tag state.
type Repository interface {
	Create(context.Context, CreateInput) (Tag, error)
	Get(context.Context, int64, bool) (Tag, error)
	List(context.Context, ListOptions) (services.PaginatedList[Tag], error)
	UpdateHidden(context.Context, int64, bool) (Tag, error)
	ActiveUsage(context.Context, int64) (ActiveUsage, error)
	Tombstone(context.Context, int64) error
}

// ReferenceSerializer serializes dictionary deletes with writes that create dependent references.
type ReferenceSerializer interface {
	SerializeReferenceOperation(func() error) error
}

// Service owns tag use cases and validation.
type Service struct {
	repo  Repository
	refs  ReferenceSerializer
	cache *refcache.Dictionary[int64, tagReferenceState]
}

// NewService creates a tag service backed by repo.
func NewService(repo Repository, refs ReferenceSerializer) *Service {
	service := &Service{repo: repo, refs: refs}
	service.cache = refcache.NewDictionary(service.loadReferenceCache)
	return service
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

	s.cacheActiveReference(tag)

	return tag, nil
}

// ValidateActiveReferences returns active tag references keyed by ID.
//
// Hidden active tags are rejected unless opts.AllowHidden is true.
// Missing, tombstoned, hidden-disallowed, and non-positive IDs return
// services.ErrInvalidReference.
func (s *Service) ValidateActiveReferences(ctx context.Context, ids []int64, opts ReferenceOptions) (map[int64]Reference, error) {
	uniqueIDs := deduplicateIDs(ids)
	if len(uniqueIDs) == 0 {
		return map[int64]Reference{}, nil
	}

	states, err := s.cache.GetMany(ctx, uniqueIDs)
	if err != nil {
		return nil, err
	}

	refs := make(map[int64]Reference, len(uniqueIDs))
	for _, id := range uniqueIDs {
		state, ok := states[id]
		if !ok || !state.active || (!opts.AllowHidden && state.reference.IsHidden) {
			return nil, services.ErrInvalidReference
		}
		refs[id] = state.reference
	}

	return refs, nil
}

// ValidateActiveReference returns one active tag reference.
//
// Hidden active tags are rejected unless opts.AllowHidden is true.
func (s *Service) ValidateActiveReference(ctx context.Context, id int64, opts ReferenceOptions) (Reference, error) {
	refs, err := s.ValidateActiveReferences(ctx, []int64{id}, opts)
	if err != nil {
		return Reference{}, err
	}

	return refs[id], nil
}

// InvalidateReferenceCache forces the next reference validation to reload references.
func (s *Service) InvalidateReferenceCache() {
	s.cache.Invalidate()
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
func (s *Service) List(ctx context.Context, opts ListOptions) (services.PaginatedList[Tag], error) {
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

	s.cacheActiveReference(tag)

	return tag, nil
}

// ActiveUsage reports active resources that reference a tag.
func (s *Service) ActiveUsage(ctx context.Context, id int64) (ActiveUsage, error) {
	if id <= 0 {
		return ActiveUsage{}, services.InvalidRequest("tag_id must be positive")
	}

	return s.repo.ActiveUsage(ctx, id)
}

// Delete tombstones a tag.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("tag_id must be positive")
	}

	if err := s.refs.SerializeReferenceOperation(func() error {
		if _, err := s.repo.Get(ctx, id, false); errors.Is(err, services.ErrNotFound) {
			return services.NotFound("tag not found")
		} else if err != nil {
			return err
		}
		usage, err := s.repo.ActiveUsage(ctx, id)
		if err != nil {
			return err
		}
		if usage.HasActiveDependents() {
			return services.Conflict("tag is referenced by active resources")
		}
		if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
			return services.NotFound("tag not found")
		} else if err != nil {
			return err
		}

		s.cacheInactiveReference(id)
		return nil
	}); err != nil {
		return err
	}

	return nil
}

type tagReferenceState struct {
	reference Reference
	active    bool
}

func (s *Service) loadReferenceCache(ctx context.Context) (map[int64]tagReferenceState, error) {
	tags, err := s.repo.List(ctx, ListOptions{IncludeHidden: true, IncludeTombstoned: true})
	if err != nil {
		return nil, err
	}

	entries := make(map[int64]tagReferenceState, len(tags.Items))
	for _, tag := range tags.Items {
		entries[tag.ID] = tagReferenceStateFromTag(tag)
	}

	return entries, nil
}

func (s *Service) cacheActiveReference(tag Tag) {
	s.cache.Put(tag.ID, tagReferenceStateFromTag(tag))
}

func tagReferenceStateFromTag(tag Tag) tagReferenceState {
	return tagReferenceState{
		reference: Reference{
			ID:       tag.ID,
			IsHidden: tag.IsHidden,
		},
		active: tag.TombstonedAt == nil,
	}
}

func (s *Service) cacheInactiveReference(id int64) {
	s.cache.Modify(id, func(state tagReferenceState, ok bool) tagReferenceState {
		if !ok {
			state.reference.ID = id
		}
		state.active = false
		return state
	})
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
