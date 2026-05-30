package accounts

import (
	"context"
	"errors"
	"strings"

	"github.com/mishamsk/mina/internal/services"
)

// Account is a hierarchical financial account or counterparty.
type Account struct {
	ID             int64
	FQN            string
	Kind           string
	IsHidden       bool
	Currency       *string
	ExternalID     *string
	ExternalSystem *string
	ParentFQN      *string
	Name           string
	Level          int
	CreatedAt      string
	UpdatedAt      string
	TombstonedAt   *string
}

// CreateInput contains fields for creating an account.
type CreateInput struct {
	FQN            string
	IsHidden       bool
	Currency       *string
	ExternalID     *string
	ExternalSystem *string
}

// UpdateInput contains mutable account fields.
type UpdateInput struct {
	IsHidden       *bool
	ExternalID     *string
	ExternalSystem *string
}

// ListOptions controls account list visibility.
type ListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
	List              services.ListOptions
}

// Repository persists account state.
type Repository interface {
	Create(context.Context, CreateInput) (Account, error)
	Get(context.Context, int64, bool) (Account, error)
	List(context.Context, ListOptions) ([]Account, error)
	UpdateMutable(context.Context, int64, UpdateInput) (Account, error)
	Tombstone(context.Context, int64) error
}

// Service owns account use cases and validation.
type Service struct {
	repo Repository
}

// NewService creates an account service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Create validates and creates an account.
func (s *Service) Create(ctx context.Context, input CreateInput) (Account, error) {
	if err := validateFQN(input.FQN); err != nil {
		return Account{}, err
	}
	if err := validateCurrency(input.Currency); err != nil {
		return Account{}, err
	}
	if err := validateExternalIdentifiers(input.ExternalID, input.ExternalSystem); err != nil {
		return Account{}, err
	}

	account, err := s.repo.Create(ctx, input)
	if errors.Is(err, services.ErrConflict) {
		return Account{}, services.Conflict("active account fqn already exists")
	}
	if err != nil {
		return Account{}, err
	}

	return account, nil
}

// Get returns an account by ID.
func (s *Service) Get(ctx context.Context, id int64, includeTombstoned bool) (Account, error) {
	if id <= 0 {
		return Account{}, services.InvalidRequest("account_id must be positive")
	}

	account, err := s.repo.Get(ctx, id, includeTombstoned)
	if errors.Is(err, services.ErrNotFound) {
		return Account{}, services.NotFound("account not found")
	}
	if err != nil {
		return Account{}, err
	}

	return account, nil
}

// List returns accounts using default visibility rules unless explicitly overridden.
func (s *Service) List(ctx context.Context, opts ListOptions) ([]Account, error) {
	return s.repo.List(ctx, opts)
}

// UpdateMutable validates and updates account mutable fields.
func (s *Service) UpdateMutable(ctx context.Context, id int64, input UpdateInput) (Account, error) {
	if id <= 0 {
		return Account{}, services.InvalidRequest("account_id must be positive")
	}
	if input.IsHidden == nil {
		return Account{}, services.InvalidRequest("is_hidden is required")
	}
	if err := validateExternalIdentifiers(input.ExternalID, input.ExternalSystem); err != nil {
		return Account{}, err
	}

	account, err := s.repo.UpdateMutable(ctx, id, input)
	if errors.Is(err, services.ErrNotFound) {
		return Account{}, services.NotFound("account not found")
	}
	if err != nil {
		return Account{}, err
	}

	return account, nil
}

// Delete tombstones an account.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("account_id must be positive")
	}

	if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
		return services.NotFound("account not found")
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
	for _, segment := range strings.Split(fqn, ":") {
		if strings.TrimSpace(segment) != segment || segment == "" {
			return services.InvalidRequest("fqn segments must be non-empty without leading or trailing whitespace")
		}
	}

	return nil
}

func validateCurrency(currency *string) error {
	if currency == nil {
		return nil
	}
	if len(*currency) != 3 {
		return services.InvalidRequest("currency must be a three-letter uppercase code")
	}
	for i := range *currency {
		if (*currency)[i] < 'A' || (*currency)[i] > 'Z' {
			return services.InvalidRequest("currency must be a three-letter uppercase code")
		}
	}

	return nil
}

func validateExternalIdentifiers(externalID *string, externalSystem *string) error {
	if externalID == nil && externalSystem == nil {
		return nil
	}
	if externalID == nil || externalSystem == nil {
		return services.InvalidRequest("external_id and external_system must be provided together")
	}
	if strings.TrimSpace(*externalID) != *externalID || *externalID == "" {
		return services.InvalidRequest("external_id must be non-empty without leading or trailing whitespace")
	}
	if strings.TrimSpace(*externalSystem) != *externalSystem || *externalSystem == "" {
		return services.InvalidRequest("external_system must be non-empty without leading or trailing whitespace")
	}

	return nil
}
