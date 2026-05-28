package controllers

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/store"
)

// AccountListOptions controls account list visibility.
type AccountListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
}

// AccountController owns account use cases and validation.
type AccountController struct {
	store *store.AccountStore
}

// NewAccountController creates an AccountController backed by db.
func NewAccountController(db *sql.DB) *AccountController {
	return &AccountController{
		store: store.NewAccountStore(db),
	}
}

// Create validates and creates an account.
func (c *AccountController) Create(ctx context.Context, req models.CreateAccountRequest) (models.Account, error) {
	if err := validateAccountFQN(req.FQN); err != nil {
		return models.Account{}, err
	}
	if err := validateCurrency(req.Currency); err != nil {
		return models.Account{}, err
	}
	if err := validateExternalIdentifiers(req.ExternalID, req.ExternalSystem); err != nil {
		return models.Account{}, err
	}

	account, err := c.store.Create(ctx, req)
	if errors.Is(err, store.ErrConflict) {
		return models.Account{}, conflict("active account fqn already exists")
	}
	if err != nil {
		return models.Account{}, err
	}

	return account, nil
}

// Get returns an account by ID.
func (c *AccountController) Get(ctx context.Context, id int64, includeTombstoned bool) (models.Account, error) {
	if id <= 0 {
		return models.Account{}, invalidRequest("account_id must be positive")
	}

	account, err := c.store.Get(ctx, id, includeTombstoned)
	if errors.Is(err, store.ErrNotFound) {
		return models.Account{}, notFound("account not found")
	}
	if err != nil {
		return models.Account{}, err
	}

	return account, nil
}

// List returns accounts using default visibility rules unless explicitly overridden.
func (c *AccountController) List(ctx context.Context, opts AccountListOptions) ([]models.Account, error) {
	return c.store.List(ctx, store.AccountListOptions{
		IncludeHidden:     opts.IncludeHidden,
		IncludeTombstoned: opts.IncludeTombstoned,
	})
}

// UpdateMutable validates and updates account mutable fields.
func (c *AccountController) UpdateMutable(ctx context.Context, id int64, req models.UpdateAccountRequest) (models.Account, error) {
	if id <= 0 {
		return models.Account{}, invalidRequest("account_id must be positive")
	}
	if req.IsHidden == nil {
		return models.Account{}, invalidRequest("is_hidden is required")
	}
	if err := validateExternalIdentifiers(req.ExternalID, req.ExternalSystem); err != nil {
		return models.Account{}, err
	}

	account, err := c.store.UpdateMutable(ctx, id, req)
	if errors.Is(err, store.ErrNotFound) {
		return models.Account{}, notFound("account not found")
	}
	if err != nil {
		return models.Account{}, err
	}

	return account, nil
}

// Delete tombstones an account.
func (c *AccountController) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return invalidRequest("account_id must be positive")
	}

	if err := c.store.Tombstone(ctx, id); errors.Is(err, store.ErrNotFound) {
		return notFound("account not found")
	} else if err != nil {
		return err
	}

	return nil
}

func validateAccountFQN(fqn string) error {
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

func validateCurrency(currency *string) error {
	if currency == nil {
		return nil
	}
	if len(*currency) != 3 {
		return invalidRequest("currency must be a three-letter uppercase code")
	}
	for i := range *currency {
		if (*currency)[i] < 'A' || (*currency)[i] > 'Z' {
			return invalidRequest("currency must be a three-letter uppercase code")
		}
	}

	return nil
}

func validateExternalIdentifiers(externalID *string, externalSystem *string) error {
	if externalID == nil && externalSystem == nil {
		return nil
	}
	if externalID == nil || externalSystem == nil {
		return invalidRequest("external_id and external_system must be provided together")
	}
	if strings.TrimSpace(*externalID) != *externalID || *externalID == "" {
		return invalidRequest("external_id must be non-empty without leading or trailing whitespace")
	}
	if strings.TrimSpace(*externalSystem) != *externalSystem || *externalSystem == "" {
		return invalidRequest("external_system must be non-empty without leading or trailing whitespace")
	}

	return nil
}
