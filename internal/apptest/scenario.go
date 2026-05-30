package apptest

import (
	"net/http"

	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

// Scenario creates common fixtures through the in-process API client.
type Scenario struct {
	client *Client
}

// TransactionRefs are common fixture ids for transaction scenarios.
type TransactionRefs struct {
	CheckingAccountID int64
	MerchantAccountID int64
	CategoryID        int64
	TagID             int64
	MemberID          int64
}

// Scenario returns reusable fixture builders for high-level workflow tests.
func (c *Client) Scenario() *Scenario {
	return &Scenario{client: c}
}

// Account creates an account fixture through the API client.
func (s *Scenario) Account(fqn string) models.Account {
	s.client.t.Helper()

	response := Decode[models.Account](s.client, http.MethodPost, "/accounts", models.CreateAccountRequest{Fqn: fqn})
	requireStatus(s.client, "create account", response.StatusCode, http.StatusCreated, response.RawBody)
	return response.Body
}

// AccountWithCurrency creates an account fixture with a currency through the API client.
func (s *Scenario) AccountWithCurrency(fqn string, currency string) models.Account {
	s.client.t.Helper()

	response := Decode[models.Account](s.client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		Fqn:      fqn,
		Currency: &currency,
	})
	requireStatus(s.client, "create account", response.StatusCode, http.StatusCreated, response.RawBody)
	return response.Body
}

// Category creates a category fixture through the API client.
func (s *Scenario) Category(fqn string) models.Category {
	s.client.t.Helper()

	response := Decode[models.Category](s.client, http.MethodPost, "/categories", models.CreateCategoryRequest{Fqn: fqn})
	requireStatus(s.client, "create category", response.StatusCode, http.StatusCreated, response.RawBody)
	return response.Body
}

// CategoryWithHidden creates a category fixture with explicit hidden state through the API client.
func (s *Scenario) CategoryWithHidden(fqn string, hidden bool) models.Category {
	s.client.t.Helper()

	response := Decode[models.Category](s.client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		Fqn:      fqn,
		IsHidden: &hidden,
	})
	requireStatus(s.client, "create category", response.StatusCode, http.StatusCreated, response.RawBody)
	return response.Body
}

// Tag creates a tag fixture through the API client.
func (s *Scenario) Tag(fqn string) models.Tag {
	s.client.t.Helper()

	response := Decode[models.Tag](s.client, http.MethodPost, "/tags", models.CreateTagRequest{Fqn: fqn})
	requireStatus(s.client, "create tag", response.StatusCode, http.StatusCreated, response.RawBody)
	return response.Body
}

// Member creates a member fixture through the API client.
func (s *Scenario) Member(name string) models.Member {
	s.client.t.Helper()

	response := Decode[models.Member](s.client, http.MethodPost, "/members", models.CreateMemberRequest{Name: name})
	requireStatus(s.client, "create member", response.StatusCode, http.StatusCreated, response.RawBody)
	return response.Body
}

// ExchangeRate creates an exchange-rate fixture through the API client.
func (s *Scenario) ExchangeRate(fromCurrency string, toCurrency string, effectiveDate string) models.ExchangeRate {
	s.client.t.Helper()

	response := Decode[models.ExchangeRate](s.client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  fromCurrency,
		ToCurrency:    toCurrency,
		Rate:          "1.10000000",
		EffectiveDate: effectiveDate,
	})
	requireStatus(s.client, "create exchange rate", response.StatusCode, http.StatusCreated, response.RawBody)
	return response.Body
}

// TransactionRefs creates the standard accounts, category, tag, and member fixtures for transaction scenarios.
func (s *Scenario) TransactionRefs() TransactionRefs {
	s.client.t.Helper()

	checking := s.AccountWithCurrency("checking:Chase:Primary", "USD")
	merchant := s.Account("expense:Merchant")
	category := s.Category("Food:Restaurants")
	tag := s.Tag("Trips:Local")
	member := s.Member("Avery")

	return TransactionRefs{
		CheckingAccountID: checking.AccountId,
		MerchantAccountID: merchant.AccountId,
		CategoryID:        category.CategoryId,
		TagID:             tag.TagId,
		MemberID:          member.MemberId,
	}
}

// BalancedTransaction creates a simple balanced manual transaction through the API client.
func (s *Scenario) BalancedTransaction(refs TransactionRefs) models.Transaction {
	s.client.t.Helper()

	tagIDs := []int64{refs.TagID}
	memberID := refs.MemberID
	memo := "Lunch"
	response := Decode[models.Transaction](s.client, http.MethodPost, "/transactions", models.CreateTransactionRequest{
		InitiatedDate: "2024-01-02",
		Records: []models.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountID,
				Amount:               "-12.34",
				AmountUsd:            "-12.34",
				CategoryId:           refs.CategoryID,
				Currency:             "USD",
				MemberId:             &memberID,
				Memo:                 &memo,
				PostingStatus:        models.Posted,
				ReconciliationStatus: models.Reconciled,
				Source:               models.Manual,
				TagIds:               &tagIDs,
			},
			{
				AccountId:            refs.MerchantAccountID,
				Amount:               "12.34",
				AmountUsd:            "12.34",
				CategoryId:           refs.CategoryID,
				Currency:             "USD",
				PostingStatus:        models.Posted,
				ReconciliationStatus: models.Reconciled,
				Source:               models.Manual,
			},
		},
	})
	requireStatus(s.client, "create balanced transaction", response.StatusCode, http.StatusCreated, response.RawBody)
	return response.Body
}

func requireStatus(client *Client, label string, got int, want int, body []byte) {
	client.t.Helper()

	if got != want {
		client.t.Fatalf("%s status = %d, want %d; body %s", label, got, want, body)
	}
}
