package runtime_test

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestSeedDemoThroughREST(t *testing.T) {
	clock := apptest.NewFakeClock(time.Date(2026, 7, 14, 12, 0, 0, 0, time.Local))
	client := newSharedClient(t, apptest.WithAccountingSchema("app_admin_demo_seed"), apptest.WithClock(clock))
	anchorDate := apptest.Date("2026-07-15")

	seeded, err := client.REST().SeedDemoWithResponse(context.Background(), &httpclient.SeedDemoParams{AnchorDate: &anchorDate})
	if err != nil {
		t.Fatalf("seed demo request: %v", err)
	}
	if seeded.StatusCode() != http.StatusOK {
		t.Fatalf("seed demo status = %d, want %d; body %s", seeded.StatusCode(), http.StatusOK, seeded.Body)
	}
	if seeded.JSON200.Transactions < 100 {
		t.Fatalf("seeded transactions = %d, want at least 100", seeded.JSON200.Transactions)
	}
	assertSeededRESTCounts(t, client, *seeded.JSON200, anchorDate.Time)
	assertSeededRecurringDemoData(t, client, *seeded.JSON200, anchorDate.Time)
	assertSeededFeaturedBalanceAccounts(t, client)
	assertSeededPlausibleBalances(t, client)
	assertSeededAmazonDisplayLabels(t, client)
}

func TestSeedDemoThroughRESTDefaultsToClockLocalDate(t *testing.T) {
	localZone := time.FixedZone("UTC-4", -4*60*60)
	clock := apptest.NewFakeClock(time.Date(2026, 7, 14, 23, 30, 0, 0, localZone))
	client := newSharedClient(t, apptest.WithAccountingSchema("app_admin_demo_seed_clock_anchor"), apptest.WithClock(clock))

	seeded, err := client.REST().SeedDemoWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("seed demo request: %v", err)
	}
	if seeded.StatusCode() != http.StatusOK {
		t.Fatalf("seed demo status = %d, want %d; body %s", seeded.StatusCode(), http.StatusOK, seeded.Body)
	}

	transactions, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list seeded transactions request: %v", err)
	}
	if transactions.StatusCode() != http.StatusOK {
		t.Fatalf("list seeded transactions status = %d, want %d; body %s", transactions.StatusCode(), http.StatusOK, transactions.Body)
	}
	earliestDate := clock.Now()
	latestDate := clock.Now().AddDate(0, -6, 0)
	for _, transaction := range transactions.JSON200.Transactions {
		if transaction.InitiatedDate.Before(earliestDate) {
			earliestDate = transaction.InitiatedDate.Time
		}
		if transaction.InitiatedDate.After(latestDate) {
			latestDate = transaction.InitiatedDate.Time
		}
	}
	if got, want := earliestDate.Format("2006-01-02"), "2026-01-14"; got != want {
		t.Fatalf("earliest seeded transaction date = %s, want %s", got, want)
	}
	if got, want := latestDate.Format("2006-01-02"), "2026-07-14"; got != want {
		t.Fatalf("latest seeded transaction date = %s, want local clock date %s", got, want)
	}
}

func TestSeedDemoRejectsUnsupportedBoundaryAnchor(t *testing.T) {
	client := newSharedClient(t, apptest.WithAccountingSchema("app_admin_demo_seed_boundary_anchor"))
	anchorDate := apptest.Date("0000-01-01")

	seeded, err := client.REST().SeedDemoWithResponse(context.Background(), &httpclient.SeedDemoParams{AnchorDate: &anchorDate})
	if err != nil {
		t.Fatalf("seed demo request: %v", err)
	}
	if seeded.StatusCode() != http.StatusBadRequest {
		t.Fatalf("seed demo status = %d, want %d; body %s", seeded.StatusCode(), http.StatusBadRequest, seeded.Body)
	}
}

