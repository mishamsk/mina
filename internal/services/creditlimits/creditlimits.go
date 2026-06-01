package creditlimits

import (
	"context"
	"errors"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/values"
)

// CreditLimitHistory is one historical credit limit entry for an account.
type CreditLimitHistory struct {
	ID            int64
	AccountID     int64
	CreditLimit   values.Decimal
	EffectiveDate values.CivilDate
	CreatedAt     values.AuditTimestamp
	TombstonedAt  *values.AuditTimestamp
}

// CreateInput contains fields for creating a credit limit history entry.
type CreateInput struct {
	CreditLimit   values.Decimal
	EffectiveDate values.CivilDate
}

// ListOptions controls credit limit history list visibility.
type ListOptions struct {
	IncludeTombstoned bool
	List              services.ListOptions
}

// Repository persists credit limit history state.
type Repository interface {
	Create(context.Context, int64, CreateInput) (CreditLimitHistory, error)
	Get(context.Context, int64, bool) (CreditLimitHistory, error)
	ListByAccount(context.Context, int64, ListOptions) ([]CreditLimitHistory, error)
	Tombstone(context.Context, int64) error
}

// Service owns credit limit history use cases and validation.
type Service struct {
	repo Repository
}

// NewService creates a credit limit history service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Create validates and creates a credit limit history entry for an account.
func (s *Service) Create(ctx context.Context, accountID int64, input CreateInput) (CreditLimitHistory, error) {
	if accountID <= 0 {
		return CreditLimitHistory{}, services.InvalidRequest("account_id must be positive")
	}
	if input.CreditLimit.Sign() < 0 {
		return CreditLimitHistory{}, services.InvalidRequest("credit_limit must be a non-negative decimal")
	}

	history, err := s.repo.Create(ctx, accountID, input)
	if errors.Is(err, services.ErrNotFound) {
		return CreditLimitHistory{}, services.NotFound("account not found")
	}
	if errors.Is(err, services.ErrConflict) {
		return CreditLimitHistory{}, services.Conflict("active credit limit history already exists for account and effective date")
	}
	if err != nil {
		return CreditLimitHistory{}, err
	}

	return history, nil
}

// Get returns a credit limit history entry by ID.
func (s *Service) Get(ctx context.Context, id int64, includeTombstoned bool) (CreditLimitHistory, error) {
	if id <= 0 {
		return CreditLimitHistory{}, services.InvalidRequest("credit_limit_history_id must be positive")
	}

	history, err := s.repo.Get(ctx, id, includeTombstoned)
	if errors.Is(err, services.ErrNotFound) {
		return CreditLimitHistory{}, services.NotFound("credit limit history not found")
	}
	if err != nil {
		return CreditLimitHistory{}, err
	}

	return history, nil
}

// ListByAccount returns credit limit history for an account.
func (s *Service) ListByAccount(ctx context.Context, accountID int64, opts ListOptions) ([]CreditLimitHistory, error) {
	if accountID <= 0 {
		return nil, services.InvalidRequest("account_id must be positive")
	}

	history, err := s.repo.ListByAccount(ctx, accountID, opts)
	if errors.Is(err, services.ErrNotFound) {
		return nil, services.NotFound("account not found")
	}
	if err != nil {
		return nil, err
	}

	return history, nil
}

// Delete tombstones a credit limit history entry.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("credit_limit_history_id must be positive")
	}

	if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
		return services.NotFound("credit limit history not found")
	} else if err != nil {
		return err
	}

	return nil
}
