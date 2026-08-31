package recurring

import (
	"context"
	"strconv"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/fuzzyrank"
	"github.com/mishamsk/mina/internal/x/set"
)

// SearchContext identifies a recurring-definition search's eligibility rules.
type SearchContext string

const SearchContextNavigation SearchContext = "navigation"

// SearchOptions contains typed recurring-definition discovery inputs.
type SearchOptions struct {
	Context    SearchContext
	Query      string
	ParentFQN  *string
	ExcludeIDs []int64
	Limit      int
}

// SearchItemKind distinguishes recurring-definition leaves from navigation groups.
type SearchItemKind string

const (
	SearchItemKindLeaf  SearchItemKind = "leaf"
	SearchItemKindGroup SearchItemKind = "group"
)

// SearchItem is one display-ready ranked recurring-definition candidate.
type SearchItem struct {
	Kind       SearchItemKind
	ID         *int64
	Title      string
	FQN        string
	ChildCount *int
}

// SearchResult is a bounded ranked recurring-definition candidate response.
type SearchResult struct {
	Items   []SearchItem
	HasMore bool
}

// Search returns caller-bounded ranked recurring-definition leaves and groups for one typed context.
func (s *Service) Search(ctx context.Context, opts SearchOptions) (SearchResult, error) {
	if err := validateSearchOptions(opts); err != nil {
		return SearchResult{}, err
	}
	leaves, err := s.repo.ListActiveFQNs(ctx)
	if err != nil {
		return SearchResult{}, err
	}

	excluded := set.From(opts.ExcludeIDs)
	candidates := make([]fuzzyrank.Candidate[SearchItem], 0, len(leaves)*2)
	for _, leaf := range leaves {
		if !services.SearchFQNInScope(leaf.FQN, opts.ParentFQN) || excluded.Contains(leaf.ID) {
			continue
		}
		id := leaf.ID
		item := SearchItem{Kind: SearchItemKindLeaf, ID: &id, Title: services.FQNLeaf(leaf.FQN), FQN: leaf.FQN}
		candidates = append(candidates, searchCandidate("leaf:"+strconv.FormatInt(id, 10), item))
	}
	for _, group := range deriveSearchGroups(leaves) {
		if !services.SearchFQNInScope(group.FQN, opts.ParentFQN) {
			continue
		}
		count := group.ChildCount
		item := SearchItem{Kind: SearchItemKindGroup, Title: services.FQNLeaf(group.FQN), FQN: group.FQN, ChildCount: &count}
		candidates = append(candidates, searchCandidate("group:"+group.FQN, item))
	}

	ordered := fuzzyrank.Rank(services.SearchRankQuery(opts.Query, opts.ParentFQN), candidates)
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
	if opts.Context != SearchContextNavigation {
		return services.InvalidRequest("invalid recurring definition search context")
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

type searchGroup struct {
	FQN        string
	ChildCount int
}

func deriveSearchGroups(leaves []ActiveFQN) []searchGroup {
	groups := map[string]int{}
	for _, leaf := range leaves {
		for index, value := range leaf.FQN {
			if value == ':' {
				groups[leaf.FQN[:index]]++
			}
		}
	}
	result := make([]searchGroup, 0, len(groups))
	for fqn, count := range groups {
		result = append(result, searchGroup{FQN: fqn, ChildCount: count})
	}
	return result
}

func searchCandidate(id string, item SearchItem) fuzzyrank.Candidate[SearchItem] {
	return fuzzyrank.Candidate[SearchItem]{ID: id, Title: item.Title, FQN: item.FQN, Terms: fuzzyrank.EntityTerms(item.Title, item.FQN), Value: item}
}
