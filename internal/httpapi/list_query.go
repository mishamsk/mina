package httpapi

import (
	"github.com/mishamsk/mina/internal/services"
)

func listOptionsFromParams[Sort ~string, SortDirection ~string](
	sort *Sort,
	sortDirection *SortDirection,
	limit *int,
	offset *int,
	defaultSortKey services.SortKey,
) services.ListOptions {
	return services.ListOptions{
		SortKey:       sortKeyParam(sort, defaultSortKey),
		SortDirection: sortDirectionParam(sortDirection),
		Limit:         limit,
		Offset:        offsetParam(offset),
	}
}

func sortKeyParam[T ~string](value *T, defaultValue services.SortKey) services.SortKey {
	if value == nil {
		return defaultValue
	}

	return services.SortKey(*value)
}

func sortDirectionParam[T ~string](value *T) services.SortDirection {
	if value == nil {
		return services.SortDirectionAsc
	}

	return services.SortDirection(*value)
}

func offsetParam(value *int) int {
	if value == nil {
		return 0
	}

	return *value
}
