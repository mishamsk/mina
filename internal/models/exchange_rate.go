package models

// ExchangeRate is one historical currency conversion rate.
type ExchangeRate struct {
	ID            int64   `json:"exchange_rate_id"`
	FromCurrency  string  `json:"from_currency"`
	ToCurrency    string  `json:"to_currency"`
	Rate          string  `json:"rate"`
	EffectiveDate string  `json:"effective_date"`
	CreatedAt     string  `json:"created_at"`
	TombstonedAt  *string `json:"tombstoned_at,omitempty"`
}

// CreateExchangeRateRequest is the request body for creating an exchange rate.
type CreateExchangeRateRequest struct {
	FromCurrency  string `json:"from_currency"`
	ToCurrency    string `json:"to_currency"`
	Rate          string `json:"rate"`
	EffectiveDate string `json:"effective_date"`
}

// UpdateExchangeRateRequest is the request body for updating an exchange rate.
type UpdateExchangeRateRequest struct {
	Rate string `json:"rate"`
}

// ExchangeRateListResponse is the response body for exchange rate list endpoints.
type ExchangeRateListResponse struct {
	ExchangeRates []ExchangeRate `json:"exchange_rates"`
}
