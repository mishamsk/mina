package httpapi

import (
	"net/http"
	"strconv"

	"mina.local/mina/internal/httpapi/models"
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
		Filters: map[models.FilterKey]string{},
		List: models.ListOptions{
			SortKey:       contract.DefaultSortKey,
			SortDirection: models.SortDirectionAsc,
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
		sortKey := models.SortKey(values[0])
		if _, ok := contract.SortKeys[sortKey]; !ok {
			return parsedListQuery{}, services.InvalidRequest("unsupported sort key")
		}
		parsed.List.SortKey = sortKey
	}
	if values, ok := query["sort_dir"]; ok {
		switch models.SortDirection(values[0]) {
		case models.SortDirectionAsc, models.SortDirectionDesc:
			parsed.List.SortDirection = models.SortDirection(values[0])
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
	allowed := map[models.FilterKey]struct{}{
		models.FilterKeyAmountMax:            {},
		models.FilterKeyAmountMin:            {},
		models.FilterKeyAmountUSDMax:         {},
		models.FilterKeyAmountUSDMin:         {},
		models.FilterKeyCategoryID:           {},
		models.FilterKeyInitiatedDateFrom:    {},
		models.FilterKeyInitiatedDateTo:      {},
		models.FilterKeyMemberID:             {},
		models.FilterKeyMemoContains:         {},
		models.FilterKeyPendingDateFrom:      {},
		models.FilterKeyPendingDateTo:        {},
		models.FilterKeyPostedDateFrom:       {},
		models.FilterKeyPostedDateTo:         {},
		models.FilterKeyPostingStatus:        {},
		models.FilterKeyReconciliationStatus: {},
		models.FilterKeyTagID:                {},
	}
	if allowAccountID {
		allowed[models.FilterKeyAccountID] = struct{}{}
	}
	for name, values := range query {
		if _, ok := allowed[models.FilterKey(name)]; !ok {
			return transactions.RecordSearchOptions{}, services.InvalidRequest("unsupported record filter")
		}
		if len(values) != 1 || values[0] == "" {
			return transactions.RecordSearchOptions{}, services.InvalidRequest(name + " must have one non-empty value")
		}
	}

	opts := transactions.RecordSearchOptions{}
	if err := setStrictInt64Filter(query, models.FilterKeyAccountID, &opts.AccountID); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if err := setStrictInt64Filter(query, models.FilterKeyCategoryID, &opts.CategoryID); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if err := setStrictInt64Filter(query, models.FilterKeyMemberID, &opts.MemberID); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if err := setStrictInt64Filter(query, models.FilterKeyTagID, &opts.TagID); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	setStringFilter(query, models.FilterKeyAmountMin, &opts.AmountMin)
	setStringFilter(query, models.FilterKeyAmountMax, &opts.AmountMax)
	setStringFilter(query, models.FilterKeyAmountUSDMin, &opts.AmountUSDMin)
	setStringFilter(query, models.FilterKeyAmountUSDMax, &opts.AmountUSDMax)
	setStringFilter(query, models.FilterKeyInitiatedDateFrom, &opts.InitiatedDateFrom)
	setStringFilter(query, models.FilterKeyInitiatedDateTo, &opts.InitiatedDateTo)
	setStringFilter(query, models.FilterKeyPendingDateFrom, &opts.PendingDateFrom)
	setStringFilter(query, models.FilterKeyPendingDateTo, &opts.PendingDateTo)
	setStringFilter(query, models.FilterKeyPostedDateFrom, &opts.PostedDateFrom)
	setStringFilter(query, models.FilterKeyPostedDateTo, &opts.PostedDateTo)
	setStringFilter(query, models.FilterKeyMemoContains, &opts.MemoContains)
	if values, ok := query[string(models.FilterKeyPostingStatus)]; ok {
		value := transactions.PostingStatus(values[0])
		opts.PostingStatus = &value
	}
	if values, ok := query[string(models.FilterKeyReconciliationStatus)]; ok {
		value := transactions.ReconciliationStatus(values[0])
		opts.ReconciliationStatus = &value
	}

	return opts, nil
}

func setStrictInt64Filter(query map[string][]string, name models.FilterKey, dst **int64) error {
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

func setStringFilter(query map[string][]string, name models.FilterKey, dst **string) {
	if values, ok := query[string(name)]; ok {
		*dst = &values[0]
	}
}
