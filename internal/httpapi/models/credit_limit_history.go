package models

// CreditLimitHistory is one historical credit limit entry for an account.
type CreditLimitHistory struct {
	ID            int64   `json:"credit_limit_history_id"`
	AccountID     int64   `json:"account_id"`
	CreditLimit   string  `json:"credit_limit"`
	EffectiveDate string  `json:"effective_date"`
	CreatedAt     string  `json:"created_at"`
	TombstonedAt  *string `json:"tombstoned_at,omitempty"`
}

// CreateCreditLimitHistoryRequest is the request body for creating a credit limit history entry.
type CreateCreditLimitHistoryRequest struct {
	CreditLimit   string `json:"credit_limit"`
	EffectiveDate string `json:"effective_date"`
}

// CreditLimitHistoryListResponse is the response body for account credit limit history list endpoints.
type CreditLimitHistoryListResponse struct {
	CreditLimitHistory []CreditLimitHistory `json:"credit_limit_history"`
}
