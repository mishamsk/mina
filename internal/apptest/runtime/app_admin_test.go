package runtime_test

import (
	"context"
	"net/http"
	"sort"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestSeedDemoThroughREST(t *testing.T) {
	clock := apptest.NewFakeClock(time.Date(2026, 7, 15, 12, 0, 0, 0, time.Local))
	client := newSharedClient(t, apptest.WithAccountingSchema("app_admin_demo_seed"), apptest.WithClock(clock))

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
	assertSeededRecurringDemoData(t, client, *seeded.JSON200, clock.Now())
	assertSeededFeaturedBalanceAccounts(t, client)
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
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
				TagIds:               apptest.Int64SlicePtr(900005),
			},
			{
				AccountId:            900002,
				Amount:               "12.34",
				CategoryId:           900003,
				Currency:             "USD",
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
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
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
				TagIds:               &tagIDs,
			},
			{
				AccountId:            refs.merchantAccountID,
				Amount:               "12.34",
				CategoryId:           refs.categoryID,
				Currency:             "USD",
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
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

func TestSeedDemoRefreshesWarmedNeededCurrencyCache(t *testing.T) {
	provider := apptest.NewFakeExchangeRateProvider()
	provider.Set("EUR", "2026-06-01", "1.15000000")
	client := newSharedClient(
		t,
		apptest.WithAccountingSchema("app_admin_demo_seed_warmed_currency_cache"),
		apptest.WithExchangeRateLoading(false),
		apptest.WithExchangeRateProviderFactory(provider),
	)
	ctx := context.Background()

	triggerAndWaitForExchangeRateLoad(t, client)

	seeded, err := client.REST().SeedDemoWithResponse(ctx)
	if err != nil {
		t.Fatalf("seed demo request: %v", err)
	}
	if seeded.StatusCode() != http.StatusOK {
		t.Fatalf("seed demo status = %d, want %d; body %s", seeded.StatusCode(), http.StatusOK, seeded.Body)
	}

	triggerAndWaitForExchangeRateLoad(t, client)

	assertExchangeRateRateOnDate(t, client, "USD", "EUR", "2026-06-01", "1.15000000")
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

func assertSeededRecurringDemoData(t *testing.T, client *apptest.Client, seeded httpclient.DemoSeedResponse, today time.Time) {
	t.Helper()
	ctx := context.Background()

	definitions, err := client.REST().ListRecurringDefinitionsWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list seeded recurring definitions request: %v", err)
	}
	if definitions.StatusCode() != http.StatusOK {
		t.Fatalf("list seeded recurring definitions status = %d, want %d; body %s", definitions.StatusCode(), http.StatusOK, definitions.Body)
	}
	if len(definitions.JSON200.RecurringDefinitions) != seeded.RecurringDefinitions {
		t.Fatalf("listed recurring definitions = %d, want %d", len(definitions.JSON200.RecurringDefinitions), seeded.RecurringDefinitions)
	}

	expectedStatus := []httpclient.PostingStatus{httpclient.PostingStatusExpected}
	expectedTransactions, err := client.REST().ListTransactionsWithResponse(ctx, &httpclient.ListTransactionsParams{PostingStatus: &expectedStatus})
	if err != nil {
		t.Fatalf("list expected seeded transactions request: %v", err)
	}
	if expectedTransactions.StatusCode() != http.StatusOK {
		t.Fatalf("list expected seeded transactions status = %d, want %d; body %s", expectedTransactions.StatusCode(), http.StatusOK, expectedTransactions.Body)
	}
	if len(expectedTransactions.JSON200.Transactions) != seeded.RecurringOccurrences {
		t.Fatalf("listed expected seeded transactions = %d, want %d", len(expectedTransactions.JSON200.Transactions), seeded.RecurringOccurrences)
	}
	for _, transaction := range expectedTransactions.JSON200.Transactions {
		if transaction.RecurringOccurrenceId == nil {
			t.Fatalf("expected seeded transaction %d missing recurring occurrence", transaction.TransactionId)
		}
		for _, record := range transaction.Records {
			if record.PostingStatus != httpclient.PostingStatusExpected || record.Source != httpclient.RecurringTemplate {
				t.Fatalf("expected seeded transaction record = %+v, want expected recurring-template record", record)
			}
		}
	}

	occurrences, err := client.REST().ListRecurringOccurrencesWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list seeded recurring occurrences request: %v", err)
	}
	if occurrences.StatusCode() != http.StatusOK {
		t.Fatalf("list seeded recurring occurrences status = %d, want %d; body %s", occurrences.StatusCode(), http.StatusOK, occurrences.Body)
	}
	if len(occurrences.JSON200.RecurringOccurrences) != seeded.RecurringOccurrences {
		t.Fatalf("listed recurring occurrences = %d, want %d", len(occurrences.JSON200.RecurringOccurrences), seeded.RecurringOccurrences)
	}

	assertSeededRecurringDemoSeries(t, definitions.JSON200.RecurringDefinitions, occurrences.JSON200.RecurringOccurrences)

	hasUpcomingSchedule := false
	for _, definition := range definitions.JSON200.RecurringDefinitions {
		if definition.NextDueDate != nil && definition.NextDueDate.After(today) {
			hasUpcomingSchedule = true
			break
		}
	}
	if !hasUpcomingSchedule {
		t.Fatalf("seeded recurring definitions = %+v, want an upcoming schedule", definitions.JSON200.RecurringDefinitions)
	}
}

type expectedRecurringDemoSeries struct {
	fqn             string
	anchorDate      string
	every           int
	unit            string
	nextDueDate     string
	occurrenceDates []string
}

func assertSeededRecurringDemoSeries(t *testing.T, definitions []httpclient.RecurringDefinition, occurrences []httpclient.RecurringOccurrence) {
	t.Helper()

	want := []expectedRecurringDemoSeries{
		{
			fqn:             "Household:Mortgage",
			anchorDate:      "2026-06-05",
			every:           1,
			unit:            "MONTH",
			nextDueDate:     "2026-08-05",
			occurrenceDates: []string{"2026-06-05", "2026-07-05"},
		},
		{
			fqn:             "Subscriptions:Netflix",
			anchorDate:      "2026-06-10",
			every:           1,
			unit:            "MONTH",
			nextDueDate:     "2026-08-10",
			occurrenceDates: []string{"2026-06-10", "2026-07-10"},
		},
		{
			fqn:             "Savings:WeeklyTransfer",
			anchorDate:      "2026-06-01",
			every:           1,
			unit:            "WEEK",
			nextDueDate:     "2026-07-20",
			occurrenceDates: []string{"2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13"},
		},
		{
			fqn:             "Debt:CreditCardPayment",
			anchorDate:      "2026-06-12",
			every:           1,
			unit:            "MONTH",
			nextDueDate:     "2026-08-12",
			occurrenceDates: []string{"2026-06-12", "2026-07-12"},
		},
	}

	definitionsByFQN := map[string]httpclient.RecurringDefinition{}
	for _, definition := range definitions {
		definitionsByFQN[definition.Fqn] = definition
	}
	occurrenceDatesByDefinitionFQN := map[string][]string{}
	for _, occurrence := range occurrences {
		if occurrence.Status != httpclient.Expected {
			t.Fatalf("seeded recurring occurrence = %+v, want EXPECTED status", occurrence)
		}
		if occurrence.GeneratedTransactionId == nil {
			t.Fatalf("seeded recurring occurrence = %+v, want generated transaction", occurrence)
		}
		occurrenceDatesByDefinitionFQN[occurrence.RecurringDefinitionFqn] = append(
			occurrenceDatesByDefinitionFQN[occurrence.RecurringDefinitionFqn],
			occurrence.ScheduledDate.Format("2006-01-02"),
		)
	}

	for _, expected := range want {
		definition, ok := definitionsByFQN[expected.fqn]
		if !ok {
			t.Fatalf("seeded recurring definitions missing %q; definitions = %+v", expected.fqn, definitions)
		}
		sort.Strings(occurrenceDatesByDefinitionFQN[expected.fqn])
		if got := definition.AnchorDate.Format("2006-01-02"); got != expected.anchorDate {
			t.Fatalf("%s anchor_date = %s, want %s", expected.fqn, got, expected.anchorDate)
		}
		if definition.ScheduleClass != httpclient.Interval {
			t.Fatalf("%s schedule_class = %s, want %s", expected.fqn, definition.ScheduleClass, httpclient.Interval)
		}
		assertRecurringIntervalRule(t, expected.fqn, definition.ScheduleRule, expected.every, expected.unit)
		assertDatePtr(t, definition.NextDueDate, expected.nextDueDate)
		assertStringSlicesEqual(t, expected.fqn+" occurrence dates", occurrenceDatesByDefinitionFQN[expected.fqn], expected.occurrenceDates)
	}
}

func assertRecurringIntervalRule(t *testing.T, fqn string, rule httpclient.RecurringScheduleRule, every int, unit string) {
	t.Helper()
	if got := rule["version"]; got != float64(1) {
		t.Fatalf("%s schedule_rule.version = %v, want 1", fqn, got)
	}
	if got := rule["kind"]; got != "interval" {
		t.Fatalf("%s schedule_rule.kind = %v, want interval", fqn, got)
	}
	if got := rule["every"]; got != float64(every) {
		t.Fatalf("%s schedule_rule.every = %v, want %d", fqn, got, every)
	}
	if got := rule["unit"]; got != unit {
		t.Fatalf("%s schedule_rule.unit = %v, want %s", fqn, got, unit)
	}
}

func assertStringSlicesEqual(t *testing.T, label string, got []string, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %+v, want %+v", label, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s = %+v, want %+v", label, got, want)
		}
	}
}

