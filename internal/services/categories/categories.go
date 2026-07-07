package categories

import (
	"context"
	"errors"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/refcache"
)

// CategoryEconomicIntent identifies the economic meaning of a category.
type CategoryEconomicIntent string

const (
	CategoryEconomicIntentExpense    CategoryEconomicIntent = "expense"
	CategoryEconomicIntentFee        CategoryEconomicIntent = "fee"
	CategoryEconomicIntentIncome     CategoryEconomicIntent = "income"
	CategoryEconomicIntentRefund     CategoryEconomicIntent = "refund"
	CategoryEconomicIntentTransfer   CategoryEconomicIntent = "transfer"
	CategoryEconomicIntentExchange   CategoryEconomicIntent = "exchange"
	CategoryEconomicIntentAdjustment CategoryEconomicIntent = "adjustment"
	CategoryEconomicIntentFXGainLoss CategoryEconomicIntent = "fx_gain_loss"
)

// ValidCategoryEconomicIntent reports whether value is a supported category economic intent.
func ValidCategoryEconomicIntent(value CategoryEconomicIntent) bool {
	switch value {
	case CategoryEconomicIntentExpense,
		CategoryEconomicIntentFee,
		CategoryEconomicIntentIncome,
		CategoryEconomicIntentRefund,
		CategoryEconomicIntentTransfer,
		CategoryEconomicIntentExchange,
		CategoryEconomicIntentAdjustment,
		CategoryEconomicIntentFXGainLoss:
		return true
	default:
		return false
	}
}

// Category is a hierarchical category used to classify journal records.
type Category struct {
	ID             int64
	FQN            string
	EconomicIntent CategoryEconomicIntent
	IsHidden       bool
	ParentFQN      *string
	Name           string
	Level          int
	CreatedAt      time.Time
	UpdatedAt      time.Time
	TombstonedAt   *time.Time
}

// CreateInput contains fields for creating a category.
type CreateInput struct {
	FQN            string
	EconomicIntent CategoryEconomicIntent
	IsHidden       bool
}

// ListOptions controls category list visibility.
type ListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
	EconomicIntents   []CategoryEconomicIntent
	List              services.ListOptions
}

// GroupState is an implicit category group derived from active category FQNs.
type GroupState = services.FQNGroupState

// ReferenceOptions controls category reference validation.
type ReferenceOptions struct {
	// AllowHidden permits hidden active categories as valid write references.
	AllowHidden bool
}

// Reference is the category data needed to validate write references and classify transactions.
type Reference struct {
	ID             int64
	EconomicIntent CategoryEconomicIntent
	IsHidden       bool
}

// ActiveUsage reports active resources that reference a category.
type ActiveUsage struct {
	JournalRecords             bool
	TransactionTemplateRecords bool
}

// HasActiveDependents reports whether any active resource references the category.
func (u ActiveUsage) HasActiveDependents() bool {
	return u.JournalRecords || u.TransactionTemplateRecords
}

// Repository persists category state.
type Repository interface {
	Create(context.Context, CreateInput) (Category, error)
	Get(context.Context, int64, bool) (Category, error)
	List(context.Context, ListOptions) (services.PaginatedList[Category], error)
	UpdateHidden(context.Context, int64, bool) (Category, error)
	RestructureFQNs(context.Context, string, string) (int64, error)
	SetHiddenByPath(context.Context, string, bool) error
	ActiveUsage(context.Context, int64) (ActiveUsage, error)
	Tombstone(context.Context, int64) error
}

// ReferenceSerializer serializes dictionary deletes with writes that create dependent references.
type ReferenceSerializer interface {
	SerializeReferenceOperation(func() error) error
}

// Service owns category use cases and validation.
type Service struct {
	repo  Repository
	refs  ReferenceSerializer
	cache *refcache.Dictionary[int64, categoryReferenceState]
}

// NewService creates a category service backed by repo.
func NewService(repo Repository, refs ReferenceSerializer) *Service {
	service := &Service{repo: repo, refs: refs}
	service.cache = refcache.NewDictionary(service.loadReferenceCache)
	return service
}

// Create validates and creates a category.
func (s *Service) Create(ctx context.Context, input CreateInput) (Category, error) {
	if err := validateFQN(input.FQN); err != nil {
		return Category{}, err
	}
	if !ValidCategoryEconomicIntent(input.EconomicIntent) {
		return Category{}, services.InvalidRequest("economic_intent must be one of expense, fee, income, refund, transfer, exchange, adjustment, or fx_gain_loss")
	}

	var category Category
	if err := s.refs.SerializeReferenceOperation(func() error {
		if err := s.ensureFQNAvailable(ctx, input.FQN); err != nil {
			return err
		}

		created, err := s.repo.Create(ctx, input)
		if errors.Is(err, services.ErrConflict) {
			return services.Conflict("active category fqn already exists")
		}
		if err != nil {
			return err
		}

		s.cacheActiveReference(created)
		category = created
		return nil
	}); err != nil {
		return Category{}, err
	}

	return category, nil
}

// ValidateActiveReferences returns active category references keyed by ID.
//
// Hidden active categories are rejected unless opts.AllowHidden is true.
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

// ValidateActiveReference returns one active category reference.
//
// Hidden active categories are rejected unless opts.AllowHidden is true.
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

