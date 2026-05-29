package httpapi

import (
	"mina.local/mina/internal/services"
)

const maxListLimit = 500

type filterKey string

const (
	filterKeyAccountID            filterKey = "account_id"
	filterKeyAmountMax            filterKey = "amount_max"
	filterKeyAmountMin            filterKey = "amount_min"
	filterKeyAmountUSDMax         filterKey = "amount_usd_max"
	filterKeyAmountUSDMin         filterKey = "amount_usd_min"
	filterKeyCategoryID           filterKey = "category_id"
	filterKeyEffectiveDate        filterKey = "effective_date"
	filterKeyFromCurrency         filterKey = "from_currency"
	filterKeyInitiatedDateFrom    filterKey = "initiated_date_from"
	filterKeyInitiatedDateTo      filterKey = "initiated_date_to"
	filterKeyMemberID             filterKey = "member_id"
	filterKeyMemoContains         filterKey = "memo_contains"
	filterKeyPendingDateFrom      filterKey = "pending_date_from"
	filterKeyPendingDateTo        filterKey = "pending_date_to"
	filterKeyPostedDateFrom       filterKey = "posted_date_from"
	filterKeyPostedDateTo         filterKey = "posted_date_to"
	filterKeyPostingStatus        filterKey = "posting_status"
	filterKeyReconciliationStatus filterKey = "reconciliation_status"
	filterKeyTagID                filterKey = "tag_id"
	filterKeyToCurrency           filterKey = "to_currency"
)

type sortKey string

const (
	sortKeyCreatedAt     sortKey = "created_at"
	sortKeyCurrencyPair  sortKey = "currency_pair"
	sortKeyEffectiveDate sortKey = "effective_date"
	sortKeyFQN           sortKey = "fqn"
	sortKeyFromCurrency  sortKey = "from_currency"
	sortKeyName          sortKey = "name"
	sortKeyToCurrency    sortKey = "to_currency"
	sortKeyUpdatedAt     sortKey = "updated_at"
)

type sortDirection string

const (
	sortDirectionAsc  sortDirection = "asc"
	sortDirectionDesc sortDirection = "desc"
)

type listQueryContract struct {
	AllowHidden     bool
	AllowTombstoned bool
	FilterKeys      map[filterKey]struct{}
	SortKeys        map[sortKey]struct{}
	DefaultSortKey  sortKey
}

type parsedListQuery struct {
	IncludeHidden     bool
	IncludeTombstoned bool
	Filters           map[filterKey]string
	List              parsedListOptions
}

type parsedListOptions struct {
	SortKey       sortKey
	SortDirection sortDirection
	Limit         *int
	Offset        int
}

func serviceListOptions(opts parsedListOptions) services.ListOptions {
	return services.ListOptions{
		SortKey:       services.SortKey(opts.SortKey),
		SortDirection: services.SortDirection(opts.SortDirection),
		Limit:         opts.Limit,
		Offset:        opts.Offset,
	}
}
