package accounts

import (
	"context"
	"strconv"
	"strings"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/x/fuzzyrank"
)

const pickerResultLimit = 20

// PickerContext identifies an account picker's domain eligibility rules.
type PickerContext string

const (
	PickerContextRecordAssignment  PickerContext = "record_assignment"
	PickerContextShorthandBalance  PickerContext = "shorthand_balance"
	PickerContextShorthandFlow     PickerContext = "shorthand_flow"
	PickerContextExchange          PickerContext = "exchange"
	PickerContextTransactionFilter PickerContext = "transaction_filter"
	PickerContextBulkSource        PickerContext = "bulk_source"
	PickerContextBulkReplacement   PickerContext = "bulk_replacement"
)

// PickerOptions contains typed account picker inputs.
type PickerOptions struct {
	Context          PickerContext
	Query            string
	ParentFQN        *string
	IncludeHidden    bool
	SelectedIDs      []int64
	ExcludedCurrency *string
	TransactionIDs   []int64
	SourceAccountID  *int64
}

// PickerItemKind distinguishes selectable account leaves from navigation groups.
type PickerItemKind string

const (
	PickerItemKindLeaf  PickerItemKind = "leaf"
	PickerItemKindGroup PickerItemKind = "group"
)

// PickerItem is one display-ready account picker row.
type PickerItem struct {
	Kind        PickerItemKind
	ID          *int64
	Title       string
	FQN         string
	IsHidden    bool
	ChildCount  *int
	AccountType *AccountType
	Currency    *string
}

// PickerResult is a bounded account picker response.
type PickerResult struct {
	Items         []PickerItem
	SelectedItems []PickerItem
	CanCreate     bool
	EligibleCount int64
}

// BulkPickerFacts contains transaction-owned facts used by account picker contexts.
type BulkPickerFacts struct {
	CommonSourceIDs    []int64
	AffectedCurrencies []string
}

// PickerTransactionFacts loads transaction-owned bulk-account facts without taking over account eligibility.
type PickerTransactionFacts interface {
	BulkAccountPickerFacts(context.Context, []int64, *int64) (BulkPickerFacts, error)
}

// SetPickerTransactionFacts connects bulk account picker contexts to transaction-owned facts.
func (s *Service) SetPickerTransactionFacts(facts PickerTransactionFacts) {
	s.pickerTransactionFacts = facts
}

// Pick returns bounded, ranked account leaf and group rows for one typed context.
func (s *Service) Pick(ctx context.Context, opts PickerOptions) (PickerResult, error) {
	if err := validatePickerOptions(opts); err != nil {
		return PickerResult{}, err
	}

	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return PickerResult{}, err
	}
	selected, err := selectedAccountIDs(states, opts.SelectedIDs)
	if err != nil {
		return PickerResult{}, err
	}

	var bulkFacts BulkPickerFacts
	if opts.Context == PickerContextBulkSource || opts.Context == PickerContextBulkReplacement {
		if s.pickerTransactionFacts == nil {
			return PickerResult{}, services.InvalidRequest("bulk account picker context is unavailable")
		}
		bulkFacts, err = s.pickerTransactionFacts.BulkAccountPickerFacts(ctx, opts.TransactionIDs, opts.SourceAccountID)
		if err != nil {
			return PickerResult{}, err
		}
	}
	commonSources := int64Set(bulkFacts.CommonSourceIDs)
	var source *Reference
	if opts.Context == PickerContextBulkReplacement {
		resolved, err := pickerSourceReference(states, *opts.SourceAccountID)
		if err != nil {
			return PickerResult{}, err
		}
		source = &resolved
	}
	selectedItems := make([]PickerItem, 0, len(opts.SelectedIDs))
	for _, id := range opts.SelectedIDs {
		leaf := states[id].reference
		if !accountEligibleForPicker(leaf, opts, commonSources, source, bulkFacts.AffectedCurrencies) {
			continue
		}
		accountType := leaf.AccountType
		selectedItems = append(selectedItems, PickerItem{
			Kind: PickerItemKindLeaf, ID: &id, Title: services.EffectiveDisplayLabel(leaf.FQN, leaf.DisplayLabelOverride), FQN: leaf.FQN,
			IsHidden: leaf.IsHidden, AccountType: &accountType, Currency: leaf.Currency,
		})
	}

	leaves := make([]Reference, 0, len(states))
	var eligibleCount int64
	for id, state := range states {
		exactFQNQuery := opts.Query == state.reference.FQN
		if !state.active {
			continue
		}
		if !accountEligibleForPicker(state.reference, opts, commonSources, source, bulkFacts.AffectedCurrencies) {
			continue
		}
		if opts.IncludeHidden || !state.reference.IsHidden || selected[id] {
			eligibleCount++
		}
		if !opts.IncludeHidden && state.reference.IsHidden && !selected[id] && !exactFQNQuery {
			continue
		}
		leaves = append(leaves, state.reference)
	}

	candidates := make([]fuzzyrank.Candidate[PickerItem], 0, len(leaves)*2)
	for _, leaf := range leaves {
		if pickerFQNInScope(leaf.FQN, opts.ParentFQN) && !selected[leaf.ID] {
			id := leaf.ID
			accountType := leaf.AccountType
			title := services.EffectiveDisplayLabel(leaf.FQN, leaf.DisplayLabelOverride)
			item := PickerItem{
				Kind:        PickerItemKindLeaf,
				ID:          &id,
				Title:       title,
				FQN:         leaf.FQN,
				IsHidden:    leaf.IsHidden,
				AccountType: &accountType,
				Currency:    leaf.Currency,
			}
			candidates = append(candidates, pickerCandidate("leaf:"+strconv.FormatInt(id, 10), title, leaf.FQN, item))
		}
	}
	for _, group := range derivePickerGroups(leaves) {
		if !pickerFQNInScope(group.FQN, opts.ParentFQN) {
			continue
		}
		count := group.ChildCount
		item := PickerItem{
			Kind:       PickerItemKindGroup,
			Title:      pickerFQNLeaf(group.FQN),
			FQN:        group.FQN,
			IsHidden:   group.IsHidden,
			ChildCount: &count,
		}
		candidates = append(candidates, pickerCandidate("group:"+group.FQN, item.Title, group.FQN, item))
	}

	ordered := fuzzyrank.Rank(pickerRankQuery(opts.Query, opts.ParentFQN), candidates)
	ordered = fuzzyrank.Limit(opts.Query, ordered, pickerResultLimit)
	items := make([]PickerItem, len(ordered))
	for index := range ordered {
		items[index] = ordered[index].Value
	}

	return PickerResult{
		Items:         items,
		SelectedItems: selectedItems,
		CanCreate:     opts.Context == PickerContextShorthandFlow && pickerAccountCanCreate(opts.Query, states),
		EligibleCount: eligibleCount,
	}, nil
}

