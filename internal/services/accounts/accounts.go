package accounts

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/values"
	"github.com/mishamsk/mina/internal/x/refcache"
)

// AccountType identifies how an account participates in accounting semantics.
type AccountType string

const (
	AccountTypeBalance AccountType = "balance"
	AccountTypeFlow    AccountType = "flow"
	AccountTypeSystem  AccountType = "system"
)

// ValidAccountType reports whether value is a supported account type.
func ValidAccountType(value AccountType) bool {
	switch value {
	case AccountTypeBalance, AccountTypeFlow, AccountTypeSystem:
		return true
	default:
		return false
	}
}

// Account is a hierarchical financial account or counterparty.
type Account struct {
	ID             int64
	FQN            string
	AccountType    AccountType
	IsHidden       bool
	IsFeatured     bool
	Currency       *string
	ExternalID     *string
	ExternalSystem *string
	ParentFQN      *string
	Name           string
	Level          int
	CreatedAt      time.Time
	UpdatedAt      time.Time
	TombstonedAt   *time.Time
}

// AccountBalance is one server-computed account balance row for a currency.
type AccountBalance struct {
	AccountID         int64
	Currency          string
	CurrentBalance    values.Decimal
	CurrentBalanceUSD values.Decimal
	PostedBalance     values.Decimal
	UnconvertedCount  int64
}

// CreateInput contains fields for creating an account.
type CreateInput struct {
	FQN            string
	AccountType    AccountType
	IsHidden       bool
	IsFeatured     bool
	Currency       *string
	ExternalID     *string
	ExternalSystem *string
}

// OptionalStringUpdate carries a nullable string field for partial updates.
type OptionalStringUpdate struct {
	Specified bool
	Value     *string
}

// UpdateInput contains mutable account fields.
type UpdateInput struct {
	IsHidden       *bool
	IsFeatured     *bool
	ExternalID     OptionalStringUpdate
	ExternalSystem OptionalStringUpdate
}

// ListOptions controls account list visibility.
type ListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
	AccountType       *AccountType
	IsFeatured        *bool
	List              services.ListOptions
}

// BalanceListOptions controls balance account aggregation filters.
type BalanceListOptions struct {
	IncludeHidden bool
	AccountIDs    []int64
}

// ReferenceOptions controls account reference validation.
type ReferenceOptions struct {
	// AllowHidden permits hidden active accounts as valid write references.
	AllowHidden bool
}

// Reference is the account data needed to validate write references and classify transactions.
type Reference struct {
	ID          int64
	AccountType AccountType
	IsHidden    bool
}

// ActiveUsage reports active resources that reference an account.
type ActiveUsage struct {
	JournalRecords             bool
	TransactionTemplateRecords bool
	CreditLimitHistory         bool
}

// HasActiveDependents reports whether any active resource references the account.
func (u ActiveUsage) HasActiveDependents() bool {
	return u.JournalRecords || u.TransactionTemplateRecords || u.CreditLimitHistory
}

// Repository persists account state.
type Repository interface {
	Create(context.Context, CreateInput) (Account, error)
	Get(context.Context, int64, bool) (Account, error)
	List(context.Context, ListOptions) (services.PaginatedList[Account], error)
	ListBalances(context.Context, BalanceListOptions) ([]AccountBalance, error)
	UpdateMutable(context.Context, int64, UpdateInput) (Account, error)
	ActiveUsage(context.Context, int64) (ActiveUsage, error)
	Tombstone(context.Context, int64) error
}

// ReferenceSerializer serializes dictionary deletes with writes that create dependent references.
type ReferenceSerializer interface {
	SerializeReferenceOperation(func() error) error
}

// Service owns account use cases and validation.
type Service struct {
	repo  Repository
	refs  ReferenceSerializer
	cache *refcache.Dictionary[int64, accountReferenceState]
}

// NewService creates an account service backed by repo.
func NewService(repo Repository, refs ReferenceSerializer) *Service {
	service := &Service{repo: repo, refs: refs}
	service.cache = refcache.NewDictionary(service.loadReferenceCache)
	return service
}

