package tags

import (
	"context"
	"errors"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/refcache"
)

// Tag is a hierarchical label used for flexible journal record grouping.
type Tag struct {
	ID           int64
	FQN          string
	IsHidden     bool
	IsFeatured   bool
	ParentFQN    *string
	Name         string
	Level        int
	CreatedAt    time.Time
	UpdatedAt    time.Time
	TombstonedAt *time.Time
	Deletable    *bool
}

// CreateInput contains fields for creating a tag.
type CreateInput struct {
	FQN        string
	IsHidden   bool
	IsFeatured bool
}

// UpdateInput contains mutable tag fields.
type UpdateInput struct {
	IsHidden   *bool
	IsFeatured *bool
}

// ListOptions controls tag list visibility.
type ListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
	IsFeatured        *bool
	List              services.ListOptions
}

// GroupState is an implicit tag group derived from active tag FQNs.
type GroupState = services.FQNGroupState

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
	RecurringDefinitionRecords bool
}

// HasActiveDependents reports whether any active resource references the tag.
func (u ActiveUsage) HasActiveDependents() bool {
	return u.JournalRecords || u.TransactionTemplateRecords || u.RecurringDefinitionRecords
}

// Repository persists tag state.
type Repository interface {
	Create(context.Context, CreateInput) (Tag, error)
	Get(context.Context, int64, bool) (Tag, error)
	List(context.Context, ListOptions) (services.PaginatedList[Tag], error)
	UpdateMutable(context.Context, int64, UpdateInput) (Tag, error)
	RestructureFQNs(context.Context, string, string) (int64, error)
	SetHiddenByPath(context.Context, string, bool) error
	ActiveUsage(context.Context, []int64) (map[int64]ActiveUsage, error)
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

	var tag Tag
	if err := s.refs.SerializeReferenceOperation(func() error {
		if err := s.ensureFQNAvailable(ctx, input.FQN); err != nil {
			return err
		}

		created, err := s.repo.Create(ctx, input)
		if errors.Is(err, services.ErrConflict) {
			return services.Conflict("active tag fqn already exists")
		}
		if err != nil {
			return err
		}

		s.cacheActiveReference(created)
		tag = created
		return nil
	}); err != nil {
		return Tag{}, err
	}

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
	list, err := s.repo.List(ctx, opts)
	if err != nil {
		return services.PaginatedList[Tag]{}, err
	}
	if err := s.populateDeleteability(ctx, list.Items); err != nil {
		return services.PaginatedList[Tag]{}, err
	}

	return list, nil
}

// GroupStates derives implicit tag groups from active leaves.
func (s *Service) GroupStates(ctx context.Context, includeHidden bool) ([]GroupState, error) {
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return nil, err
	}

	leaves := make([]services.FQNLeafState, 0, len(states))
	for _, state := range states {
		if !state.active {
			continue
		}
		leaves = append(leaves, services.FQNLeafState{
			FQN:      state.fqn,
			IsHidden: state.reference.IsHidden,
		})
	}

	return services.DeriveFQNGroupStates(leaves, includeHidden), nil
}

// UpdateMutable validates and updates mutable tag fields.
func (s *Service) UpdateMutable(ctx context.Context, id int64, input UpdateInput) (Tag, error) {
	if id <= 0 {
		return Tag{}, services.InvalidRequest("tag_id must be positive")
	}
	if !input.hasChanges() {
		return Tag{}, services.InvalidRequest("at least one tag field is required")
	}

	var tag Tag
	if err := s.refs.SerializeReferenceOperation(func() error {
		updated, err := s.repo.UpdateMutable(ctx, id, input)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("tag not found")
		}
		if err != nil {
			return err
		}

		s.cacheActiveReference(updated)
		tag = updated
		return nil
	}); err != nil {
		return Tag{}, err
	}

	return tag, nil
}

func (input UpdateInput) hasChanges() bool {
	return input.IsHidden != nil || input.IsFeatured != nil
}

