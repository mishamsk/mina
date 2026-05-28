package controllers

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/store"
)

// TagListOptions controls tag list visibility.
type TagListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
	List              models.ListOptions
}

// TagController owns tag use cases and validation.
type TagController struct {
	store *store.TagStore
}

// NewTagController creates a TagController backed by db.
func NewTagController(db *sql.DB) *TagController {
	return &TagController{
		store: store.NewTagStore(db),
	}
}

// Create validates and creates a tag.
func (c *TagController) Create(ctx context.Context, req models.CreateTagRequest) (models.Tag, error) {
	if err := validateTagFQN(req.FQN); err != nil {
		return models.Tag{}, err
	}

	tag, err := c.store.Create(ctx, req)
	if errors.Is(err, store.ErrConflict) {
		return models.Tag{}, conflict("active tag fqn already exists")
	}
	if err != nil {
		return models.Tag{}, err
	}

	return tag, nil
}

// Get returns a tag by ID.
func (c *TagController) Get(ctx context.Context, id int64, includeTombstoned bool) (models.Tag, error) {
	if id <= 0 {
		return models.Tag{}, invalidRequest("tag_id must be positive")
	}

	tag, err := c.store.Get(ctx, id, includeTombstoned)
	if errors.Is(err, store.ErrNotFound) {
		return models.Tag{}, notFound("tag not found")
	}
	if err != nil {
		return models.Tag{}, err
	}

	return tag, nil
}

// List returns tags using default visibility rules unless explicitly overridden.
func (c *TagController) List(ctx context.Context, opts TagListOptions) ([]models.Tag, error) {
	return c.store.List(ctx, store.TagListOptions{
		IncludeHidden:     opts.IncludeHidden,
		IncludeTombstoned: opts.IncludeTombstoned,
		List:              opts.List,
	})
}

// UpdateHidden validates and updates a tag hidden state.
func (c *TagController) UpdateHidden(ctx context.Context, id int64, req models.UpdateTagRequest) (models.Tag, error) {
	if id <= 0 {
		return models.Tag{}, invalidRequest("tag_id must be positive")
	}
	if req.IsHidden == nil {
		return models.Tag{}, invalidRequest("is_hidden is required")
	}

	tag, err := c.store.UpdateHidden(ctx, id, *req.IsHidden)
	if errors.Is(err, store.ErrNotFound) {
		return models.Tag{}, notFound("tag not found")
	}
	if err != nil {
		return models.Tag{}, err
	}

	return tag, nil
}

// Delete tombstones a tag.
func (c *TagController) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return invalidRequest("tag_id must be positive")
	}

	if err := c.store.Tombstone(ctx, id); errors.Is(err, store.ErrNotFound) {
		return notFound("tag not found")
	} else if err != nil {
		return err
	}

	return nil
}

func validateTagFQN(fqn string) error {
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