// Create validates and creates an account.
func (s *Service) Create(ctx context.Context, input CreateInput) (Account, error) {
	if err := validateFQN(input.FQN); err != nil {
		return Account{}, err
	}
	if !ValidAccountType(input.AccountType) {
		return Account{}, services.InvalidRequest("account_type must be one of balance, flow, or system")
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

	s.cacheActiveReference(account)

	return account, nil
}

// ValidateActiveReferences returns active account references keyed by ID.
//
// Hidden active accounts are rejected unless opts.AllowHidden is true.
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

// ValidateActiveReference returns one active account reference.
//
// Hidden active accounts are rejected unless opts.AllowHidden is true.
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
func (s *Service) List(ctx context.Context, opts ListOptions) (services.PaginatedList[Account], error) {
	if opts.AccountType != nil && !ValidAccountType(*opts.AccountType) {
		return services.PaginatedList[Account]{}, services.InvalidRequest("account_type must be one of balance, flow, or system")
	}

	return s.repo.List(ctx, opts)
}

// ListBalances returns server-computed balances for active balance accounts.
func (s *Service) ListBalances(ctx context.Context, opts BalanceListOptions) ([]AccountBalance, error) {
	accountIDs := deduplicateIDs(opts.AccountIDs)
	for _, id := range accountIDs {
		if id <= 0 {
			return nil, services.InvalidRequest("account_ids values must be positive")
		}
	}

	return s.repo.ListBalances(ctx, BalanceListOptions{
		IncludeHidden: opts.IncludeHidden,
		AccountIDs:    accountIDs,
	})
}

// UpdateMutable validates and updates account mutable fields.
func (s *Service) UpdateMutable(ctx context.Context, id int64, input UpdateInput) (Account, error) {
	if id <= 0 {
		return Account{}, services.InvalidRequest("account_id must be positive")
	}
	if !input.hasChanges() {
		return Account{}, services.InvalidRequest("at least one account field is required")
	}
	if input.ExternalID.Specified || input.ExternalSystem.Specified {
		current, err := s.repo.Get(ctx, id, false)
		if errors.Is(err, services.ErrNotFound) {
			return Account{}, services.NotFound("account not found")
		}
		if err != nil {
			return Account{}, err
		}
		externalID := current.ExternalID
		if input.ExternalID.Specified {
			externalID = input.ExternalID.Value
		}
		externalSystem := current.ExternalSystem
		if input.ExternalSystem.Specified {
			externalSystem = input.ExternalSystem.Value
		}
		if err := validateExternalIdentifiers(externalID, externalSystem); err != nil {
			return Account{}, err
		}
	}

	account, err := s.repo.UpdateMutable(ctx, id, input)
	if errors.Is(err, services.ErrNotFound) {
		return Account{}, services.NotFound("account not found")
	}
	if errors.Is(err, services.ErrConflict) {
		return Account{}, services.Conflict("account external identifiers changed; retry with both external_id and external_system")
	}
	if err != nil {
		return Account{}, err
	}

	s.cacheActiveReference(account)

	return account, nil
}

func (input UpdateInput) hasChanges() bool {
	return input.IsHidden != nil ||
		input.IsFeatured != nil ||
		input.ExternalID.Specified ||
		input.ExternalSystem.Specified
}

// ActiveUsage reports active resources that reference an account.
func (s *Service) ActiveUsage(ctx context.Context, id int64) (ActiveUsage, error) {
	if id <= 0 {
		return ActiveUsage{}, services.InvalidRequest("account_id must be positive")
	}

	return s.repo.ActiveUsage(ctx, id)
}

// Delete tombstones an account.
func (s *Service) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return services.InvalidRequest("account_id must be positive")
	}

	if err := s.refs.SerializeReferenceOperation(func() error {
		if _, err := s.repo.Get(ctx, id, false); errors.Is(err, services.ErrNotFound) {
			return services.NotFound("account not found")
		} else if err != nil {
			return err
		}
		usage, err := s.repo.ActiveUsage(ctx, id)
		if err != nil {
			return err
		}
		if usage.HasActiveDependents() {
			return services.Conflict("account is referenced by active resources")
		}
		if err := s.repo.Tombstone(ctx, id); errors.Is(err, services.ErrNotFound) {
			return services.NotFound("account not found")
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

type accountReferenceState struct {
	reference Reference
	active    bool
}

func (s *Service) loadReferenceCache(ctx context.Context) (map[int64]accountReferenceState, error) {
	accounts, err := s.repo.List(ctx, ListOptions{IncludeHidden: true, IncludeTombstoned: true})
	if err != nil {
		return nil, err
	}

	entries := make(map[int64]accountReferenceState, len(accounts.Items))
	for _, account := range accounts.Items {
		entries[account.ID] = accountReferenceStateFromAccount(account)
	}

	return entries, nil
}

func (s *Service) cacheActiveReference(account Account) {
	s.cache.Put(account.ID, accountReferenceStateFromAccount(account))
}

func accountReferenceStateFromAccount(account Account) accountReferenceState {
	return accountReferenceState{
		reference: Reference{
			ID:          account.ID,
			AccountType: account.AccountType,
			IsHidden:    account.IsHidden,
		},
		active: account.TombstonedAt == nil,
	}
}

func (s *Service) cacheInactiveReference(id int64) {
	s.cache.Modify(id, func(state accountReferenceState, ok bool) accountReferenceState {
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

func validateCurrency(currency *string) error {
	if currency == nil {
		return nil
	}
	if !values.ValidCurrencyCode(*currency) {
		return services.InvalidRequest("currency must be an ISO 4217 code or crypto code prefixed with C::")
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