func TestSeedDemoMonthEndAnchorCoversSixCalendarMonths(t *testing.T) {
	client := newSharedClient(t, apptest.WithAccountingSchema("app_admin_demo_seed_month_end_anchor"))
	anchorDate := apptest.Date("2026-08-31")

	seeded, err := client.REST().SeedDemoWithResponse(context.Background(), &httpclient.SeedDemoParams{AnchorDate: &anchorDate})
	if err != nil {
		t.Fatalf("seed demo request: %v", err)
	}
	if seeded.StatusCode() != http.StatusOK {
		t.Fatalf("seed demo status = %d, want %d; body %s", seeded.StatusCode(), http.StatusOK, seeded.Body)
	}

	transactions, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list seeded transactions request: %v", err)
	}
	if transactions.StatusCode() != http.StatusOK {
		t.Fatalf("list seeded transactions status = %d, want %d; body %s", transactions.StatusCode(), http.StatusOK, transactions.Body)
	}
	earliestDate := anchorDate.Time
	var latestWeeklyTransferDate time.Time
	var mortgageDates []string
	for _, transaction := range transactions.JSON200.Transactions {
		if transaction.InitiatedDate.Before(earliestDate) {
			earliestDate = transaction.InitiatedDate.Time
		}
		for _, record := range transaction.Records {
			if record.Memo != nil && *record.Memo == "Weekly savings transfer" && transaction.InitiatedDate.After(latestWeeklyTransferDate) {
				latestWeeklyTransferDate = transaction.InitiatedDate.Time
			}
			if record.Memo != nil && *record.Memo == "Mortgage payment" {
				mortgageDates = append(mortgageDates, transaction.InitiatedDate.Format("2006-01-02"))
			}
		}
	}
	if got, want := earliestDate.Format("2006-01-02"), "2026-02-28"; got != want {
		t.Fatalf("earliest seeded transaction date = %s, want %s", got, want)
	}
	sort.Strings(mortgageDates)
	assertStringSlicesEqual(
		t,
		"posted mortgage history dates",
		mortgageDates,
		[]string{"2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05"},
	)

	definitions, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list seeded recurring definitions request: %v", err)
	}
	if definitions.StatusCode() != http.StatusOK {
		t.Fatalf("list seeded recurring definitions status = %d, want %d; body %s", definitions.StatusCode(), http.StatusOK, definitions.Body)
	}
	for _, definition := range definitions.JSON200.RecurringDefinitions {
		if definition.Fqn != "Savings:WeeklyTransfer" {
			continue
		}
		if got := definition.AnchorDate.Sub(latestWeeklyTransferDate); got != 7*24*time.Hour {
			t.Fatalf("weekly transfer definition follows historical transfer by %s, want %s", got, 7*24*time.Hour)
		}
		return
	}
	t.Fatal("seeded demo missing weekly transfer definition")
}

