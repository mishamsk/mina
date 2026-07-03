package store

import (
	"context"
	"fmt"

	"github.com/mishamsk/mina/internal/services"
)

func appendServiceListOrderAndPage(query string, args []any, opts services.ListOptions, allowedSorts map[services.SortKey][]string, defaultSort services.SortKey, tieBreaker string) (string, []any) {
	sortColumns, ok := allowedSorts[opts.SortKey]
	if !ok {
		sortColumns = allowedSorts[defaultSort]
	}

	direction := serviceListDirection(opts)

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

func serviceListDirection(opts services.ListOptions) string {
	if opts.SortDirection == services.SortDirectionDesc {
		return "DESC"
	}
	return "ASC"
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

func countMatchingRows(ctx context.Context, queryer rowQuerier, query string, args []any, label string, includeTotalCount bool) (int64, error) {
	if !includeTotalCount {
		return 0, nil
	}

	var totalCount int64
	if err := queryer.QueryRowContext(ctx, query, args...).Scan(&totalCount); err != nil {
		return 0, fmt.Errorf("count %s: %w", label, err)
	}

	return totalCount, nil
}
