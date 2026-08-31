package transactiontemplates

import (
	"context"
	"slices"
	"strconv"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/fuzzyrank"
	"github.com/mishamsk/mina/internal/x/set"
)

// SearchContext identifies a transaction-template search's eligibility rules.
type SearchContext string

const (
	SearchContextNavigation       SearchContext = "navigation"
	SearchContextTransactionEntry SearchContext = "transaction_entry"
)

// SearchOptions contains typed transaction-template discovery inputs.
type SearchOptions struct {
	Context             SearchContext
	Query               string
	ParentFQN           *string
	ExcludeIDs          []int64
	Limit               int
	CompatibleShorthand *TemplateShorthandType
}

// SearchItemKind distinguishes transaction-template leaves from navigation groups.
type SearchItemKind string

const (
	SearchItemKindLeaf  SearchItemKind = "leaf"
	SearchItemKindGroup SearchItemKind = "group"
)

// SearchItem is one display-ready ranked transaction-template candidate.
type SearchItem struct {
	Kind       SearchItemKind
	ID         *int64
	Title      string
	FQN        string
	ChildCount *int
}

// SearchResult is a bounded ranked transaction-template candidate response.
type SearchResult struct {
	Items   []SearchItem
	HasMore bool
}

// Search returns caller-bounded ranked transaction-template leaves and groups for one typed context.
func (s *Service) Search(ctx context.Context, opts SearchOptions) (SearchResult, error) {
	if err := validateSearchOptions(opts); err != nil {
		return SearchResult{}, err
	}
	list, err := s.repo.List(ctx, services.ListOptions{
		SortKey:       services.SortKeyFQN,
		SortDirection: services.SortDirectionAsc,
	})
	if err != nil {
		return SearchResult{}, err
	}

	leaves := make([]Template, 0, len(list.Items))
	for _, template := range list.Items {
		if opts.CompatibleShorthand != nil {
			withCompatibility, err := s.withCompatibleShorthands(ctx, template)
			if err != nil {
				return SearchResult{}, err
			}
			if !slices.Contains(withCompatibility.CompatibleShorthands, *opts.CompatibleShorthand) {
				continue
			}
		}
		leaves = append(leaves, template)
	}

	excluded := set.From(opts.ExcludeIDs)
	candidates := make([]fuzzyrank.Candidate[SearchItem], 0, len(leaves)*2)
	for _, leaf := range leaves {
		if !services.SearchFQNInScope(leaf.FQN, opts.ParentFQN) || excluded.Contains(leaf.ID) {
			continue
		}
		id := leaf.ID
		item := SearchItem{Kind: SearchItemKindLeaf, ID: &id, Title: leaf.Name, FQN: leaf.FQN}
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
	switch opts.Context {
	case SearchContextNavigation:
		if opts.CompatibleShorthand != nil {
			return services.InvalidRequest("compatible_shorthand applies only to transaction_entry context")
		}
	case SearchContextTransactionEntry:
		if opts.CompatibleShorthand != nil && !validTemplateShorthand(*opts.CompatibleShorthand) {
			return services.InvalidRequest("compatible_shorthand must be spend, income, refund, or transfer")
		}
	default:
		return services.InvalidRequest("invalid transaction template search context")
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

func validTemplateShorthand(value TemplateShorthandType) bool {
	switch value {
	case TemplateShorthandSpend, TemplateShorthandIncome, TemplateShorthandRefund, TemplateShorthandTransfer:
		return true
	default:
		return false
	}
}

type searchGroup struct {
	FQN        string
	ChildCount int
}

func deriveSearchGroups(leaves []Template) []searchGroup {
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
