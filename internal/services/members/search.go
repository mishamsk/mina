package members

import (
	"context"
	"strconv"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/fuzzyrank"
	"github.com/mishamsk/mina/internal/x/set"
)

// SearchContext identifies a member search's domain eligibility rules.
type SearchContext string

const (
	SearchContextRecordAssignment  SearchContext = "record_assignment"
	SearchContextTransactionFilter SearchContext = "transaction_filter"
	SearchContextNavigation        SearchContext = "navigation"
)

// SearchOptions contains typed member discovery inputs.
type SearchOptions struct {
	Context       SearchContext
	Query         string
	IncludeHidden bool
	ExcludeIDs    []int64
	Limit         int
}

// SearchItem is one display-ready ranked member candidate.
type SearchItem struct {
	ID       int64
	Title    string
	IsHidden bool
}

// SearchResult is a bounded ranked member candidate response.
type SearchResult struct {
	Items   []SearchItem
	HasMore bool
}

// Search returns caller-bounded ranked member candidates for one typed context.
func (s *Service) Search(ctx context.Context, opts SearchOptions) (SearchResult, error) {
	if err := validateSearchOptions(opts); err != nil {
		return SearchResult{}, err
	}
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return SearchResult{}, err
	}
	excluded := set.From(opts.ExcludeIDs)
	candidates := make([]fuzzyrank.Candidate[SearchItem], 0, len(states))
	for id, state := range states {
		if !state.active || (!opts.IncludeHidden && state.reference.IsHidden) || excluded.Contains(id) {
			continue
		}
		item := SearchItem{ID: id, Title: state.reference.Name, IsHidden: state.reference.IsHidden}
		candidates = append(candidates, fuzzyrank.Candidate[SearchItem]{
			ID:    strconv.FormatInt(id, 10),
			Title: item.Title,
			Terms: fuzzyrank.EntityTerms(item.Title, ""),
			Value: item,
		})
	}
	ordered := fuzzyrank.Rank(opts.Query, candidates)
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
	case SearchContextRecordAssignment, SearchContextTransactionFilter, SearchContextNavigation:
	default:
		return services.InvalidRequest("invalid member search context")
	}
	for _, id := range opts.ExcludeIDs {
		if id <= 0 {
			return services.InvalidRequest("exclude_ids values must be positive")
		}
	}
	return nil
}