func TestSeedDemoAnchorsActivityAndTripTagsAcrossYearBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithAccountingSchema("app_admin_demo_seed_trip_tag_years"))
	anchorDate := apptest.Date("2030-01-10")

	seeded, err := client.REST().SeedDemoWithResponse(context.Background(), &httpclient.SeedDemoParams{AnchorDate: &anchorDate})
	if err != nil {
		t.Fatalf("seed demo request: %v", err)
	}
	if seeded.StatusCode() != http.StatusOK {
		t.Fatalf("seed demo status = %d, want %d; body %s", seeded.StatusCode(), http.StatusOK, seeded.Body)
	}

	transactions, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list seeded transactions request: %v", err)
	}
	if transactions.StatusCode() != http.StatusOK {
		t.Fatalf("list seeded transactions status = %d, want %d; body %s", transactions.StatusCode(), http.StatusOK, transactions.Body)
	}
	earliestDate := anchorDate.Time
	latestDate := sixCalendarMonthsBefore(anchorDate.Time)
	for _, transaction := range transactions.JSON200.Transactions {
		if transaction.InitiatedDate.Before(earliestDate) {
			earliestDate = transaction.InitiatedDate.Time
		}
		if transaction.InitiatedDate.After(latestDate) {
			latestDate = transaction.InitiatedDate.Time
		}
	}
	if got, want := earliestDate.Format("2006-01-02"), "2029-07-10"; got != want {
		t.Fatalf("earliest seeded transaction date = %s, want %s", got, want)
	}
	if got, want := latestDate.Format("2006-01-02"), "2030-01-10"; got != want {
		t.Fatalf("latest seeded transaction date = %s, want %s", got, want)
	}

	tags, err := client.REST().ListTagsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list seeded tags request: %v", err)
	}
	if tags.StatusCode() != http.StatusOK {
		t.Fatalf("list seeded tags status = %d, want %d; body %s", tags.StatusCode(), http.StatusOK, tags.Body)
	}
	tagsByFQN := make(map[string]struct{}, len(tags.JSON200.Tags))
	for _, tag := range tags.JSON200.Tags {
		tagsByFQN[tag.Fqn] = struct{}{}
	}
	for _, fqn := range []string{"Trips:Vacation:Lisbon2029", "Trips:Vacation:Tokyo2029"} {
		if _, ok := tagsByFQN[fqn]; !ok {
			t.Fatalf("seeded demo missing tag %q", fqn)
		}
	}
	for _, fqn := range []string{"Trips:Vacation:Lisbon2030", "Trips:Vacation:Tokyo2030"} {
		if _, ok := tagsByFQN[fqn]; ok {
			t.Fatalf("seeded demo retained stale tag %q", fqn)
		}
	}
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
				CategoryId:           apptest.Int64Ptr(900003),
				Currency:             "USD",
				MemberId:             &missingMemberID,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
				TagIds:               apptest.Int64SlicePtr(900005),
			},
			{
				AccountId:            900002,
				Amount:               "12.34",
				CategoryId:           apptest.Int64Ptr(900003),
				Currency:             "USD",
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	})
	if err != nil {
		t.Fatalf("warm reference cache request: %v", err)
	}
	if warm.StatusCode() != http.StatusBadRequest {
		t.Fatalf("warm reference cache status = %d, want %d; body %s", warm.StatusCode(), http.StatusBadRequest, warm.Body)
	}

	seeded, err := client.REST().SeedDemoWithResponse(ctx, nil)
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
				Currency:             "USD",
				MemberId:             &refs.memberID,
				Settlement:           apptest.PostedSettlement(),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
				TagIds:               &tagIDs,
			},
			{
				AccountId:            refs.merchantAccountID,
				Amount:               "12.34",
				CategoryId:           apptest.Int64Ptr(refs.categoryID),
				Currency:             "USD",
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
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

	seeded, err := client.REST().SeedDemoWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("seed demo request: %v", err)
	}
	if seeded.StatusCode() != http.StatusOK {
		t.Fatalf("seed demo status = %d, want %d; body %s", seeded.StatusCode(), http.StatusOK, seeded.Body)
	}

	triggerAndWaitForExchangeRateLoad(t, client)

	assertExchangeRateRateOnDate(t, client, "USD", "EUR", "2026-06-01", "1.15000000")
}

