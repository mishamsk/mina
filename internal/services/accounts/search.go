package accounts

import (
	"context"
	"strconv"
	"strings"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/fuzzyrank"
	"github.com/mishamsk/mina/internal/x/set"
)

// SearchContext identifies an account search's domain eligibility rules.
type SearchContext string

const (
	SearchContextRecordAssignment  SearchContext = "record_assignment"
	SearchContextShorthandBalance  SearchContext = "shorthand_balance"
	SearchContextShorthandFlow     SearchContext = "shorthand_flow"
	SearchContextExchange          SearchContext = "exchange"
	SearchContextTransactionFilter SearchContext = "transaction_filter"
	SearchContextBulkSource        SearchContext = "bulk_source"
	SearchContextBulkReplacement   SearchContext = "bulk_replacement"
	SearchContextNavigation        SearchContext = "navigation"
)

// SearchOptions contains typed account discovery inputs.
type SearchOptions struct {
	Context          SearchContext
	Query            string
	ParentFQN        *string
	IncludeHidden    bool
	ExcludeIDs       []int64
	Limit            int
	ExcludedCurrency *string
	TransactionIDs   []int64
	SourceAccountID  *int64
}

// SearchItemKind distinguishes account leaves from navigation groups.
type SearchItemKind string

const (
	SearchItemKindLeaf  SearchItemKind = "leaf"
	SearchItemKindGroup SearchItemKind = "group"
)

// SearchItem is one display-ready ranked account candidate.
type SearchItem struct {
	Kind        SearchItemKind
	ID          *int64
	Title       string
	FQN         string
	IsHidden    bool
	ChildCount  *int
	AccountType *AccountType
	Currency    *string
}

// SearchResult is a bounded ranked account candidate response.
type SearchResult struct {
	Items   []SearchItem
	HasMore bool
}

// BulkSearchFacts contains transaction-owned facts used by account search contexts.
type BulkSearchFacts struct {
	CommonSourceIDs    []int64
	AffectedCurrencies []string
}

// SearchTransactionFacts loads transaction-owned bulk-account facts without taking over account eligibility.
type SearchTransactionFacts interface {
	BulkAccountSearchFacts(context.Context, []int64, *int64) (BulkSearchFacts, error)
}

// SetSearchTransactionFacts connects bulk account search contexts to transaction-owned facts.
func (s *Service) SetSearchTransactionFacts(facts SearchTransactionFacts) {
	s.searchTransactionFacts = facts
}

