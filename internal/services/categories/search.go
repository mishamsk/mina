package categories

import (
	"context"
	"strconv"
	"strings"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/fuzzyrank"
	"github.com/mishamsk/mina/internal/x/set"
)

// SearchContext identifies a category search's domain eligibility rules.
type SearchContext string

const (
	SearchContextRecordAssignment  SearchContext = "record_assignment"
	SearchContextShorthandExpense  SearchContext = "shorthand_expense"
	SearchContextShorthandIncome   SearchContext = "shorthand_income"
	SearchContextTransactionFilter SearchContext = "transaction_filter"
	SearchContextNavigation        SearchContext = "navigation"
)

// SearchOptions contains typed category discovery inputs.
type SearchOptions struct {
	Context       SearchContext
	Query         string
	ParentFQN     *string
	IncludeHidden bool
	ExcludeIDs    []int64
	Limit         int
}

// SearchItemKind distinguishes category leaves from navigation groups.
type SearchItemKind string

const (
	SearchItemKindLeaf  SearchItemKind = "leaf"
	SearchItemKindGroup SearchItemKind = "group"
)

// SearchItem is one display-ready ranked category candidate.
type SearchItem struct {
	Kind           SearchItemKind
	ID             *int64
	Title          string
	FQN            string
	IsHidden       bool
	ChildCount     *int
	EconomicIntent *CategoryEconomicIntent
}

// SearchResult is a bounded ranked category candidate response.
type SearchResult struct {
	Items   []SearchItem
	HasMore bool
}

// Search returns caller-bounded ranked category leaves and groups for one typed context.
func (s *Service) Search(ctx context.Context, opts SearchOptions) (SearchResult, error) {
	if err := validateSearchOptions(opts); err != nil {
		return SearchResult{}, err
	}
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return SearchResult{}, err
	}
	excluded := set.From(opts.ExcludeIDs)
	leaves := make([]Reference, 0, len(states))
	for _, state := range states {
		exactFQNQuery := opts.Query == state.reference.FQN
		if !state.active || (!opts.IncludeHidden && state.reference.IsHidden && !exactFQNQuery) || !categoryEligibleForSearch(state.reference, opts.Context) {
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
		intent := leaf.EconomicIntent
		title := services.EffectiveDisplayLabel(leaf.FQN, leaf.DisplayLabelOverride)
		item := SearchItem{Kind: SearchItemKindLeaf, ID: &id, Title: title, FQN: leaf.FQN, IsHidden: leaf.IsHidden, EconomicIntent: &intent}
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
	case SearchContextRecordAssignment, SearchContextShorthandExpense, SearchContextShorthandIncome, SearchContextTransactionFilter, SearchContextNavigation:
	default:
		return services.InvalidRequest("invalid category search context")
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

func categoryEligibleForSearch(category Reference, context SearchContext) bool {
	switch context {
	case SearchContextRecordAssignment, SearchContextTransactionFilter, SearchContextNavigation:
		return true
	case SearchContextShorthandExpense:
		return category.EconomicIntent == CategoryEconomicIntentExpense
	case SearchContextShorthandIncome:
		return category.EconomicIntent == CategoryEconomicIntentIncome
	default:
		return false
	}
}

type searchGroup struct {
	FQN        string
	IsHidden   bool
	ChildCount int
}

func deriveSearchGroups(leaves []Reference) []searchGroup {
	type aggregate struct{ count, hiddenCount int }
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

func searchCandidate(id, title, fqn string, value SearchItem) fuzzyrank.Candidate[SearchItem] {
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