// Get returns a category by ID.
func (s *Service) Get(ctx context.Context, id int64, includeTombstoned bool) (Category, error) {
	if id <= 0 {
		return Category{}, services.InvalidRequest("category_id must be positive")
	}

	category, err := s.repo.Get(ctx, id, includeTombstoned)
	if errors.Is(err, services.ErrNotFound) {
		return Category{}, services.NotFound("category not found")
	}
	if err != nil {
		return Category{}, err
	}

	return category, nil
}

// List returns categories using default visibility rules unless explicitly overridden.
func (s *Service) List(ctx context.Context, opts ListOptions) (services.PaginatedList[Category], error) {
	for _, intent := range opts.EconomicIntents {
		if !ValidCategoryEconomicIntent(intent) {
			return services.PaginatedList[Category]{}, services.InvalidRequest("economic_intent must be one of expense, fee, income, refund, transfer, exchange, adjustment, or fx_gain_loss")
		}
	}

	return s.repo.List(ctx, opts)
}

// GroupStates derives implicit category groups from active leaves.
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

// UpdateHidden validates and updates a category hidden state.
func (s *Service) UpdateHidden(ctx context.Context, id int64, isHidden *bool) (Category, error) {
	if id <= 0 {
		return Category{}, services.InvalidRequest("category_id must be positive")
	}
	if isHidden == nil {
		return Category{}, services.InvalidRequest("is_hidden is required")
	}

	category, err := s.repo.UpdateHidden(ctx, id, *isHidden)
	if errors.Is(err, services.ErrNotFound) {
		return Category{}, services.NotFound("category not found")
	}
	if err != nil {
		return Category{}, err
	}

	s.cacheActiveReference(category)

	return category, nil
}

// Restructure atomically rewrites an active category FQN subtree from one path to another.
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

		moved := map[int64]categoryReferenceState{}
		for id, state := range states {
			if state.active && services.FQNAtOrUnder(state.fqn, from) {
				moved[id] = state
			}
		}
		if len(moved) == 0 {
			return services.NotFound("category path not found")
		}

		if services.FQNAtOrUnder(to, from) && !singleLeafMove(moved, from) {
			return services.InvalidRequest("category group cannot be moved into its own subtree")
		}

		for id, state := range states {
			if !state.active {
				continue
			}
			if _, ok := moved[id]; ok {
				continue
			}
			if services.FQNPathConflict(to, state.fqn) {
				return services.Conflict("category destination fqn conflicts with existing category hierarchy")
			}
		}

		count, err := s.repo.RestructureFQNs(ctx, from, to)
		if errors.Is(err, services.ErrConflict) {
			return services.Conflict("category restructure conflicts with an existing active budget for the destination path and month")
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

// SetHiddenByPath sets hidden state on every active category leaf at or under path.
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
			return services.NotFound("category path not found")
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

func singleLeafMove(moved map[int64]categoryReferenceState, from string) bool {
	if len(moved) != 1 {
		return false
	}
	for _, state := range moved {
		return state.fqn == from
	}
	return false
}

// ActiveUsage reports active resources that reference a category.
func (s *Service) ActiveUsage(ctx context.Context, id int64) (ActiveUsage, error) {
	if id <= 0 {
		return ActiveUsage{}, services.InvalidRequest("category_id must be positive")
	}

	return s.repo.ActiveUsage(ctx, id)
}

// Delete tombstones a category.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("category_id must be positive")
	}

	if err := s.refs.SerializeReferenceOperation(func() error {
		if _, err := s.repo.Get(ctx, id, false); errors.Is(err, services.ErrNotFound) {
			return services.NotFound("category not found")
		} else if err != nil {
			return err
		}
		usage, err := s.repo.ActiveUsage(ctx, id)
		if err != nil {
			return err
		}
		if usage.HasActiveDependents() {
			return services.Conflict("category is referenced by active resources")
		}
		if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
			return services.NotFound("category not found")
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

type categoryReferenceState struct {
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
			return services.Conflict("active category fqn already exists")
		}
		return services.Conflict("active category fqn conflicts with existing category hierarchy")
	}

	return nil
}

func (s *Service) loadReferenceCache(ctx context.Context) (map[int64]categoryReferenceState, error) {
	categories, err := s.repo.List(ctx, ListOptions{IncludeHidden: true, IncludeTombstoned: true})
	if err != nil {
		return nil, err
	}

	entries := make(map[int64]categoryReferenceState, len(categories.Items))
	for _, category := range categories.Items {
		entries[category.ID] = categoryReferenceStateFromCategory(category)
	}

	return entries, nil
}

func (s *Service) cacheActiveReference(category Category) {
	s.cache.Put(category.ID, categoryReferenceStateFromCategory(category))
}

func categoryReferenceStateFromCategory(category Category) categoryReferenceState {
	return categoryReferenceState{
		reference: Reference{
			ID:             category.ID,
			EconomicIntent: category.EconomicIntent,
			IsHidden:       category.IsHidden,
		},
		fqn:    category.FQN,
		active: category.TombstonedAt == nil,
	}
}

func (s *Service) cacheInactiveReference(id int64) {
	s.cache.Modify(id, func(state categoryReferenceState, ok bool) categoryReferenceState {
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