// Search returns caller-bounded ranked account leaves and groups for one typed context.
func (s *Service) Search(ctx context.Context, opts SearchOptions) (SearchResult, error) {
	if err := validateSearchOptions(opts); err != nil {
		return SearchResult{}, err
	}
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return SearchResult{}, err
	}
	excluded := set.From(opts.ExcludeIDs)
	var bulkFacts BulkSearchFacts
	if opts.Context == SearchContextBulkSource || opts.Context == SearchContextBulkReplacement {
		if s.searchTransactionFacts == nil {
			return SearchResult{}, services.InvalidRequest("bulk account search context is unavailable")
		}
		bulkFacts, err = s.searchTransactionFacts.BulkAccountSearchFacts(ctx, opts.TransactionIDs, opts.SourceAccountID)
		if err != nil {
			return SearchResult{}, err
		}
	}
	commonSources := set.From(bulkFacts.CommonSourceIDs)
	var source *Reference
	if opts.Context == SearchContextBulkReplacement {
		resolved, err := searchSourceReference(states, *opts.SourceAccountID)
		if err != nil {
			return SearchResult{}, err
		}
		source = &resolved
	}

	leaves := make([]Reference, 0, len(states))
	for _, state := range states {
		exactFQNQuery := opts.Query == state.reference.FQN
		if !state.active || !accountEligibleForSearch(state.reference, opts, commonSources, source, bulkFacts.AffectedCurrencies) {
			continue
		}
		if !opts.IncludeHidden && state.reference.IsHidden && !exactFQNQuery {
			continue
		}
		leaves = append(leaves, state.reference)
	}

	candidates := make([]fuzzyrank.Candidate[SearchItem], 0, len(leaves)*2)
	for _, leaf := range leaves {
		if !searchFQNInScope(leaf.FQN, opts.ParentFQN) || excluded.Contains(leaf.ID) {
			continue
		}
		id := leaf.ID
		accountType := leaf.AccountType
		title := services.EffectiveDisplayLabel(leaf.FQN, leaf.DisplayLabelOverride)
		item := SearchItem{Kind: SearchItemKindLeaf, ID: &id, Title: title, FQN: leaf.FQN, IsHidden: leaf.IsHidden, AccountType: &accountType, Currency: leaf.Currency}
		candidates = append(candidates, searchCandidate("leaf:"+strconv.FormatInt(id, 10), title, leaf.FQN, item))
	}
	for _, group := range deriveSearchGroups(leaves) {
		if !searchFQNInScope(group.FQN, opts.ParentFQN) {
			continue
		}
		count := group.ChildCount
		item := SearchItem{Kind: SearchItemKindGroup, Title: searchFQNLeaf(group.FQN), FQN: group.FQN, IsHidden: group.IsHidden, ChildCount: &count}
		candidates = append(candidates, searchCandidate("group:"+group.FQN, item.Title, group.FQN, item))
	}

	ordered := fuzzyrank.Rank(searchRankQuery(opts.Query, opts.ParentFQN), candidates)
	hasMore := len(ordered) > opts.Limit
	ordered = fuzzyrank.Limit(opts.Query, ordered, opts.Limit)
	items := make([]SearchItem, len(ordered))
	for index := range ordered {
		items[index] = ordered[index].Value
	}
	return SearchResult{Items: items, HasMore: hasMore}, nil
}

func validateSearchOptions(opts SearchOptions) error {
	if opts.Limit < 1 || opts.Limit > 500 {
		return services.InvalidRequest("limit must be between 1 and 500")
	}
	switch opts.Context {
	case SearchContextRecordAssignment, SearchContextShorthandBalance, SearchContextShorthandFlow, SearchContextTransactionFilter, SearchContextNavigation:
		if len(opts.TransactionIDs) > 0 || opts.SourceAccountID != nil || opts.ExcludedCurrency != nil {
			return services.InvalidRequest("account search parameters do not apply to this context")
		}
	case SearchContextExchange:
		if len(opts.TransactionIDs) > 0 || opts.SourceAccountID != nil {
			return services.InvalidRequest("bulk account search parameters do not apply to exchange context")
		}
	case SearchContextBulkSource:
		if len(opts.TransactionIDs) == 0 {
			return services.InvalidRequest("transaction_ids is required for bulk_source context")
		}
		if opts.SourceAccountID != nil || opts.ExcludedCurrency != nil {
			return services.InvalidRequest("source_account_id and excluded_currency do not apply to bulk_source context")
		}
	case SearchContextBulkReplacement:
		if len(opts.TransactionIDs) == 0 {
			return services.InvalidRequest("transaction_ids is required for bulk_replacement context")
		}
		if opts.SourceAccountID == nil || *opts.SourceAccountID <= 0 {
			return services.InvalidRequest("source_account_id is required for bulk_replacement context")
		}
		if opts.ExcludedCurrency != nil {
			return services.InvalidRequest("excluded_currency does not apply to bulk_replacement context")
		}
	default:
		return services.InvalidRequest("invalid account search context")
	}
	if opts.ParentFQN != nil && *opts.ParentFQN != "" {
		if err := services.ValidateFQN(*opts.ParentFQN); err != nil {
			return err
		}
	}
	for _, id := range opts.ExcludeIDs {
		if id <= 0 {
			return services.InvalidRequest("exclude_ids values must be positive")
		}
	}
	return nil
}

