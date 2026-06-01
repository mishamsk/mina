package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestSeedDemoThroughREST(t *testing.T) {
	client := newSharedClient(t, apptest.WithAccountingSchema("app_admin_demo_seed"))

	seeded, err := client.REST().SeedDemoWithResponse(context.Background())
	if err != nil {
		t.Fatalf("seed demo request: %v", err)
	}
	if seeded.StatusCode() != http.StatusOK {
		t.Fatalf("seed demo status = %d, want %d; body %s", seeded.StatusCode(), http.StatusOK, seeded.Body)
	}
	if seeded.JSON200.Transactions < 100 {
		t.Fatalf("seeded transactions = %d, want at least 100", seeded.JSON200.Transactions)
	}
	assertSeededRESTCounts(t, client, *seeded.JSON200)
}

func assertSeededRESTCounts(t *testing.T, client *apptest.Client, seeded httpclient.DemoSeedResponse) {
	t.Helper()

	ctx := context.Background()

	members, err := client.REST().ListMembersWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list members request: %v", err)
	}
	if members.StatusCode() != http.StatusOK {
		t.Fatalf("list members status = %d, want %d; body %s", members.StatusCode(), http.StatusOK, members.Body)
	}
	if len(members.JSON200.Members) != seeded.Members {
		t.Fatalf("listed members = %d, want %d", len(members.JSON200.Members), seeded.Members)
	}

	accounts, err := client.REST().ListAccountsWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list accounts request: %v", err)
	}
	if accounts.StatusCode() != http.StatusOK {
		t.Fatalf("list accounts status = %d, want %d; body %s", accounts.StatusCode(), http.StatusOK, accounts.Body)
	}
	if len(accounts.JSON200.Accounts) != seeded.Accounts {
		t.Fatalf("listed accounts = %d, want %d", len(accounts.JSON200.Accounts), seeded.Accounts)
	}

	categories, err := client.REST().ListCategoriesWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list categories request: %v", err)
	}
	if categories.StatusCode() != http.StatusOK {
		t.Fatalf("list categories status = %d, want %d; body %s", categories.StatusCode(), http.StatusOK, categories.Body)
	}
	if len(categories.JSON200.Categories) != seeded.Categories {
		t.Fatalf("listed categories = %d, want %d", len(categories.JSON200.Categories), seeded.Categories)
	}

	tags, err := client.REST().ListTagsWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list tags request: %v", err)
	}
	if tags.StatusCode() != http.StatusOK {
		t.Fatalf("list tags status = %d, want %d; body %s", tags.StatusCode(), http.StatusOK, tags.Body)
	}
	if len(tags.JSON200.Tags) != seeded.Tags {
		t.Fatalf("listed tags = %d, want %d", len(tags.JSON200.Tags), seeded.Tags)
	}

	exchangeRates, err := client.REST().ListExchangeRatesWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list exchange rates request: %v", err)
	}
	if exchangeRates.StatusCode() != http.StatusOK {
		t.Fatalf("list exchange rates status = %d, want %d; body %s", exchangeRates.StatusCode(), http.StatusOK, exchangeRates.Body)
	}
	if len(exchangeRates.JSON200.ExchangeRates) != seeded.ExchangeRates {
		t.Fatalf("listed exchange rates = %d, want %d", len(exchangeRates.JSON200.ExchangeRates), seeded.ExchangeRates)
	}

	creditLimitEntries := 0
	for _, account := range accounts.JSON200.Accounts {
		history, err := client.REST().ListCreditLimitHistoryWithResponse(ctx, account.AccountId, nil)
		if err != nil {
			t.Fatalf("list credit limit history request for account %d: %v", account.AccountId, err)
		}
		if history.StatusCode() != http.StatusOK {
			t.Fatalf("list credit limit history status for account %d = %d, want %d; body %s", account.AccountId, history.StatusCode(), http.StatusOK, history.Body)
		}
		creditLimitEntries += len(history.JSON200.CreditLimitHistory)
	}
	if creditLimitEntries != seeded.CreditLimitEntries {
		t.Fatalf("listed credit limit entries = %d, want %d", creditLimitEntries, seeded.CreditLimitEntries)
	}

	transactions, err := client.REST().ListTransactionsWithResponse(ctx)
	if err != nil {
		t.Fatalf("list transactions request: %v", err)
	}
	if transactions.StatusCode() != http.StatusOK {
		t.Fatalf("list transactions status = %d, want %d; body %s", transactions.StatusCode(), http.StatusOK, transactions.Body)
	}
	if len(transactions.JSON200.Transactions) != seeded.Transactions {
		t.Fatalf("listed transactions = %d, want %d", len(transactions.JSON200.Transactions), seeded.Transactions)
	}
}
