package routers

import (
	"net/http"
	"strconv"

	"mina.local/mina/internal/models"
)

const maxListLimit = 500

type listQueryContract struct {
	AllowHidden     bool
	AllowTombstoned bool
	FilterKeys      map[models.FilterKey]struct{}
	SortKeys        map[models.SortKey]struct{}
	DefaultSortKey  models.SortKey
}

type parsedListQuery struct {
	IncludeHidden     bool
	IncludeTombstoned bool
	Filters           map[models.FilterKey]string
	List              models.ListOptions
}

func parseListQuery(w http.ResponseWriter, r *http.Request, contract listQueryContract) (parsedListQuery, bool) {
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
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "unsupported list query parameter")
			return parsedListQuery{}, false
		}
		if len(values) != 1 || values[0] == "" {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" must have one non-empty value")
			return parsedListQuery{}, false
		}
	}

	parsed := parsedListQuery{
		Filters: map[models.FilterKey]string{},
		List: models.ListOptions{
			SortKey:       contract.DefaultSortKey,
			SortDirection: models.SortDirectionAsc,
		},
	}

	if contract.AllowHidden {
		includeHidden, ok := parseBoolQuery(w, r, "include_hidden")
		if !ok {
			return parsedListQuery{}, false
		}
		parsed.IncludeHidden = includeHidden
	}
	if contract.AllowTombstoned {
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return parsedListQuery{}, false
		}
		parsed.IncludeTombstoned = includeTombstoned
	}

	if values, ok := query["sort"]; ok {
		sortKey := models.SortKey(values[0])
		if _, ok := contract.SortKeys[sortKey]; !ok {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "unsupported sort key")
			return parsedListQuery{}, false
		}
		parsed.List.SortKey = sortKey
	}
	if values, ok := query["sort_dir"]; ok {
		switch models.SortDirection(values[0]) {
		case models.SortDirectionAsc, models.SortDirectionDesc:
			parsed.List.SortDirection = models.SortDirection(values[0])
		default:
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "sort_dir must be asc or desc")
			return parsedListQuery{}, false
		}
	}

	if values, ok := query["limit"]; ok {
		limit, valid := parseListInt(w, "limit", values[0], 1, maxListLimit)
		if !valid {
			return parsedListQuery{}, false
		}
		parsed.List.Limit = &limit
	}
	if values, ok := query["offset"]; ok {
		offset, valid := parseListInt(w, "offset", values[0], 0, 0)
		if !valid {
			return parsedListQuery{}, false
		}
		parsed.List.Offset = offset
	}

	for name := range contract.FilterKeys {
		if values, ok := query[string(name)]; ok {
			parsed.Filters[name] = values[0]
		}
	}

	return parsed, true
}

func parseListInt(w http.ResponseWriter, name string, raw string, min int, max int) (int, bool) {
	value, err := strconv.Atoi(raw)
	if err != nil || value < min {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" is out of range")
		return 0, false
	}
	if max > 0 && value > max {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" is out of range")
		return 0, false
	}

	return value, true
}
