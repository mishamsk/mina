package store

import (
	"github.com/mishamsk/mina/internal/services"
)

func appendServiceListOrderAndPage(query string, args []any, opts services.ListOptions, allowedSorts map[services.SortKey][]string, defaultSort services.SortKey, tieBreaker string) (string, []any) {
	sortColumns, ok := allowedSorts[opts.SortKey]
	if !ok {
		sortColumns = allowedSorts[defaultSort]
	}

	direction := "ASC"
	if opts.SortDirection == services.SortDirectionDesc {
		direction = "DESC"
	}

	query += " ORDER BY "
	for index, column := range sortColumns {
		if index > 0 {
			query += ", "
		}
		query += column + " " + direction
	}
	query += ", " + tieBreaker + " ASC"
	query, args = appendLimitOffset(query, args, opts.Limit, opts.Offset)

	return query, args
}

func appendLimitOffset(query string, args []any, limit *int, offset int) (string, []any) {
	if limit != nil {
		query += " LIMIT ?"
		args = append(args, *limit)
		if offset > 0 {
			query += " OFFSET ?"
			args = append(args, offset)
		}
	} else if offset > 0 {
		query += " OFFSET ?"
		args = append(args, offset)
	}

	return query, args
}
