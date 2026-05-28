package models

// FilterKey names an allowlisted list filter field.
type FilterKey string

const (
	// FilterKeyEffectiveDate filters by effective date.
	FilterKeyEffectiveDate FilterKey = "effective_date"
	// FilterKeyFromCurrency filters by source currency.
	FilterKeyFromCurrency FilterKey = "from_currency"
	// FilterKeyToCurrency filters by target currency.
	FilterKeyToCurrency FilterKey = "to_currency"
)

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
	// SortKeyName sorts by display name.
	SortKeyName SortKey = "name"
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
	SortKey       SortKey
	SortDirection SortDirection
	Limit         *int
	Offset        int
}
