package apptest

import (
	"context"
	"net/http"
	"time"

	models "github.com/mishamsk/mina/internal/httpclient"
	openapi_types "github.com/oapi-codegen/runtime/types"
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

// Date returns a generated OpenAPI date value for YYYY-MM-DD test input.
func Date(value string) openapi_types.Date {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		panic(err)
	}

	return openapi_types.Date{Time: parsed}
}

// DatePtr returns a pointer to a generated OpenAPI date value for YYYY-MM-DD test input.
func DatePtr(value string) *openapi_types.Date {
	date := Date(value)

	return &date
}

// Account creates an account fixture through the API client.
func (s *Scenario) Account(fqn string) models.Account {
	s.client.t.Helper()

	response, err := s.client.REST().CreateAccountWithResponse(context.Background(), models.CreateAccountRequest{Fqn: fqn})
	requireNoClientError(s.client, "create account", err)
	requireStatus(s.client, "create account", response.StatusCode(), http.StatusCreated, response.Body)
	return *response.JSON201
}

// AccountWithCurrency creates an account fixture with a currency through the API client.
func (s *Scenario) AccountWithCurrency(fqn string, currency string) models.Account {
	s.client.t.Helper()

	response, err := s.client.REST().CreateAccountWithResponse(context.Background(), models.CreateAccountRequest{
		Fqn:      fqn,
		Currency: &currency,
	})
	requireNoClientError(s.client, "create account", err)
	requireStatus(s.client, "create account", response.StatusCode(), http.StatusCreated, response.Body)
	return *response.JSON201
}

// Category creates a category fixture through the API client.
func (s *Scenario) Category(fqn string) models.Category {
	s.client.t.Helper()

	response, err := s.client.REST().CreateCategoryWithResponse(context.Background(), models.CreateCategoryRequest{Fqn: fqn})
	requireNoClientError(s.client, "create category", err)
	requireStatus(s.client, "create category", response.StatusCode(), http.StatusCreated, response.Body)
	return *response.JSON201
}

// CategoryWithHidden creates a category fixture with explicit hidden state through the API client.
func (s *Scenario) CategoryWithHidden(fqn string, hidden bool) models.Category {
	s.client.t.Helper()

	response, err := s.client.REST().CreateCategoryWithResponse(context.Background(), models.CreateCategoryRequest{
		Fqn:      fqn,
		IsHidden: &hidden,
	})
	requireNoClientError(s.client, "create category", err)
	requireStatus(s.client, "create category", response.StatusCode(), http.StatusCreated, response.Body)
	return *response.JSON201
}

// Tag creates a tag fixture through the API client.
func (s *Scenario) Tag(fqn string) models.Tag {
	s.client.t.Helper()

	response, err := s.client.REST().CreateTagWithResponse(context.Background(), models.CreateTagRequest{Fqn: fqn})
	requireNoClientError(s.client, "create tag", err)
	requireStatus(s.client, "create tag", response.StatusCode(), http.StatusCreated, response.Body)
	return *response.JSON201
}

// Member creates a member fixture through the API client.
func (s *Scenario) Member(name string) models.Member {
	s.client.t.Helper()

	response, err := s.client.REST().CreateMemberWithResponse(context.Background(), models.CreateMemberRequest{Name: name})
	requireNoClientError(s.client, "create member", err)
	requireStatus(s.client, "create member", response.StatusCode(), http.StatusCreated, response.Body)
	return *response.JSON201
}

// ExchangeRate creates an exchange-rate fixture through the API client.
func (s *Scenario) ExchangeRate(fromCurrency string, toCurrency string, effectiveDate string) models.ExchangeRate {
	s.client.t.Helper()

	response, err := s.client.REST().CreateExchangeRateWithResponse(context.Background(), models.CreateExchangeRateRequest{
		FromCurrency:  fromCurrency,
		ToCurrency:    toCurrency,
		Rate:          "1.10000000",
		EffectiveDate: Date(effectiveDate),
	})
	requireNoClientError(s.client, "create exchange rate", err)
	requireStatus(s.client, "create exchange rate", response.StatusCode(), http.StatusCreated, response.Body)
	return *response.JSON201
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
	response, err := s.client.REST().CreateTransactionWithResponse(context.Background(), models.CreateTransactionRequest{
		InitiatedDate: Date("2024-01-02"),
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
	requireNoClientError(s.client, "create balanced transaction", err)
	requireStatus(s.client, "create balanced transaction", response.StatusCode(), http.StatusCreated, response.Body)
	return *response.JSON201
}

func requireNoClientError(client *Client, label string, err error) {
	client.t.Helper()

	if err != nil {
		client.t.Fatalf("%s request: %v", label, err)
	}
}

func requireStatus(client *Client, label string, got int, want int, body []byte) {
	client.t.Helper()

	if got != want {
		client.t.Fatalf("%s status = %d, want %d; body %s", label, got, want, body)
	}
}
