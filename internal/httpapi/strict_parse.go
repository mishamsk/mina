package httpapi

import (
	"net/http"
	"strconv"

	"mina.local/mina/internal/services"
	"mina.local/mina/internal/services/transactions"
)

func parseListQueryForStrict(r *http.Request, contract listQueryContract) (parsedListQuery, error) {
	query := r.URL.Query()
	allowedNames := map[string]struct{}{
		"sort":     {},
		"sort_dir": {},
		"limit":    {},
		"offset":   {},
	}
	if contract.AllowHidden {
		allowedNames["include_hidden"] = struct{}{}
	}
	if contract.AllowTombstoned {
		allowedNames["include_tombstoned"] = struct{}{}
	}
	for name := range contract.FilterKeys {
		allowedNames[string(name)] = struct{}{}
	}

	for name, values := range query {
		if _, ok := allowedNames[name]; !ok {
			return parsedListQuery{}, services.InvalidRequest("unsupported list query parameter")
		}
		if len(values) != 1 || values[0] == "" {
			return parsedListQuery{}, services.InvalidRequest(name + " must have one non-empty value")
		}
	}

	parsed := parsedListQuery{
		Filters: map[filterKey]string{},
		List: parsedListOptions{
			SortKey:       contract.DefaultSortKey,
			SortDirection: sortDirectionAsc,
		},
	}

	if values, ok := query["include_hidden"]; ok {
		value, err := strconv.ParseBool(values[0])
		if err != nil {
			return parsedListQuery{}, services.InvalidRequest("include_hidden must be a boolean")
		}
		parsed.IncludeHidden = value
	}
	if values, ok := query["include_tombstoned"]; ok {
		value, err := strconv.ParseBool(values[0])
		if err != nil {
			return parsedListQuery{}, services.InvalidRequest("include_tombstoned must be a boolean")
		}
		parsed.IncludeTombstoned = value
	}

	if values, ok := query["sort"]; ok {
		sortKey := sortKey(values[0])
		if _, ok := contract.SortKeys[sortKey]; !ok {
			return parsedListQuery{}, services.InvalidRequest("unsupported sort key")
		}
		parsed.List.SortKey = sortKey
	}
	if values, ok := query["sort_dir"]; ok {
		switch sortDirection(values[0]) {
		case sortDirectionAsc, sortDirectionDesc:
			parsed.List.SortDirection = sortDirection(values[0])
		default:
			return parsedListQuery{}, services.InvalidRequest("sort_dir must be asc or desc")
		}
	}

	if values, ok := query["limit"]; ok {
		limit, err := parseStrictListInt("limit", values[0], 1, maxListLimit)
		if err != nil {
			return parsedListQuery{}, err
		}
		parsed.List.Limit = &limit
	}
	if values, ok := query["offset"]; ok {
		offset, err := parseStrictListInt("offset", values[0], 0, 0)
		if err != nil {
			return parsedListQuery{}, err
		}
		parsed.List.Offset = offset
	}

	for name := range contract.FilterKeys {
		if values, ok := query[string(name)]; ok {
			parsed.Filters[name] = values[0]
		}
	}

	return parsed, nil
}

func parseStrictListInt(name string, raw string, min int, max int) (int, error) {
	value, err := strconv.Atoi(raw)
	if err != nil || value < min {
		return 0, services.InvalidRequest(name + " is out of range")
	}
	if max > 0 && value > max {
		return 0, services.InvalidRequest(name + " is out of range")
	}

	return value, nil
}

func parseRecordSearchOptionsForStrict(r *http.Request, allowAccountID bool) (transactions.RecordSearchOptions, error) {
	query := r.URL.Query()
	allowed := map[filterKey]struct{}{
		filterKeyAmountMax:            {},
		filterKeyAmountMin:            {},
		filterKeyAmountUSDMax:         {},
		filterKeyAmountUSDMin:         {},
		filterKeyCategoryID:           {},
		filterKeyInitiatedDateFrom:    {},
		filterKeyInitiatedDateTo:      {},
		filterKeyMemberID:             {},
		filterKeyMemoContains:         {},
		filterKeyPendingDateFrom:      {},
		filterKeyPendingDateTo:        {},
		filterKeyPostedDateFrom:       {},
		filterKeyPostedDateTo:         {},
		filterKeyPostingStatus:        {},
		filterKeyReconciliationStatus: {},
		filterKeyTagID:                {},
	}
	if allowAccountID {
		allowed[filterKeyAccountID] = struct{}{}
	}
	for name, values := range query {
		if _, ok := allowed[filterKey(name)]; !ok {
			return transactions.RecordSearchOptions{}, services.InvalidRequest("unsupported record filter")
		}
		if len(values) != 1 || values[0] == "" {
			return transactions.RecordSearchOptions{}, services.InvalidRequest(name + " must have one non-empty value")
		}
	}

	opts := transactions.RecordSearchOptions{}
	if err := setStrictInt64Filter(query, filterKeyAccountID, &opts.AccountID); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if err := setStrictInt64Filter(query, filterKeyCategoryID, &opts.CategoryID); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if err := setStrictInt64Filter(query, filterKeyMemberID, &opts.MemberID); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if err := setStrictInt64Filter(query, filterKeyTagID, &opts.TagID); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	setStringFilter(query, filterKeyAmountMin, &opts.AmountMin)
	setStringFilter(query, filterKeyAmountMax, &opts.AmountMax)
	setStringFilter(query, filterKeyAmountUSDMin, &opts.AmountUSDMin)
	setStringFilter(query, filterKeyAmountUSDMax, &opts.AmountUSDMax)
	setStringFilter(query, filterKeyInitiatedDateFrom, &opts.InitiatedDateFrom)
	setStringFilter(query, filterKeyInitiatedDateTo, &opts.InitiatedDateTo)
	setStringFilter(query, filterKeyPendingDateFrom, &opts.PendingDateFrom)
	setStringFilter(query, filterKeyPendingDateTo, &opts.PendingDateTo)
	setStringFilter(query, filterKeyPostedDateFrom, &opts.PostedDateFrom)
	setStringFilter(query, filterKeyPostedDateTo, &opts.PostedDateTo)
	setStringFilter(query, filterKeyMemoContains, &opts.MemoContains)
	if values, ok := query[string(filterKeyPostingStatus)]; ok {
		value := transactions.PostingStatus(values[0])
		opts.PostingStatus = &value
	}
	if values, ok := query[string(filterKeyReconciliationStatus)]; ok {
		value := transactions.ReconciliationStatus(values[0])
		opts.ReconciliationStatus = &value
	}

	return opts, nil
}

func setStrictInt64Filter(query map[string][]string, name filterKey, dst **int64) error {
	key := string(name)
	values, ok := query[key]
	if !ok {
		return nil
	}
	parsed, err := strconv.ParseInt(values[0], 10, 64)
	if err != nil || parsed <= 0 {
		return services.InvalidRequest(key + " must be a positive integer")
	}
	*dst = &parsed

	return nil
}

func setStringFilter(query map[string][]string, name filterKey, dst **string) {
	if values, ok := query[string(name)]; ok {
		*dst = &values[0]
	}
}
