package services

// SortKey names an allowlisted list sort field.
type SortKey string

const (
	// SortKeyCreatedAt sorts by creation timestamp.
	SortKeyCreatedAt SortKey = "created_at"
	// SortKeyCurrencyPair sorts by currency pair, then effective date.
	SortKeyCurrencyPair SortKey = "currency_pair"
	// SortKeyEffectiveDate sorts by effective date.
	SortKeyEffectiveDate SortKey = "effective_date"
	// SortKeyFQN sorts by fully-qualified name.
	SortKeyFQN SortKey = "fqn"
	// SortKeyFromCurrency sorts by source currency.
	SortKeyFromCurrency SortKey = "from_currency"
	// SortKeyInitiatedDate sorts by transaction initiated date.
	SortKeyInitiatedDate SortKey = "initiated_date"
	// SortKeyName sorts by display name.
	SortKeyName SortKey = "name"
	// SortKeyNextDueDate sorts by a recurring definition's computed next due date.
	SortKeyNextDueDate SortKey = "next_due_date"
	// SortKeyToCurrency sorts by target currency.
	SortKeyToCurrency SortKey = "to_currency"
	// SortKeyUpdatedAt sorts by update timestamp.
	SortKeyUpdatedAt SortKey = "updated_at"
)

// SortDirection names an allowlisted list sort direction.
type SortDirection string

const (
	// SortDirectionAsc sorts ascending.
	SortDirectionAsc SortDirection = "asc"
	// SortDirectionDesc sorts descending.
	SortDirectionDesc SortDirection = "desc"
)

// ListOptions carries shared sort and pagination options.
type ListOptions struct {
	SortKey           SortKey
	SortDirection     SortDirection
	Limit             *int
	Offset            int
	IncludeTotalCount bool
}

// PaginatedList carries one page of list items plus the total matching count when requested.
type PaginatedList[T any] struct {
	Items      []T
	TotalCount int64
}

// Page applies list pagination and optional total-count reporting to an already ordered result.
func Page[T any](items []T, opts ListOptions) PaginatedList[T] {
	total := int64(0)
	if opts.IncludeTotalCount {
		total = int64(len(items))
	}
	start := opts.Offset
	if start > len(items) {
		start = len(items)
	}
	end := len(items)
	if opts.Limit != nil && start+*opts.Limit < end {
		end = start + *opts.Limit
	}
	return PaginatedList[T]{Items: items[start:end], TotalCount: total}
}

// Unpaged preserves sorting while disabling pagination and count work.
func (opts ListOptions) Unpaged() ListOptions {
	opts.Limit = nil
	opts.Offset = 0
	opts.IncludeTotalCount = false
	return opts
}
