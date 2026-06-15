package categories

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
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
	List              services.ListOptions
}

// Repository persists category state.
type Repository interface {
	Create(context.Context, CreateInput) (Category, error)
	Get(context.Context, int64, bool) (Category, error)
	List(context.Context, ListOptions) ([]Category, error)
	UpdateHidden(context.Context, int64, bool) (Category, error)
	Tombstone(context.Context, int64) error
}

// Service owns category use cases and validation.
type Service struct {
	repo Repository
}

// NewService creates a category service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Create validates and creates a category.
func (s *Service) Create(ctx context.Context, input CreateInput) (Category, error) {
	if err := validateFQN(input.FQN); err != nil {
		return Category{}, err
	}
	if !ValidCategoryEconomicIntent(input.EconomicIntent) {
		return Category{}, services.InvalidRequest("economic_intent must be one of expense, fee, income, refund, transfer, exchange, adjustment, or fx_gain_loss")
	}

	category, err := s.repo.Create(ctx, input)
	if errors.Is(err, services.ErrConflict) {
		return Category{}, services.Conflict("active category fqn already exists")
	}
	if err != nil {
		return Category{}, err
	}

	return category, nil
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
func (s *Service) List(ctx context.Context, opts ListOptions) ([]Category, error) {
	return s.repo.List(ctx, opts)
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

	return category, nil
}

// Delete tombstones a category.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("category_id must be positive")
	}

	if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
		return services.NotFound("category not found")
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
