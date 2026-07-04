package creditlimits

import (
	"context"
	"errors"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/values"
)

// CreditLimitHistory is one historical credit limit entry for an account.
type CreditLimitHistory struct {
	ID            int64
	AccountID     int64
	CreditLimit   values.Decimal
	EffectiveDate values.CivilDate
	CreatedAt     time.Time
	TombstonedAt  *time.Time
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
	ListByAccount(context.Context, int64, ListOptions) (services.PaginatedList[CreditLimitHistory], error)
	CurrentByAccounts(context.Context, []int64, values.CivilDate) (map[int64]values.Decimal, error)
	Tombstone(context.Context, int64) error
}

// AccountReferenceValidator resolves active account references for credit-limit validation.
type AccountReferenceValidator interface {
	ValidateActiveReference(context.Context, int64, accounts.ReferenceOptions) (accounts.Reference, error)
}

// ReferenceSerializer serializes account deletes with writes that create dependent references.
type ReferenceSerializer interface {
	SerializeReferenceOperation(func() error) error
}

// Service owns credit limit history use cases and validation.
type Service struct {
	repo     Repository
	accounts AccountReferenceValidator
	refs     ReferenceSerializer
}

// NewService creates a credit limit history service backed by repo.
func NewService(repo Repository, accounts AccountReferenceValidator, refs ReferenceSerializer) *Service {
	return &Service{
		repo:     repo,
		accounts: accounts,
		refs:     refs,
	}
}

// Create validates and creates a credit limit history entry for an account.
func (s *Service) Create(ctx context.Context, accountID int64, input CreateInput) (CreditLimitHistory, error) {
	if accountID <= 0 {
		return CreditLimitHistory{}, services.InvalidRequest("account_id must be positive")
	}
	if input.CreditLimit.Sign() < 0 {
		return CreditLimitHistory{}, services.InvalidRequest("credit_limit must be a non-negative decimal")
	}

	var history CreditLimitHistory
	if err := s.refs.SerializeReferenceOperation(func() error {
		if _, err := s.accounts.ValidateActiveReference(ctx, accountID, accounts.ReferenceOptions{AllowHidden: true}); err != nil {
			if errors.Is(err, services.ErrInvalidReference) {
				return services.NotFound("account not found")
			}
			return err
		}
		created, err := s.repo.Create(ctx, accountID, input)
		if errors.Is(err, services.ErrNotFound) {
			return services.NotFound("account not found")
		}
		if errors.Is(err, services.ErrConflict) {
			return services.Conflict("active credit limit history already exists for account and effective date")
		}
		if err != nil {
			return err
		}
		history = created
		return nil
	}); err != nil {
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
func (s *Service) ListByAccount(ctx context.Context, accountID int64, opts ListOptions) (services.PaginatedList[CreditLimitHistory], error) {
	if accountID <= 0 {
		return services.PaginatedList[CreditLimitHistory]{}, services.InvalidRequest("account_id must be positive")
	}
	if _, err := s.accounts.ValidateActiveReference(ctx, accountID, accounts.ReferenceOptions{AllowHidden: true}); err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return services.PaginatedList[CreditLimitHistory]{}, services.NotFound("account not found")
		}
		return services.PaginatedList[CreditLimitHistory]{}, err
	}

	history, err := s.repo.ListByAccount(ctx, accountID, opts)
	if errors.Is(err, services.ErrNotFound) {
		return services.PaginatedList[CreditLimitHistory]{}, services.NotFound("account not found")
	}
	if err != nil {
		return services.PaginatedList[CreditLimitHistory]{}, err
	}

	return history, nil
}

// CurrentByAccounts returns current active credit limits keyed by account ID.
//
// Tombstoned rows are excluded. For each account, the row with the latest
// effective date on or before asOf wins; ties are resolved by the highest
// credit-limit history ID. Accounts with no applicable limit are absent from the
// returned map; absence does not mean a zero credit limit.
func (s *Service) CurrentByAccounts(ctx context.Context, accountIDs []int64, asOf values.CivilDate) (map[int64]values.Decimal, error) {
	uniqueIDs := deduplicateIDs(accountIDs)
	for _, id := range uniqueIDs {
		if id <= 0 {
			return nil, services.InvalidRequest("account_ids values must be positive")
		}
	}
	if len(uniqueIDs) == 0 {
		return map[int64]values.Decimal{}, nil
	}

	return s.repo.CurrentByAccounts(ctx, uniqueIDs, asOf)
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

func deduplicateIDs(ids []int64) []int64 {
	if len(ids) == 0 {
		return nil
	}

	seen := make(map[int64]struct{}, len(ids))
	result := make([]int64, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}

	return result
}
