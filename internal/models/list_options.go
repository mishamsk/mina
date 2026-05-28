package models

// FilterKey names an allowlisted list filter field.
type FilterKey string

const (
	// FilterKeyAccountID filters by account identifier.
	FilterKeyAccountID FilterKey = "account_id"
	// FilterKeyAmountMax filters by maximum record amount.
	FilterKeyAmountMax FilterKey = "amount_max"
	// FilterKeyAmountMin filters by minimum record amount.
	FilterKeyAmountMin FilterKey = "amount_min"
	// FilterKeyAmountUSDMax filters by maximum USD record amount.
	FilterKeyAmountUSDMax FilterKey = "amount_usd_max"
	// FilterKeyAmountUSDMin filters by minimum USD record amount.
	FilterKeyAmountUSDMin FilterKey = "amount_usd_min"
	// FilterKeyCategoryID filters by category identifier.
	FilterKeyCategoryID FilterKey = "category_id"
	// FilterKeyEffectiveDate filters by effective date.
	FilterKeyEffectiveDate FilterKey = "effective_date"
	// FilterKeyFromCurrency filters by source currency.
	FilterKeyFromCurrency FilterKey = "from_currency"
	// FilterKeyInitiatedDateFrom filters by minimum transaction initiated date.
	FilterKeyInitiatedDateFrom FilterKey = "initiated_date_from"
	// FilterKeyInitiatedDateTo filters by maximum transaction initiated date.
	FilterKeyInitiatedDateTo FilterKey = "initiated_date_to"
	// FilterKeyMemberID filters by member identifier.
	FilterKeyMemberID FilterKey = "member_id"
	// FilterKeyMemoContains filters by memo substring.
	FilterKeyMemoContains FilterKey = "memo_contains"
	// FilterKeyPendingDateFrom filters by minimum pending date.
	FilterKeyPendingDateFrom FilterKey = "pending_date_from"
	// FilterKeyPendingDateTo filters by maximum pending date.
	FilterKeyPendingDateTo FilterKey = "pending_date_to"
	// FilterKeyPostedDateFrom filters by minimum posted date.
	FilterKeyPostedDateFrom FilterKey = "posted_date_from"
	// FilterKeyPostedDateTo filters by maximum posted date.
	FilterKeyPostedDateTo FilterKey = "posted_date_to"
	// FilterKeyPostingStatus filters by posting status.
	FilterKeyPostingStatus FilterKey = "posting_status"
	// FilterKeyReconciliationStatus filters by reconciliation status.
	FilterKeyReconciliationStatus FilterKey = "reconciliation_status"
	// FilterKeyTagID filters by tag identifier.
	FilterKeyTagID FilterKey = "tag_id"
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
