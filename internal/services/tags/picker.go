package tags

import (
	"context"
	"strconv"
	"strings"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/fuzzyrank"
)

const pickerResultLimit = 20

// PickerContext identifies a tag picker's domain eligibility rules.
type PickerContext string

const (
	PickerContextRecordAssignment  PickerContext = "record_assignment"
	PickerContextTransactionFilter PickerContext = "transaction_filter"
)

// PickerOptions contains typed tag picker inputs.
type PickerOptions struct {
	Context       PickerContext
	Query         string
	ParentFQN     *string
	IncludeHidden bool
	SelectedIDs   []int64
}

// PickerItemKind distinguishes selectable tag leaves from navigation groups.
type PickerItemKind string

const (
	PickerItemKindLeaf  PickerItemKind = "leaf"
	PickerItemKindGroup PickerItemKind = "group"
)

// PickerItem is one display-ready tag picker row.
type PickerItem struct {
	Kind       PickerItemKind
	ID         *int64
	Title      string
	FQN        string
	IsHidden   bool
	ChildCount *int
}

// PickerResult is a bounded tag picker response.
type PickerResult struct {
	Items         []PickerItem
	SelectedItems []PickerItem
	CanCreate     bool
}

// Pick returns bounded, ranked tag leaf and group rows for one typed context.
func (s *Service) Pick(ctx context.Context, opts PickerOptions) (PickerResult, error) {
	if err := validatePickerOptions(opts); err != nil {
		return PickerResult{}, err
	}
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return PickerResult{}, err
	}
	selected, err := selectedTagIDs(states, opts.SelectedIDs)
	if err != nil {
		return PickerResult{}, err
	}

	selectedItems := make([]PickerItem, 0, len(opts.SelectedIDs))
	for _, id := range opts.SelectedIDs {
		leaf := states[id].reference
		selectedItems = append(selectedItems, PickerItem{
			Kind: PickerItemKindLeaf, ID: &id, Title: services.EffectiveDisplayLabel(leaf.FQN, leaf.DisplayLabelOverride), FQN: leaf.FQN, IsHidden: leaf.IsHidden,
		})
	}

	leaves := make([]Reference, 0, len(states))
	for id, state := range states {
		exactFQNQuery := opts.Query == state.reference.FQN
		if !state.active || (!opts.IncludeHidden && state.reference.IsHidden && !selected[id] && !exactFQNQuery) {
			continue
		}
		leaves = append(leaves, state.reference)
	}

	candidates := make([]fuzzyrank.Candidate[PickerItem], 0, len(leaves)*2)
	for _, leaf := range leaves {
		if !pickerFQNInScope(leaf.FQN, opts.ParentFQN) {
			continue
		}
		if selected[leaf.ID] {
			continue
		}
		id := leaf.ID
		title := services.EffectiveDisplayLabel(leaf.FQN, leaf.DisplayLabelOverride)
		item := PickerItem{Kind: PickerItemKindLeaf, ID: &id, Title: title, FQN: leaf.FQN, IsHidden: leaf.IsHidden}
		candidates = append(candidates, pickerCandidate("leaf:"+strconv.FormatInt(id, 10), title, leaf.FQN, item))
	}
	for _, group := range derivePickerGroups(leaves) {
		if !pickerFQNInScope(group.FQN, opts.ParentFQN) {
			continue
		}
		count := group.ChildCount
		item := PickerItem{Kind: PickerItemKindGroup, Title: pickerFQNLeaf(group.FQN), FQN: group.FQN, IsHidden: group.IsHidden, ChildCount: &count}
		candidates = append(candidates, pickerCandidate("group:"+group.FQN, item.Title, group.FQN, item))
	}

	ordered := fuzzyrank.Rank(pickerRankQuery(opts.Query, opts.ParentFQN), candidates)
	ordered = fuzzyrank.Limit(opts.Query, ordered, pickerResultLimit)
	items := make([]PickerItem, len(ordered))
	for index := range ordered {
		items[index] = ordered[index].Value
	}
	return PickerResult{
		Items: items, SelectedItems: selectedItems,
		CanCreate: opts.Context == PickerContextRecordAssignment && pickerTagCanCreate(opts.Query, states),
	}, nil
}

func validatePickerOptions(opts PickerOptions) error {
	switch opts.Context {
	case PickerContextRecordAssignment, PickerContextTransactionFilter:
	default:
		return services.InvalidRequest("invalid tag picker context")
	}
	if opts.ParentFQN != nil && *opts.ParentFQN != "" {
		if err := services.ValidateFQN(*opts.ParentFQN); err != nil {
			return err
		}
	}
	for _, id := range opts.SelectedIDs {
		if id <= 0 {
			return services.InvalidRequest("selected_ids values must be positive")
		}
	}
	return nil
}

func selectedTagIDs(states map[int64]tagReferenceState, ids []int64) (map[int64]bool, error) {
	selected := make(map[int64]bool, len(ids))
	for _, id := range ids {
		state, ok := states[id]
		if !ok || !state.active {
			return nil, services.InvalidRequest("selected_ids reference missing or inactive tag")
		}
		selected[id] = true
	}
	return selected, nil
}

func pickerTagCanCreate(query string, states map[int64]tagReferenceState) bool {
	if err := services.ValidateFQN(query); err != nil {
		return false
	}
	for _, state := range states {
		if state.active && services.FQNPathConflict(query, state.reference.FQN) {
			return false
		}
	}
	return true
}

type pickerGroup struct {
	FQN        string
	IsHidden   bool
	ChildCount int
}

func derivePickerGroups(leaves []Reference) []pickerGroup {
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
	result := make([]pickerGroup, 0, len(groups))
	for fqn, group := range groups {
		result = append(result, pickerGroup{FQN: fqn, IsHidden: group.count == group.hiddenCount, ChildCount: group.count})
	}
	return result
}

func pickerCandidate(id, title, fqn string, value PickerItem) fuzzyrank.Candidate[PickerItem] {
	terms := []string{title, fqn}
	terms = append(terms, strings.Split(fqn, ":")...)
	return fuzzyrank.Candidate[PickerItem]{ID: id, Title: title, FQN: fqn, Terms: terms, Value: value}
}

func pickerFQNInScope(fqn string, parent *string) bool {
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

func pickerRankQuery(query string, parent *string) string {
	if parent == nil || *parent == "" {
		return query
	}
	return strings.TrimPrefix(query, *parent+":")
}

func pickerFQNLeaf(fqn string) string {
	if index := strings.LastIndex(fqn, ":"); index >= 0 {
		return fqn[index+1:]
	}
	return fqn
}