func assertSeededRESTCounts(t *testing.T, client *apptest.Client, seeded httpclient.DemoSeedResponse, anchorDate time.Time) {
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
	assertDemoSemanticCoverage(t, accounts.JSON200.Accounts, categories.JSON200.Categories, transactions.JSON200.Transactions, anchorDate)
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

	expectedStatus := []httpclient.TransactionLifecycleStatus{httpclient.TransactionLifecycleStatusExpected}
	expectedTransactions, err := client.REST().ListTransactionsWithResponse(ctx, &httpclient.ListTransactionsParams{LifecycleStatus: &expectedStatus})
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
		if transaction.LifecycleStatus != httpclient.TransactionLifecycleStatusExpected {
			t.Fatalf("expected seeded transaction lifecycle = %q, want expected", transaction.LifecycleStatus)
		}
		for _, record := range transaction.Records {
			if record.LifecycleStatus != httpclient.TransactionLifecycleStatusExpected || record.Source != httpclient.RecurringTemplate {
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
			anchorDate:      "2026-05-20",
			every:           1,
			unit:            "MONTH",
			nextDueDate:     "2026-07-20",
			occurrenceDates: []string{"2026-05-20", "2026-06-20"},
		},
		{
			fqn:             "Subscriptions:Netflix",
			anchorDate:      "2026-05-25",
			every:           1,
			unit:            "MONTH",
			nextDueDate:     "2026-07-25",
			occurrenceDates: []string{"2026-05-25", "2026-06-25"},
		},
		{
			fqn:             "Savings:WeeklyTransfer",
			anchorDate:      "2026-06-09",
			every:           1,
			unit:            "WEEK",
			nextDueDate:     "2026-07-21",
			occurrenceDates: []string{"2026-06-09", "2026-06-16", "2026-06-23", "2026-06-30", "2026-07-07", "2026-07-14"},
		},
		{
			fqn:             "Debt:CreditCardPayment",
			anchorDate:      "2026-05-27",
			every:           1,
			unit:            "MONTH",
			nextDueDate:     "2026-07-27",
			occurrenceDates: []string{"2026-05-27", "2026-06-27"},
		},
	}

	definitionsByFQN := map[string]httpclient.RecurringDefinition{}
	for _, definition := range definitions {
		definitionsByFQN[definition.Fqn] = definition
	}
	occurrenceDatesByDefinitionFQN := map[string][]string{}
	for _, occurrence := range occurrences {
		if occurrence.Status != httpclient.RecurringOccurrenceStatusExpected {
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

	accountType := httpclient.AccountTypeOwned
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
		"bank:Ally:emergency_savings",
		"bank:Chase:Sapphire",
		"bank:Chase:joint_checking",
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

func assertSeededPlausibleBalances(t *testing.T, client *apptest.Client) {
	t.Helper()

	ctx := context.Background()
	accounts, err := client.REST().ListAccountsWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list accounts for balance sanity request: %v", err)
	}
	if accounts.StatusCode() != http.StatusOK {
		t.Fatalf("list accounts for balance sanity status = %d, want %d; body %s", accounts.StatusCode(), http.StatusOK, accounts.Body)
	}
	balances, err := client.REST().ListAccountBalancesWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list seeded balances request: %v", err)
	}
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("list seeded balances status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}

	accountFQNs := make(map[int64]string, len(accounts.JSON200.Accounts))
	for _, account := range accounts.JSON200.Accounts {
		accountFQNs[account.AccountId] = account.Fqn
	}
	balancesByFQN := make(map[string]string, len(balances.JSON200.Balances))
	for _, balance := range balances.JSON200.Balances {
		balancesByFQN[accountFQNs[balance.AccountId]] = balance.CurrentBalance
	}
	for _, fqn := range []string{"bank:Chase:joint_checking", "bank:Ally:emergency_savings", "cash:Wallet"} {
		if balance := balancesByFQN[fqn]; balance == "" || balance == "0.00000000" || strings.HasPrefix(balance, "-") {
			t.Fatalf("seeded asset balance %q = %q, want positive", fqn, balance)
		}
	}
	for _, fqn := range []string{"bank:Chase:Sapphire", "bank:Amex:BlueCash"} {
		if balance := balancesByFQN[fqn]; !strings.HasPrefix(balance, "-") {
			t.Fatalf("seeded credit card balance %q = %q, want negative", fqn, balance)
		}
	}
}

func assertSeededAmazonDisplayLabels(t *testing.T, client *apptest.Client) {
	t.Helper()
	ctx := context.Background()

	accountsResponse, err := client.REST().ListAccountsWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list accounts for Amazon display labels: %v", err)
	}
	if accountsResponse.StatusCode() != http.StatusOK {
		t.Fatalf("list accounts for Amazon display labels status = %d, want %d; body %s", accountsResponse.StatusCode(), http.StatusOK, accountsResponse.Body)
	}
	accountsByFQN := make(map[string]httpclient.Account, len(accountsResponse.JSON200.Accounts))
	for _, account := range accountsResponse.JSON200.Accounts {
		accountsByFQN[account.Fqn] = account
	}
	flow, flowFound := accountsByFQN["merchant:Amazon:flow"]
	if !flowFound || flow.AccountType != httpclient.AccountTypeFlow || flow.DisplayLabel != "Amazon" {
		t.Fatalf("seeded Amazon flow account = %+v, found %t; want flow with display label Amazon", flow, flowFound)
	}
	giftCard, giftCardFound := accountsByFQN["merchant:Amazon:gift_card"]
	if !giftCardFound || giftCard.AccountType != httpclient.AccountTypeOwned || giftCard.DisplayLabel != "Amazon:gift_card" {
		t.Fatalf("seeded Amazon gift-card account = %+v, found %t; want owned with fallback display label Amazon:gift_card", giftCard, giftCardFound)
	}

	balancesResponse, err := client.REST().ListAccountBalancesWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list balances for Amazon display labels: %v", err)
	}
	if balancesResponse.StatusCode() != http.StatusOK {
		t.Fatalf("list balances for Amazon display labels status = %d, want %d; body %s", balancesResponse.StatusCode(), http.StatusOK, balancesResponse.Body)
	}
	var giftCardBalance string
	for _, balance := range balancesResponse.JSON200.Balances {
		if balance.AccountId == giftCard.AccountId && balance.Currency == "USD" {
			giftCardBalance = balance.CurrentBalance
			break
		}
	}
	if giftCardBalance != "65.00000000" {
		t.Fatalf("seeded Amazon gift-card balance = %q, want 65.00000000", giftCardBalance)
	}

	transactionsResponse, err := client.REST().ListTransactionsWithResponse(ctx, nil)
	if err != nil {
		t.Fatalf("list transactions for Amazon display labels: %v", err)
	}
	if transactionsResponse.StatusCode() != http.StatusOK {
		t.Fatalf("list transactions for Amazon display labels status = %d, want %d; body %s", transactionsResponse.StatusCode(), http.StatusOK, transactionsResponse.Body)
	}
	type expectedActivity struct {
		class   httpclient.TransactionClass
		amounts map[int64]string
		found   bool
	}
	wantActivities := map[string]*expectedActivity{
		"Chase:joint_checking → Amazon:gift_card": {
			class: httpclient.TransactionClassTransfer,
			amounts: map[int64]string{
				accountsByFQN["bank:Chase:joint_checking"].AccountId: "-100.00000000",
				giftCard.AccountId: "100.00000000",
			},
		},
		"Amazon:gift_card → Amazon": {
			class: httpclient.TransactionClassSpend,
			amounts: map[int64]string{
				giftCard.AccountId: "-35.00000000",
				flow.AccountId:     "35.00000000",
			},
		},
	}
	for _, transaction := range transactionsResponse.JSON200.Transactions {
		activity, ok := wantActivities[transaction.DisplayTitle]
		if !ok {
			continue
		}
		if transaction.TransactionClass != activity.class {
			t.Fatalf("seeded transaction %q class = %q, want %q", transaction.DisplayTitle, transaction.TransactionClass, activity.class)
		}
		gotAmounts := make(map[int64]string, len(transaction.Records))
		for _, record := range transaction.Records {
			gotAmounts[record.AccountId] = record.Amount
		}
		for accountID, amount := range activity.amounts {
			if gotAmounts[accountID] != amount {
				t.Fatalf("seeded transaction %q account %d amount = %q, want %q", transaction.DisplayTitle, accountID, gotAmounts[accountID], amount)
			}
		}
		activity.found = true
	}
	for title, activity := range wantActivities {
		if !activity.found {
			t.Fatalf("seeded demo missing display title %q", title)
		}
	}
}