func validatePickerOptions(opts PickerOptions) error {
	switch opts.Context {
	case PickerContextRecordAssignment, PickerContextShorthandBalance, PickerContextShorthandFlow, PickerContextTransactionFilter:
		if len(opts.TransactionIDs) > 0 || opts.SourceAccountID != nil || opts.ExcludedCurrency != nil {
			return services.InvalidRequest("account picker parameters do not apply to this context")
		}
	case PickerContextExchange:
		if len(opts.TransactionIDs) > 0 || opts.SourceAccountID != nil {
			return services.InvalidRequest("bulk account picker parameters do not apply to exchange context")
		}
	case PickerContextBulkSource:
		if len(opts.TransactionIDs) == 0 {
			return services.InvalidRequest("transaction_ids is required for bulk_source context")
		}
		if opts.SourceAccountID != nil || opts.ExcludedCurrency != nil {
			return services.InvalidRequest("source_account_id and excluded_currency do not apply to bulk_source context")
		}
	case PickerContextBulkReplacement:
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
		return services.InvalidRequest("invalid account picker context")
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

func selectedAccountIDs(states map[int64]accountReferenceState, ids []int64) (map[int64]bool, error) {
	selected := make(map[int64]bool, len(ids))
	for _, id := range ids {
		state, ok := states[id]
		if !ok || !state.active {
			return nil, services.InvalidRequest("selected_ids reference missing or inactive account")
		}
		selected[id] = true
	}
	return selected, nil
}

func accountEligibleForPicker(account Reference, opts PickerOptions, commonSources map[int64]bool, source *Reference, affectedCurrencies []string) bool {
	switch opts.Context {
	case PickerContextRecordAssignment, PickerContextTransactionFilter:
		return true
	case PickerContextShorthandBalance, PickerContextExchange:
		if account.AccountType != AccountTypeOwned && account.AccountType != AccountTypeParty {
			return false
		}
		return opts.ExcludedCurrency == nil || account.Currency == nil || *account.Currency != *opts.ExcludedCurrency || containsInt64(opts.SelectedIDs, account.ID)
	case PickerContextShorthandFlow:
		return account.AccountType == AccountTypeFlow
	case PickerContextBulkSource:
		return account.AccountType != AccountTypeSystem && commonSources[account.ID]
	case PickerContextBulkReplacement:
		if source == nil || account.ID == source.ID || account.AccountType == AccountTypeSystem {
			return false
		}
		return pickerAccountTypesCompatible(source.AccountType, account.AccountType) && pickerReplacementCurrencyCompatible(account, affectedCurrencies)
	default:
		return false
	}
}

func pickerReplacementCurrencyCompatible(account Reference, affected []string) bool {
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

func pickerAccountCanCreate(query string, states map[int64]accountReferenceState) bool {
	if err := services.ValidateFQN(query); err != nil || services.FQNAtOrUnder(query, "system") {
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
	result := make([]pickerGroup, 0, len(groups))
	for fqn, group := range groups {
		result = append(result, pickerGroup{FQN: fqn, IsHidden: group.count == group.hiddenCount, ChildCount: group.count})
	}
	return result
}

func pickerCandidate(id string, title string, fqn string, value PickerItem) fuzzyrank.Candidate[PickerItem] {
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

func int64Set(values []int64) map[int64]bool {
	set := make(map[int64]bool, len(values))
	for _, value := range values {
		set[value] = true
	}
	return set
}

func containsInt64(values []int64, target int64) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func pickerSourceReference(states map[int64]accountReferenceState, sourceID int64) (Reference, error) {
	state, ok := states[sourceID]
	if !ok || !state.active {
		return Reference{}, services.InvalidRequest("source account missing or inactive resource")
	}
	if state.reference.AccountType == AccountTypeSystem {
		return Reference{}, services.InvalidRequest("source account must be non-system")
	}
	return state.reference, nil
}

func pickerAccountTypesCompatible(source AccountType, replacement AccountType) bool {
	if source == AccountTypeFlow {
		return replacement == AccountTypeFlow
	}
	return (source == AccountTypeOwned || source == AccountTypeParty) &&
		(replacement == AccountTypeOwned || replacement == AccountTypeParty)
}
