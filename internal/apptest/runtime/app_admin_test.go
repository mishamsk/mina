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

func TestSeedDemoRefreshesWarmedReferenceCaches(t *testing.T) {
	client := newSharedClient(t, apptest.WithAccountingSchema("app_admin_demo_seed_warmed_caches"))
	ctx := context.Background()
	missingMemberID := int64(900004)

	warm, err := client.REST().CreateTransactionWithResponse(ctx, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2026-06-01"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            900001,
				Amount:               "-12.34",
				CategoryId:           900003,
				Currency:             "USD",
				MemberId:             &missingMemberID,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
				TagIds:               apptest.Int64SlicePtr(900005),
			},
			{
				AccountId:            900002,
				Amount:               "12.34",
				CategoryId:           900003,
				Currency:             "USD",
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	})
	if err != nil {
		t.Fatalf("warm reference cache request: %v", err)
	}
	if warm.StatusCode() != http.StatusBadRequest {
		t.Fatalf("warm reference cache status = %d, want %d; body %s", warm.StatusCode(), http.StatusBadRequest, warm.Body)
	}

	seeded, err := client.REST().SeedDemoWithResponse(ctx)
	if err != nil {
		t.Fatalf("seed demo request: %v", err)
	}
	if seeded.StatusCode() != http.StatusOK {
		t.Fatalf("seed demo status = %d, want %d; body %s", seeded.StatusCode(), http.StatusOK, seeded.Body)
	}

	refs := seededDemoTransactionRefs(t, client)
	tagIDs := []int64{refs.tagID}
	created, err := client.REST().CreateTransactionWithResponse(ctx, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2026-06-02"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.checkingAccountID,
				Amount:               "-12.34",
				CategoryId:           refs.categoryID,
				Currency:             "USD",
				MemberId:             &refs.memberID,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
				TagIds:               &tagIDs,
			},
			{
				AccountId:            refs.merchantAccountID,
				Amount:               "12.34",
				CategoryId:           refs.categoryID,
				Currency:             "USD",
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	})
	if err != nil {
		t.Fatalf("create transaction after demo seed request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create transaction after demo seed status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
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

	includeHidden := true
	accounts, err := client.REST().ListAccountsWithResponse(ctx, &httpclient.ListAccountsParams{IncludeHidden: &includeHidden})
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

	transactions, err := client.REST().ListTransactionsWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list transactions request: %v", err)
	}
	if transactions.StatusCode() != http.StatusOK {
		t.Fatalf("list transactions status = %d, want %d; body %s", transactions.StatusCode(), http.StatusOK, transactions.Body)
	}
	if len(transactions.JSON200.Transactions) != seeded.Transactions {
		t.Fatalf("listed transactions = %d, want %d", len(transactions.JSON200.Transactions), seeded.Transactions)
	}
	assertDemoSemanticCoverage(t, categories.JSON200.Categories, transactions.JSON200.Transactions)
}

func assertDemoSemanticCoverage(t *testing.T, categories []httpclient.Category, transactions []httpclient.Transaction) {
	t.Helper()

	wantIntents := []httpclient.CategoryEconomicIntent{
		httpclient.CategoryEconomicIntentExpense,
		httpclient.CategoryEconomicIntentFee,
		httpclient.CategoryEconomicIntentIncome,
		httpclient.CategoryEconomicIntentRefund,
		httpclient.CategoryEconomicIntentTransfer,
		httpclient.CategoryEconomicIntentExchange,
		httpclient.CategoryEconomicIntentAdjustment,
		httpclient.CategoryEconomicIntentFxGainLoss,
	}
	gotIntents := map[httpclient.CategoryEconomicIntent]struct{}{}
	for _, category := range categories {
		gotIntents[category.EconomicIntent] = struct{}{}
	}
	for _, intent := range wantIntents {
		if _, ok := gotIntents[intent]; !ok {
			t.Fatalf("seeded demo missing category economic intent %q", intent)
		}
	}

	wantClasses := []httpclient.TransactionClass{
		httpclient.TransactionClassSpend,
		httpclient.TransactionClassIncome,
		httpclient.TransactionClassRefund,
		httpclient.TransactionClassTransfer,
		httpclient.TransactionClassCurrencyExchange,
		httpclient.TransactionClassAdjustment,
		httpclient.TransactionClassFxGainLoss,
		httpclient.TransactionClassMixed,
	}
	gotClasses := map[httpclient.TransactionClass]struct{}{}
	for _, transaction := range transactions {
		gotClasses[transaction.TransactionClass] = struct{}{}
	}
	for _, class := range wantClasses {
		if _, ok := gotClasses[class]; !ok {
			t.Fatalf("seeded demo missing transaction class %q", class)
		}
	}
}