func accountEligibleForSearch(account Reference, opts SearchOptions, commonSources set.Set[int64], source *Reference, affectedCurrencies []string) bool {
	switch opts.Context {
	case SearchContextRecordAssignment, SearchContextTransactionFilter, SearchContextNavigation:
		return true
	case SearchContextShorthandBalance, SearchContextExchange:
		if account.AccountType != AccountTypeOwned && account.AccountType != AccountTypeParty {
			return false
		}
		return opts.ExcludedCurrency == nil || account.Currency == nil || *account.Currency != *opts.ExcludedCurrency
	case SearchContextShorthandFlow:
		return account.AccountType == AccountTypeFlow
	case SearchContextBulkSource:
		return account.AccountType != AccountTypeSystem && commonSources.Contains(account.ID)
	case SearchContextBulkReplacement:
		if source == nil || account.ID == source.ID || account.AccountType == AccountTypeSystem {
			return false
		}
		return searchAccountTypesCompatible(source.AccountType, account.AccountType) && searchReplacementCurrencyCompatible(account, affectedCurrencies)
	default:
		return false
	}
}

func searchReplacementCurrencyCompatible(account Reference, affected []string) bool {
	if account.Currency == nil {
		return true
	}
	for _, currency := range affected {
		if currency != *account.Currency {
			return false
		}
	}
	return true
}

type searchGroup struct {
	FQN        string
	IsHidden   bool
	ChildCount int
}

func deriveSearchGroups(leaves []Reference) []searchGroup {
	type aggregate struct {
		count       int
		hiddenCount int
	}
	groups := map[string]aggregate{}
	for _, leaf := range leaves {
		for index, value := range leaf.FQN {
			if value != ':' {
				continue
			}
			fqn := leaf.FQN[:index]
			group := groups[fqn]
			group.count++
			if leaf.IsHidden {
				group.hiddenCount++
			}
			groups[fqn] = group
		}
	}
	result := make([]searchGroup, 0, len(groups))
	for fqn, group := range groups {
		result = append(result, searchGroup{FQN: fqn, IsHidden: group.count == group.hiddenCount, ChildCount: group.count})
	}
	return result
}

func searchCandidate(id string, title string, fqn string, value SearchItem) fuzzyrank.Candidate[SearchItem] {
	return fuzzyrank.Candidate[SearchItem]{ID: id, Title: title, FQN: fqn, Terms: fuzzyrank.EntityTerms(title, fqn), Value: value}
}

func searchFQNInScope(fqn string, parent *string) bool {
	if parent == nil {
		return true
	}
	index := strings.LastIndex(fqn, ":")
	actual := ""
	if index >= 0 {
		actual = fqn[:index]
	}
	return actual == *parent
}

func searchRankQuery(query string, parent *string) string {
	if parent == nil || *parent == "" {
		return query
	}
	return strings.TrimPrefix(query, *parent+":")
}

func searchFQNLeaf(fqn string) string {
	if index := strings.LastIndex(fqn, ":"); index >= 0 {
		return fqn[index+1:]
	}
	return fqn
}

func searchSourceReference(states map[int64]accountReferenceState, sourceID int64) (Reference, error) {
	state, ok := states[sourceID]
	if !ok || !state.active {
		return Reference{}, services.InvalidRequest("source account missing or inactive resource")
	}
	if state.reference.AccountType == AccountTypeSystem {
		return Reference{}, services.InvalidRequest("source account must be non-system")
	}
	return state.reference, nil
}

func searchAccountTypesCompatible(source AccountType, replacement AccountType) bool {
	if source == AccountTypeFlow {
		return replacement == AccountTypeFlow
	}
	return (source == AccountTypeOwned || source == AccountTypeParty) &&
		(replacement == AccountTypeOwned || replacement == AccountTypeParty)
}
