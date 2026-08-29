package members

import (
	"context"
	"strconv"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/fuzzyrank"
)

const pickerResultLimit = 20

// PickerContext identifies a member picker's domain eligibility rules.
type PickerContext string

const (
	PickerContextRecordAssignment  PickerContext = "record_assignment"
	PickerContextTransactionFilter PickerContext = "transaction_filter"
)

// PickerOptions contains typed member picker inputs.
type PickerOptions struct {
	Context       PickerContext
	Query         string
	IncludeHidden bool
	SelectedIDs   []int64
}

// PickerItem is one display-ready member picker row.
type PickerItem struct {
	ID       int64
	Title    string
	IsHidden bool
}

// PickerResult is a bounded member picker response.
type PickerResult struct {
	Items         []PickerItem
	SelectedItems []PickerItem
}

// Pick returns bounded, ranked member rows for one typed context.
func (s *Service) Pick(ctx context.Context, opts PickerOptions) (PickerResult, error) {
	if err := validatePickerOptions(opts); err != nil {
		return PickerResult{}, err
	}
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return PickerResult{}, err
	}
	selected, err := selectedMemberIDs(states, opts.SelectedIDs)
	if err != nil {
		return PickerResult{}, err
	}

	selectedItems := make([]PickerItem, 0, len(opts.SelectedIDs))
	for _, id := range opts.SelectedIDs {
		leaf := states[id].reference
		selectedItems = append(selectedItems, PickerItem{ID: id, Title: leaf.Name, IsHidden: leaf.IsHidden})
	}

	candidates := make([]fuzzyrank.Candidate[PickerItem], 0, len(states))
	for id, state := range states {
		if !state.active || (!opts.IncludeHidden && state.reference.IsHidden && !selected[id]) {
			continue
		}
		if selected[id] {
			continue
		}
		item := PickerItem{ID: id, Title: state.reference.Name, IsHidden: state.reference.IsHidden}
		candidates = append(candidates, fuzzyrank.Candidate[PickerItem]{
			ID:    strconv.FormatInt(id, 10),
			Title: item.Title,
			Terms: []string{item.Title},
			Value: item,
		})
	}
	ordered := fuzzyrank.Rank(opts.Query, candidates)
	if len(ordered) > pickerResultLimit {
		ordered = ordered[:pickerResultLimit]
	}
	items := make([]PickerItem, len(ordered))
	for index := range ordered {
		items[index] = ordered[index].Value
	}
	return PickerResult{Items: items, SelectedItems: selectedItems}, nil
}

func validatePickerOptions(opts PickerOptions) error {
	switch opts.Context {
	case PickerContextRecordAssignment, PickerContextTransactionFilter:
	default:
		return services.InvalidRequest("invalid member picker context")
	}
	for _, id := range opts.SelectedIDs {
		if id <= 0 {
			return services.InvalidRequest("selected_ids values must be positive")
		}
	}
	return nil
}

func selectedMemberIDs(states map[int64]memberReferenceState, ids []int64) (map[int64]bool, error) {
	selected := make(map[int64]bool, len(ids))
	for _, id := range ids {
		state, ok := states[id]
		if !ok || !state.active {
			return nil, services.InvalidRequest("selected_ids reference missing or inactive member")
		}
		selected[id] = true
	}
	return selected, nil
}
