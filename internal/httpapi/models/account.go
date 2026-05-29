package models

// Account is a hierarchical financial account or counterparty.
type Account struct {
	ID             int64   `json:"account_id"`
	FQN            string  `json:"fqn"`
	Kind           string  `json:"kind"`
	IsHidden       bool    `json:"is_hidden"`
	Currency       *string `json:"currency,omitempty"`
	ExternalID     *string `json:"external_id,omitempty"`
	ExternalSystem *string `json:"external_system,omitempty"`
	ParentFQN      *string `json:"parent_fqn"`
	Name           string  `json:"name"`
	Level          int     `json:"level"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
	TombstonedAt   *string `json:"tombstoned_at,omitempty"`
}

// CreateAccountRequest is the request body for creating an account.
type CreateAccountRequest struct {
	FQN            string  `json:"fqn"`
	IsHidden       *bool   `json:"is_hidden,omitempty"`
	Currency       *string `json:"currency,omitempty"`
	ExternalID     *string `json:"external_id,omitempty"`
	ExternalSystem *string `json:"external_system,omitempty"`
}

// UpdateAccountRequest is the request body for updating account mutable fields.
type UpdateAccountRequest struct {
	IsHidden       *bool   `json:"is_hidden"`
	ExternalID     *string `json:"external_id,omitempty"`
	ExternalSystem *string `json:"external_system,omitempty"`
}

// AccountListResponse is the response body for account list endpoints.
type AccountListResponse struct {
	Accounts []Account `json:"accounts"`
}
