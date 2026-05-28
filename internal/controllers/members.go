package controllers

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/store"
)

// MemberListOptions controls member list visibility.
type MemberListOptions struct {
	IncludeTombstoned bool
	List              models.ListOptions
}

// MemberController owns household member use cases and validation.
type MemberController struct {
	store *store.MemberStore
}

// NewMemberController creates a MemberController backed by db.
func NewMemberController(db *sql.DB) *MemberController {
	return &MemberController{
		store: store.NewMemberStore(db),
	}
}

// Create validates and creates a household member.
func (c *MemberController) Create(ctx context.Context, req models.CreateMemberRequest) (models.Member, error) {
	if err := validateMemberName(req.Name); err != nil {
		return models.Member{}, err
	}

	member, err := c.store.Create(ctx, req)
	if errors.Is(err, store.ErrConflict) {
		return models.Member{}, conflict("active member name already exists")
	}
	if err != nil {
		return models.Member{}, err
	}

	return member, nil
}

// Get returns a household member by ID.
func (c *MemberController) Get(ctx context.Context, id int64, includeTombstoned bool) (models.Member, error) {
	if id <= 0 {
		return models.Member{}, invalidRequest("member_id must be positive")
	}

	member, err := c.store.Get(ctx, id, includeTombstoned)
	if errors.Is(err, store.ErrNotFound) {
		return models.Member{}, notFound("member not found")
	}
	if err != nil {
		return models.Member{}, err
	}

	return member, nil
}

// List returns household members using default visibility rules unless explicitly overridden.
func (c *MemberController) List(ctx context.Context, opts MemberListOptions) ([]models.Member, error) {
	return c.store.List(ctx, store.MemberListOptions{
		IncludeTombstoned: opts.IncludeTombstoned,
		List:              opts.List,
	})
}

// UpdateName validates and updates a household member name.
func (c *MemberController) UpdateName(ctx context.Context, id int64, req models.UpdateMemberRequest) (models.Member, error) {
	if id <= 0 {
		return models.Member{}, invalidRequest("member_id must be positive")
	}
	if err := validateMemberName(req.Name); err != nil {
		return models.Member{}, err
	}

	member, err := c.store.UpdateName(ctx, id, req.Name)
	if errors.Is(err, store.ErrConflict) {
		return models.Member{}, conflict("active member name already exists")
	}
	if errors.Is(err, store.ErrNotFound) {
		return models.Member{}, notFound("member not found")
	}
	if err != nil {
		return models.Member{}, err
	}

	return member, nil
}

// Delete tombstones a household member.
func (c *MemberController) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return invalidRequest("member_id must be positive")
	}

	if err := c.store.Tombstone(ctx, id); errors.Is(err, store.ErrNotFound) {
		return notFound("member not found")
	} else if err != nil {
		return err
	}

	return nil
}

func validateMemberName(name string) error {
	if strings.TrimSpace(name) != name || name == "" {
		return invalidRequest("name must be non-empty without leading or trailing whitespace")
	}

	return nil
}
