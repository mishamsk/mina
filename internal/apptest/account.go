package apptest

import (
	"context"
	"net/http"

	"github.com/mishamsk/mina/internal/httpclient"
	"github.com/oapi-codegen/nullable"
)

// SetAccountCurrency updates an account currency and returns the updated account.
func (c *Client) SetAccountCurrency(accountID int64, currency *string) httpclient.Account {
	c.t.Helper()

	currencyUpdate := nullable.NewNullNullable[string]()
	if currency != nil {
		currencyUpdate = nullable.NewNullableWithValue(*currency)
	}
	updated, err := c.REST().UpdateAccountWithResponse(context.Background(), accountID, httpclient.UpdateAccountRequest{
		Currency: currencyUpdate,
	})
	if err != nil {
		c.t.Fatalf("update account currency request: %v", err)
	}
	if updated.StatusCode() != http.StatusOK {
		c.t.Fatalf("update account currency status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}

	return *updated.JSON200
}