func assertSeededFeaturedBalanceAccounts(t *testing.T, client *apptest.Client) {
	t.Helper()

	accountType := httpclient.Balance
	isFeatured := true
	sortBy := httpclient.ListAccountsParamsSortFqn
	sortDir := httpclient.ListAccountsParamsSortDirAsc
	accounts, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{
		AccountType: &accountType,
		IsFeatured:  &isFeatured,
		Sort:        &sortBy,
		SortDir:     &sortDir,
	})
	if err != nil {
		t.Fatalf("list featured balance accounts request: %v", err)
	}
	if accounts.StatusCode() != http.StatusOK {
		t.Fatalf("list featured balance accounts status = %d, want %d; body %s", accounts.StatusCode(), http.StatusOK, accounts.Body)
	}

	want := []string{
		"checking:Chase:Joint",
		"credit_card:Chase:Sapphire",
		"savings:Ally:Emergency",
	}
	if len(accounts.JSON200.Accounts) != len(want) {
		t.Fatalf("featured balance account count = %d, want %d; accounts = %+v", len(accounts.JSON200.Accounts), len(want), accounts.JSON200.Accounts)
	}
	for i, account := range accounts.JSON200.Accounts {
		if account.Fqn != want[i] {
			t.Fatalf("featured balance account fqn at %d = %q, want %q; accounts = %+v", i, account.Fqn, want[i], accounts.JSON200.Accounts)
		}
	}
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
