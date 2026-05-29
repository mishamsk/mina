package store

import (
	"mina.local/mina/internal/services"
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
	if opts.Limit != nil {
		query += " LIMIT ?"
		args = append(args, *opts.Limit)
		if opts.Offset > 0 {
			query += " OFFSET ?"
			args = append(args, opts.Offset)
		}
	} else if opts.Offset > 0 {
		query += " LIMIT -1 OFFSET ?"
		args = append(args, opts.Offset)
	}

	return query, args
}