// Restructure atomically rewrites an active tag FQN subtree from one path to another.
func (s *Service) Restructure(ctx context.Context, from string, to string) (int64, error) {
	if err := validateFQN(from); err != nil {
		return 0, err
	}
	if err := validateFQN(to); err != nil {
		return 0, err
	}
	if from == to {
		return 0, services.InvalidRequest("to_fqn must differ from from_fqn")
	}

	var movedCount int64
	if err := s.refs.SerializeReferenceOperation(func() error {
		states, err := s.cache.Snapshot(ctx)
		if err != nil {
			return err
		}

		moved := map[int64]tagReferenceState{}
		for id, state := range states {
			if state.active && services.FQNAtOrUnder(state.fqn, from) {
				moved[id] = state
			}
		}
		if len(moved) == 0 {
			return services.NotFound("tag path not found")
		}

		if services.FQNAtOrUnder(to, from) && !singleLeafMove(moved, from) {
			return services.InvalidRequest("tag group cannot be moved into its own subtree")
		}

		for id, state := range states {
			if !state.active {
				continue
			}
			if _, ok := moved[id]; ok {
				continue
			}
			if services.FQNPathConflict(to, state.fqn) {
				return services.Conflict("tag destination fqn conflicts with existing tag hierarchy")
			}
		}

		count, err := s.repo.RestructureFQNs(ctx, from, to)
		if errors.Is(err, services.ErrConflict) {
			return services.Conflict("tag destination fqn conflicts with existing tag hierarchy")
		}
		if err != nil {
			return err
		}

		movedCount = count
		s.InvalidateReferenceCache()
		return nil
	}); err != nil {
		return 0, err
	}

	return movedCount, nil
}

// SetHiddenByPath sets hidden state on every active tag leaf at or under path.
func (s *Service) SetHiddenByPath(ctx context.Context, path string, hidden bool) (int64, error) {
	if err := validateFQN(path); err != nil {
		return 0, err
	}

	var updatedCount int64
	if err := s.refs.SerializeReferenceOperation(func() error {
		states, err := s.cache.Snapshot(ctx)
		if err != nil {
			return err
		}

		targetCount := int64(0)
		for _, state := range states {
			if state.active && services.FQNAtOrUnder(state.fqn, path) {
				targetCount++
			}
		}
		if targetCount == 0 {
			return services.NotFound("tag path not found")
		}

		if err := s.repo.SetHiddenByPath(ctx, path, hidden); err != nil {
			return err
		}

		updatedCount = targetCount
		s.InvalidateReferenceCache()
		return nil
	}); err != nil {
		return 0, err
	}

	return updatedCount, nil
}

func singleLeafMove(moved map[int64]tagReferenceState, from string) bool {
	if len(moved) != 1 {
		return false
	}
	for _, state := range moved {
		return state.fqn == from
	}
	return false
}

// ActiveUsage reports active resources that reference a tag.
func (s *Service) ActiveUsage(ctx context.Context, id int64) (ActiveUsage, error) {
	if id <= 0 {
		return ActiveUsage{}, services.InvalidRequest("tag_id must be positive")
	}

	usageByID, err := s.repo.ActiveUsage(ctx, []int64{id})
	if err != nil {
		return ActiveUsage{}, err
	}

	return usageByID[id], nil
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
		usageByID, err := s.repo.ActiveUsage(ctx, []int64{id})
		if err != nil {
			return err
		}
		if usageByID[id].HasActiveDependents() {
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

func (s *Service) populateDeleteability(ctx context.Context, tagItems []Tag) error {
	activeIDs := make([]int64, 0, len(tagItems))
	for _, tag := range tagItems {
		if tag.TombstonedAt == nil {
			activeIDs = append(activeIDs, tag.ID)
		}
	}
	usageByID, err := s.repo.ActiveUsage(ctx, activeIDs)
	if err != nil {
		return err
	}
	for index := range tagItems {
		usage := usageByID[tagItems[index].ID]
		deletable := tagItems[index].TombstonedAt == nil && !usage.HasActiveDependents()
		tagItems[index].Deletable = &deletable
	}

	return nil
}

type tagReferenceState struct {
	reference Reference
	fqn       string
	active    bool
}

func (s *Service) ensureFQNAvailable(ctx context.Context, fqn string) error {
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return err
	}
	for _, state := range states {
		if !state.active || !services.FQNPathConflict(fqn, state.fqn) {
			continue
		}
		if fqn == state.fqn {
			return services.Conflict("active tag fqn already exists")
		}
		return services.Conflict("active tag fqn conflicts with existing tag hierarchy")
	}

	return nil
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
		fqn:    tag.FQN,
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
	return services.ValidateFQN(fqn)
}