type seededDemoRefs struct {
	checkingAccountID int64
	merchantAccountID int64
	categoryID        int64
	tagID             int64
	memberID          int64
}

func seededDemoTransactionRefs(t *testing.T, client *apptest.Client) seededDemoRefs {
	t.Helper()
	ctx := context.Background()

	includeHidden := true
	accounts, err := client.REST().ListAccountsWithResponse(ctx, &httpclient.ListAccountsParams{IncludeHidden: &includeHidden})
	if err != nil {
		t.Fatalf("list accounts request: %v", err)
	}
	if accounts.StatusCode() != http.StatusOK {
		t.Fatalf("list accounts status = %d, want %d; body %s", accounts.StatusCode(), http.StatusOK, accounts.Body)
	}

	categories, err := client.REST().ListCategoriesWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list categories request: %v", err)
	}
	if categories.StatusCode() != http.StatusOK {
		t.Fatalf("list categories status = %d, want %d; body %s", categories.StatusCode(), http.StatusOK, categories.Body)
	}

	tags, err := client.REST().ListTagsWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list tags request: %v", err)
	}
	if tags.StatusCode() != http.StatusOK {
		t.Fatalf("list tags status = %d, want %d; body %s", tags.StatusCode(), http.StatusOK, tags.Body)
	}

	members, err := client.REST().ListMembersWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list members request: %v", err)
	}
	if members.StatusCode() != http.StatusOK {
		t.Fatalf("list members status = %d, want %d; body %s", members.StatusCode(), http.StatusOK, members.Body)
	}

	return seededDemoRefs{
		checkingAccountID: accountIDByFQN(t, accounts.JSON200.Accounts, "checking:Chase:Joint"),
		merchantAccountID: accountIDByFQN(t, accounts.JSON200.Accounts, "merchant:TraderJoes"),
		categoryID:        categoryIDByFQN(t, categories.JSON200.Categories, "Food:Groceries"),
		tagID:             tagIDByFQN(t, tags.JSON200.Tags, "Shared:Family"),
		memberID:          memberIDByName(t, members.JSON200.Members, "Avery"),
	}
}

func accountIDByFQN(t *testing.T, accounts []httpclient.Account, fqn string) int64 {
	t.Helper()
	for _, account := range accounts {
		if account.Fqn == fqn {
			return account.AccountId
		}
	}
	t.Fatalf("account %q not found", fqn)
	return 0
}

func categoryIDByFQN(t *testing.T, categories []httpclient.Category, fqn string) int64 {
	t.Helper()
	for _, category := range categories {
		if category.Fqn == fqn {
			return category.CategoryId
		}
	}
	t.Fatalf("category %q not found", fqn)
	return 0
}

func tagIDByFQN(t *testing.T, tags []httpclient.Tag, fqn string) int64 {
	t.Helper()
	for _, tag := range tags {
		if tag.Fqn == fqn {
			return tag.TagId
		}
	}
	t.Fatalf("tag %q not found", fqn)
	return 0
}

func memberIDByName(t *testing.T, members []httpclient.Member, name string) int64 {
	t.Helper()
	for _, member := range members {
		if member.Name == name {
			return member.MemberId
		}
	}
	t.Fatalf("member %q not found", name)
	return 0
}
