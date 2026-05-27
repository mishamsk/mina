package controllers

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/store"
)

// CategoryListOptions controls category list visibility.
type CategoryListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
}

// CategoryController owns category use cases and validation.
type CategoryController struct {
	store *store.CategoryStore
}

// NewCategoryController creates a CategoryController backed by db.
func NewCategoryController(db *sql.DB) *CategoryController {
	return &CategoryController{
		store: store.NewCategoryStore(db),
	}
}

// Create validates and creates a category.
func (c *CategoryController) Create(ctx context.Context, req models.CreateCategoryRequest) (models.Category, error) {
	if err := validateCategoryFQN(req.FQN); err != nil {
		return models.Category{}, err
	}

	category, err := c.store.Create(ctx, req)
	if errors.Is(err, store.ErrConflict) {
		return models.Category{}, conflict("active category fqn already exists")
	}
	if err != nil {
		return models.Category{}, err
	}

	return category, nil
}

// Get returns a category by ID.
func (c *CategoryController) Get(ctx context.Context, id int64, includeTombstoned bool) (models.Category, error) {
	if id <= 0 {
		return models.Category{}, invalidRequest("category_id must be positive")
	}

	category, err := c.store.Get(ctx, id, includeTombstoned)
	if errors.Is(err, store.ErrNotFound) {
		return models.Category{}, notFound("category not found")
	}
	if err != nil {
		return models.Category{}, err
	}

	return category, nil
}

// List returns categories using default visibility rules unless explicitly overridden.
func (c *CategoryController) List(ctx context.Context, opts CategoryListOptions) ([]models.Category, error) {
	return c.store.List(ctx, store.CategoryListOptions{
		IncludeHidden:     opts.IncludeHidden,
		IncludeTombstoned: opts.IncludeTombstoned,
	})
}

// UpdateHidden validates and updates a category hidden state.
func (c *CategoryController) UpdateHidden(ctx context.Context, id int64, req models.UpdateCategoryRequest) (models.Category, error) {
	if id <= 0 {
		return models.Category{}, invalidRequest("category_id must be positive")
	}
	if req.IsHidden == nil {
		return models.Category{}, invalidRequest("is_hidden is required")
	}

	category, err := c.store.UpdateHidden(ctx, id, *req.IsHidden)
	if errors.Is(err, store.ErrNotFound) {
		return models.Category{}, notFound("category not found")
	}
	if err != nil {
		return models.Category{}, err
	}

	return category, nil
}

// Delete tombstones a category.
func (c *CategoryController) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return invalidRequest("category_id must be positive")
	}

	if err := c.store.Tombstone(ctx, id); errors.Is(err, store.ErrNotFound) {
		return notFound("category not found")
	} else if err != nil {
		return err
	}

	return nil
}

func validateCategoryFQN(fqn string) error {
	if strings.TrimSpace(fqn) != fqn || fqn == "" {
		return invalidRequest("fqn must be non-empty without leading or trailing whitespace")
	}
	if strings.HasPrefix(fqn, ":") || strings.HasSuffix(fqn, ":") || strings.Contains(fqn, "::") {
		return invalidRequest("fqn must be colon-separated with non-empty segments")
	}
	for _, segment := range strings.Split(fqn, ":") {
		if strings.TrimSpace(segment) != segment || segment == "" {
			return invalidRequest("fqn segments must be non-empty without leading or trailing whitespace")
		}
	}

	return nil
}
