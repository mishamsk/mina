package httpapi

import (
	"mina.local/mina/internal/httpapi/models"
	"mina.local/mina/internal/services"
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

func serviceListOptions(opts models.ListOptions) services.ListOptions {
	return services.ListOptions{
		SortKey:       services.SortKey(opts.SortKey),
		SortDirection: services.SortDirection(opts.SortDirection),
		Limit:         opts.Limit,
		Offset:        opts.Offset,
	}
}