func assertDemoSemanticCoverage(
	t *testing.T,
	accounts []httpclient.Account,
	categories []httpclient.Category,
	transactions []httpclient.Transaction,
	anchorDate time.Time,
) {
	t.Helper()

	accountsByFQN := make(map[string]httpclient.Account, len(accounts))
	for _, account := range accounts {
		accountsByFQN[account.Fqn] = account
		if strings.HasPrefix(account.Fqn, "Income:") {
			t.Fatalf("seeded account %q mirrors an income category", account.Fqn)
		}
		if strings.HasPrefix(account.Fqn, "system:") && account.AccountType != httpclient.AccountTypeSystem {
			t.Fatalf("seeded system account %q has type %q", account.Fqn, account.AccountType)
		}
	}
	for fqn, accountType := range map[string]httpclient.AccountType{
		"bank:Chase:joint_checking": httpclient.AccountTypeOwned,
		"bank:Chase:Sapphire":       httpclient.AccountTypeOwned,
		"bank:Rocket:mortgage":      httpclient.AccountTypeFlow,
		"cash:Wallet":               httpclient.AccountTypeOwned,
		"cash:Home-Stash":           httpclient.AccountTypeOwned,
		"employers:Acme:salary":     httpclient.AccountTypeFlow,
		"employers:Acme:expenses":   httpclient.AccountTypeParty,
		"merchant:unspecified":      httpclient.AccountTypeFlow,
		"merchant:Amazon:flow":      httpclient.AccountTypeFlow,
		"merchant:Amazon:gift_card": httpclient.AccountTypeOwned,
		"person:Friend:Jordan":      httpclient.AccountTypeParty,
		"system:opening_balance":    httpclient.AccountTypeSystem,
	} {
		account, ok := accountsByFQN[fqn]
		if !ok {
			t.Fatalf("seeded demo missing account %q", fqn)
		}
		if account.AccountType != accountType {
			t.Fatalf("seeded account %q type = %q, want %q", fqn, account.AccountType, accountType)
		}
	}
	for _, fqn := range []string{"cash:Wallet", "cash:Home-Stash", "merchant:unspecified"} {
		if currency := accountsByFQN[fqn].Currency; currency != nil {
			t.Fatalf("seeded multi-currency account %q currency = %q, want unrestricted", fqn, *currency)
		}
	}
	wantMerchants := []string{
		"merchant:Amazon:flow",
		"merchant:Amazon:gift_card",
		"merchant:BlueBottle",
		"merchant:CVS",
		"merchant:ConEd",
		"merchant:MTA",
		"merchant:Netflix",
		"merchant:PowellsBooks",
		"merchant:Shell",
		"merchant:Target",
		"merchant:TraderJoes",
		"merchant:unspecified",
	}
	var gotMerchants []string
	for fqn := range accountsByFQN {
		if strings.HasPrefix(fqn, "merchant:") {
			gotMerchants = append(gotMerchants, fqn)
		}
	}
	sort.Strings(gotMerchants)
	assertStringSlicesEqual(t, "seeded merchant accounts", gotMerchants, wantMerchants)

	wantIntents := []httpclient.CategoryEconomicIntent{
		httpclient.CategoryEconomicIntentExpense,
		httpclient.CategoryEconomicIntentIncome,
	}
	gotIntents := map[httpclient.CategoryEconomicIntent]struct{}{}
	categoriesByFQN := make(map[string]httpclient.Category, len(categories))
	for _, category := range categories {
		gotIntents[category.EconomicIntent] = struct{}{}
		categoriesByFQN[category.Fqn] = category
	}
	for _, intent := range wantIntents {
		if _, ok := gotIntents[intent]; !ok {
			t.Fatalf("seeded demo missing category economic intent %q", intent)
		}
	}
	for _, fqn := range []string{"Income:Salary", "Income:Bonus"} {
		category, ok := categoriesByFQN[fqn]
		if !ok {
			t.Fatalf("seeded demo missing category %q", fqn)
		}
		if category.EconomicIntent != httpclient.CategoryEconomicIntentIncome {
			t.Fatalf("seeded category %q intent = %q, want income", fqn, category.EconomicIntent)
		}
	}

	wantClasses := []httpclient.TransactionClass{
		httpclient.TransactionClassSpend,
		httpclient.TransactionClassIncome,
		httpclient.TransactionClassClawback,
		httpclient.TransactionClassRefund,
		httpclient.TransactionClassTransfer,
		httpclient.TransactionClassCurrencyExchange,
		httpclient.TransactionClassAdjustment,
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

	accountTypes := make(map[int64]httpclient.AccountType, len(accounts))
	for _, account := range accounts {
		accountTypes[account.AccountId] = account.AccountType
	}
	expenseCategories := map[int64]struct{}{}
	refundCategories := map[int64]struct{}{}
	partySigns := map[int64]map[bool]struct{}{}
	hasMultiMerchantSpend := false
	hasValidClawback := false
	earliestDate := anchorDate
	latestDate := anchorDate.AddDate(0, -6, 0)
	for _, transaction := range transactions {
		if transaction.InitiatedDate.Before(earliestDate) {
			earliestDate = transaction.InitiatedDate.Time
		}
		if transaction.InitiatedDate.After(latestDate) {
			latestDate = transaction.InitiatedDate.Time
		}
		expenseAccounts := map[int64]struct{}{}
		hasClawbackRecord := false
		hasClawbackOutflow := false
		wantPostedDate := transaction.InitiatedDate.Add(24*time.Hour - time.Second)
		for _, record := range transaction.Records {
			if record.Settlement == nil {
				if record.PendingDate != nil || record.PostedDate != nil {
					t.Fatalf("seeded non-balance record %d dates = %v/%v, want nil/nil", record.RecordId, record.PendingDate, record.PostedDate)
				}
			} else if *record.Settlement != httpclient.SettlementStatusPosted || record.PostedDate == nil || !record.PostedDate.Equal(wantPostedDate) {
				t.Fatalf(
					"seeded balance record %d settlement/posted_date = %v/%v, want posted/initiated-date end-of-day %v",
					record.RecordId,
					record.Settlement,
					record.PostedDate,
					wantPostedDate,
				)
			}
			switch record.RecordRole {
			case httpclient.RecordRoleExpense:
				expenseAccounts[record.AccountId] = struct{}{}
				expenseCategories[*record.CategoryId] = struct{}{}
			case httpclient.RecordRoleRefund:
				refundCategories[*record.CategoryId] = struct{}{}
			case httpclient.RecordRoleClawback:
				hasClawbackRecord = true
			}
			accountType := accountTypes[record.AccountId]
			if (accountType == httpclient.AccountTypeOwned || accountType == httpclient.AccountTypeParty) && record.Amount[0] == '-' {
				hasClawbackOutflow = true
			}
			if accountType == httpclient.AccountTypeParty {
				signs := partySigns[record.AccountId]
				if signs == nil {
					signs = map[bool]struct{}{}
					partySigns[record.AccountId] = signs
				}
				signs[record.Amount[0] == '-'] = struct{}{}
			}
		}
		if transaction.TransactionClass == httpclient.TransactionClassSpend && len(expenseAccounts) >= 2 {
			hasMultiMerchantSpend = true
		}
		if transaction.TransactionClass == httpclient.TransactionClassClawback && hasClawbackRecord && hasClawbackOutflow {
			hasValidClawback = true
		}
	}
	wantEarliestDate := sixCalendarMonthsBefore(anchorDate)
	if !earliestDate.Equal(wantEarliestDate) {
		t.Fatalf("earliest seeded transaction date = %s, want %s", earliestDate.Format("2006-01-02"), wantEarliestDate.Format("2006-01-02"))
	}
	if !latestDate.Equal(anchorDate) {
		t.Fatalf("latest seeded transaction date = %s, want anchor %s", latestDate.Format("2006-01-02"), anchorDate.Format("2006-01-02"))
	}
	if !hasValidClawback {
		t.Fatal("seeded demo missing income clawback balanced by an owned or party outflow")
	}
	if !hasMultiMerchantSpend {
		t.Fatal("seeded demo missing multi-merchant spend")
	}
	hasNettedRefund := false
	for categoryID := range refundCategories {
		if _, ok := expenseCategories[categoryID]; ok {
			hasNettedRefund = true
			break
		}
	}
	if !hasNettedRefund {
		t.Fatal("seeded demo missing refund in a category also used for spending")
	}
	hasSwingingParty := false
	for _, signs := range partySigns {
		if len(signs) == 2 {
			hasSwingingParty = true
			break
		}
	}
	if !hasSwingingParty {
		t.Fatal("seeded demo missing party balance with records of both signs")
	}
}

func sixCalendarMonthsBefore(anchorDate time.Time) time.Time {
	year, month, day := anchorDate.Date()
	targetMonth := time.Date(year, month-6, 1, 0, 0, 0, 0, anchorDate.Location())
	targetMonthEnd := targetMonth.AddDate(0, 1, -1)
	if day > targetMonthEnd.Day() {
		day = targetMonthEnd.Day()
	}

	return time.Date(targetMonth.Year(), targetMonth.Month(), day, 0, 0, 0, 0, anchorDate.Location())
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
		checkingAccountID: accountIDByFQN(t, accounts.JSON200.Accounts, "bank:Chase:joint_checking"),
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
