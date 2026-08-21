package runtime_test

import (
	"context"
	"net/http"
	"reflect"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestMigrationV13BackfillsTransactionUpdatedAt(t *testing.T) {
	client := apptest.NewFromMigrationFixture(t, 13)
	sortUpdated := httpclient.ListTransactionsParamsSortUpdatedAt
	sortAscending := httpclient.ListTransactionsParamsSortDirAsc

	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Sort:    &sortUpdated,
		SortDir: &sortAscending,
	})
	requireNoTransportError(t, "list migrated transactions", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list migrated transactions status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if response.JSON200.TotalCount != 2 {
		t.Fatalf("migrated transaction count = %d, want 2", response.JSON200.TotalCount)
	}
	assertTransactionIDs(t, response.JSON200.Transactions, []int64{100, 101})

	assertMigratedTransaction(t, response.JSON200.Transactions[0], migratedTransactionExpectation{
		createdAt:       time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
		initiatedDate:   "2026-01-01",
		lifecycleStatus: httpclient.TransactionLifecycleStatusCancelled,
		records: []migratedRecordExpectation{
			{id: 200, accountID: 5, amount: "10.00000000"},
			{id: 204, accountID: 6, amount: "-10.00000000"},
		},
		// The latest v13 nested update belongs to tombstoned record 201.
		updatedAt: time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC),
	})
	assertMigratedTransaction(t, response.JSON200.Transactions[1], migratedTransactionExpectation{
		createdAt:             time.Date(2026, 4, 5, 6, 7, 8, 0, time.UTC),
		initiatedDate:         "2026-02-01",
		lifecycleStatus:       httpclient.TransactionLifecycleStatusActive,
		recurringOccurrenceID: 303,
		records: []migratedRecordExpectation{
			{id: 202, accountID: 1, amount: "20.00000000"},
			{id: 203, accountID: 2, amount: "-20.00000000"},
		},
		updatedAt: time.Date(2026, 4, 5, 6, 7, 8, 0, time.UTC),
	})
}

func TestMigrationV17PreservesUTCInstantsAndCivilDates(t *testing.T) {
	client := apptest.NewFromMigrationFixture(t, 16)
	ctx := context.Background()

	account, err := client.REST().GetAccountWithResponse(ctx, 5, nil)
	requireClientResponse(t, "get migrated account", err, account.StatusCode(), http.StatusOK, account.Body)
	if got, want := account.JSON200.CreatedAt, apptest.Timestamp("2026-08-21T09:46:06.619705Z"); !got.Equal(want) {
		t.Fatalf("migrated account created_at = %s, want %s", got, want)
	}
	if !account.JSON200.UpdatedAt.Equal(account.JSON200.CreatedAt) {
		t.Fatalf("migrated account updated_at = %s, want created_at %s", account.JSON200.UpdatedAt, account.JSON200.CreatedAt)
	}

	rates, err := client.REST().ListExchangeRatesWithResponse(ctx, nil)
	requireClientResponse(t, "list migrated exchange rates", err, rates.StatusCode(), http.StatusOK, rates.Body)
	if rates.JSON200.TotalCount != 1 || len(rates.JSON200.ExchangeRates) != 1 {
		t.Fatalf("migrated exchange rates = total %d rows %d, want 1", rates.JSON200.TotalCount, len(rates.JSON200.ExchangeRates))
	}
	rate := rates.JSON200.ExchangeRates[0]
	if got, want := rate.EffectiveDate, apptest.Timestamp("2026-08-21T03:45:12.345678Z"); !got.Equal(want) {
		t.Fatalf("migrated exchange rate effective_date = %s, want %s", got, want)
	}
	if got, want := rate.CreatedAt, apptest.Timestamp("2026-08-21T09:46:18.579682Z"); !got.Equal(want) {
		t.Fatalf("migrated exchange rate created_at = %s, want %s", got, want)
	}

	transaction, err := client.REST().GetTransactionWithResponse(ctx, 8)
	requireClientResponse(t, "get migrated transaction", err, transaction.StatusCode(), http.StatusOK, transaction.Body)
	if got := transaction.JSON200.InitiatedDate.String(); got != "2026-08-20" {
		t.Fatalf("migrated transaction initiated_date = %s, want 2026-08-20", got)
	}
	if got, want := transaction.JSON200.CreatedAt, apptest.Timestamp("2026-08-21T09:46:18.794472Z"); !got.Equal(want) {
		t.Fatalf("migrated transaction created_at = %s, want %s", got, want)
	}
	if len(transaction.JSON200.Records) != 2 {
		t.Fatalf("migrated transaction record count = %d, want 2", len(transaction.JSON200.Records))
	}
	for _, record := range transaction.JSON200.Records {
		if record.PendingDate == nil || !record.PendingDate.Equal(apptest.Timestamp("2026-08-20T22:30:00.123456Z")) {
			t.Fatalf("migrated record %d pending_date = %v, want 2026-08-20T22:30:00.123456Z", record.RecordId, record.PendingDate)
		}
		if record.PostedDate == nil || !record.PostedDate.Equal(apptest.Timestamp("2026-08-20T23:45:00.654321Z")) {
			t.Fatalf("migrated record %d posted_date = %v, want 2026-08-20T23:45:00.654321Z", record.RecordId, record.PostedDate)
		}
	}

	creditLimit, err := client.REST().GetCreditLimitHistoryWithResponse(ctx, 11, nil)
	requireClientResponse(t, "get migrated credit limit", err, creditLimit.StatusCode(), http.StatusOK, creditLimit.Body)
	if got := creditLimit.JSON200.EffectiveDate.String(); got != "2026-08-20" {
		t.Fatalf("migrated credit limit effective_date = %s, want 2026-08-20", got)
	}
}

func TestV15FixtureRESTDataPreserved(t *testing.T) {
	const fixtureVersion = 15
	client := apptest.NewFromMigrationFixture(t, fixtureVersion)
	timestamp := apptest.Timestamp("2026-08-18T23:00:24.879352Z")

	rates, err := client.REST().ListExchangeRatesWithResponse(context.Background(), nil)
	requireClientResponse(t, "list migrated exchange rates", err, rates.StatusCode(), http.StatusOK, rates.Body)
	assertMigrationTableData(
		t,
		fixtureVersion,
		"exchange_rate",
		rates.JSON200.TotalCount,
		rates.JSON200.ExchangeRates,
		func(rate httpclient.ExchangeRate) int64 { return rate.ExchangeRateId },
		map[int64]httpclient.ExchangeRate{
			69: {CreatedAt: timestamp, EffectiveDate: time.Date(2026, time.June, 21, 0, 0, 0, 0, time.UTC), ExchangeRateId: 69, FromCurrency: "EUR", Rate: "1.08000000", ToCurrency: "USD"},
			70: {CreatedAt: timestamp, EffectiveDate: time.Date(2026, time.July, 5, 0, 0, 0, 0, time.UTC), ExchangeRateId: 70, FromCurrency: "EUR", Rate: "1.09000000", ToCurrency: "USD"},
			71: {CreatedAt: timestamp, EffectiveDate: time.Date(2026, time.July, 26, 0, 0, 0, 0, time.UTC), ExchangeRateId: 71, FromCurrency: "EUR", Rate: "1.10000000", ToCurrency: "USD"},
			72: {CreatedAt: timestamp, EffectiveDate: time.Date(2026, time.August, 9, 0, 0, 0, 0, time.UTC), ExchangeRateId: 72, FromCurrency: "EUR", Rate: "1.12000000", ToCurrency: "USD"},
			73: {CreatedAt: timestamp, EffectiveDate: time.Date(2026, time.June, 28, 0, 0, 0, 0, time.UTC), ExchangeRateId: 73, FromCurrency: "JPY", Rate: "0.00670000", ToCurrency: "USD"},
			74: {CreatedAt: timestamp, EffectiveDate: time.Date(2026, time.August, 2, 0, 0, 0, 0, time.UTC), ExchangeRateId: 74, FromCurrency: "JPY", Rate: "0.00680000", ToCurrency: "USD"},
		},
	)

	occurrences := listRecurringOccurrences(t, client, nil)
	assertMigrationTableData(
		t,
		fixtureVersion,
		"recurring_occurrence",
		occurrences.JSON200.TotalCount,
		occurrences.JSON200.RecurringOccurrences,
		func(occurrence httpclient.RecurringOccurrence) int64 { return occurrence.RecurringOccurrenceId },
		map[int64]httpclient.RecurringOccurrence{
			293: {CreatedAt: timestamp, GeneratedTransactionId: apptest.Int64Ptr(294), MaterializedAt: timestamp, MaterializedDefinitionVersion: 1, RecurringDefinitionFqn: "Household:Mortgage", RecurringDefinitionId: 278, RecurringOccurrenceId: 293, ScheduledDate: apptest.Date("2026-07-23"), Status: httpclient.RecurringOccurrenceStatusExpected, UpdatedAt: timestamp},
			300: {CreatedAt: timestamp, GeneratedTransactionId: apptest.Int64Ptr(301), MaterializedAt: timestamp, MaterializedDefinitionVersion: 1, RecurringDefinitionFqn: "Subscriptions:Netflix", RecurringDefinitionId: 284, RecurringOccurrenceId: 300, ScheduledDate: apptest.Date("2026-07-28"), Status: httpclient.RecurringOccurrenceStatusExpected, UpdatedAt: timestamp},
			304: {CreatedAt: timestamp, GeneratedTransactionId: apptest.Int64Ptr(305), MaterializedAt: timestamp, MaterializedDefinitionVersion: 1, RecurringDefinitionFqn: "Savings:WeeklyTransfer", RecurringDefinitionId: 287, RecurringOccurrenceId: 304, ScheduledDate: apptest.Date("2026-07-20"), Status: httpclient.RecurringOccurrenceStatusExpected, UpdatedAt: timestamp},
			308: {CreatedAt: timestamp, GeneratedTransactionId: apptest.Int64Ptr(309), MaterializedAt: timestamp, MaterializedDefinitionVersion: 1, RecurringDefinitionFqn: "Savings:WeeklyTransfer", RecurringDefinitionId: 287, RecurringOccurrenceId: 308, ScheduledDate: apptest.Date("2026-07-27"), Status: httpclient.RecurringOccurrenceStatusExpected, UpdatedAt: timestamp},
			312: {CreatedAt: timestamp, GeneratedTransactionId: apptest.Int64Ptr(313), MaterializedAt: timestamp, MaterializedDefinitionVersion: 1, RecurringDefinitionFqn: "Savings:WeeklyTransfer", RecurringDefinitionId: 287, RecurringOccurrenceId: 312, ScheduledDate: apptest.Date("2026-08-03"), Status: httpclient.RecurringOccurrenceStatusExpected, UpdatedAt: timestamp},
			316: {CreatedAt: timestamp, GeneratedTransactionId: apptest.Int64Ptr(317), MaterializedAt: timestamp, MaterializedDefinitionVersion: 1, RecurringDefinitionFqn: "Savings:WeeklyTransfer", RecurringDefinitionId: 287, RecurringOccurrenceId: 316, ScheduledDate: apptest.Date("2026-08-10"), Status: httpclient.RecurringOccurrenceStatusExpected, UpdatedAt: timestamp},
			320: {CreatedAt: timestamp, GeneratedTransactionId: apptest.Int64Ptr(321), MaterializedAt: timestamp, MaterializedDefinitionVersion: 1, RecurringDefinitionFqn: "Savings:WeeklyTransfer", RecurringDefinitionId: 287, RecurringOccurrenceId: 320, ScheduledDate: apptest.Date("2026-08-17"), Status: httpclient.RecurringOccurrenceStatusExpected, UpdatedAt: timestamp},
			324: {CreatedAt: timestamp, GeneratedTransactionId: apptest.Int64Ptr(325), MaterializedAt: timestamp, MaterializedDefinitionVersion: 1, RecurringDefinitionFqn: "Debt:CreditCardPayment", RecurringDefinitionId: 290, RecurringOccurrenceId: 324, ScheduledDate: apptest.Date("2026-07-30"), Status: httpclient.RecurringOccurrenceStatusExpected, UpdatedAt: timestamp},
		},
	)
	assertMigratedRecurringRelationships(t, fixtureVersion, client, occurrences.JSON200.RecurringOccurrences)
}

func assertMigrationTableData[T any](t *testing.T, fixtureVersion int, table string, totalCount int64, rows []T, identity func(T) int64, want map[int64]T) {
	t.Helper()
	if totalCount != int64(len(want)) || len(rows) != len(want) {
		t.Fatalf("v%d migrated %s count = total %d rows %d, want %d", fixtureVersion, table, totalCount, len(rows), len(want))
	}

	seen := make(map[int64]struct{}, len(rows))
	for _, row := range rows {
		id := identity(row)
		expected, ok := want[id]
		if !ok {
			t.Fatalf("v%d migrated %s has unexpected row %d: %#v", fixtureVersion, table, id, row)
		}
		if _, duplicate := seen[id]; duplicate {
			t.Fatalf("v%d migrated %s repeats row %d", fixtureVersion, table, id)
		}
		if !reflect.DeepEqual(row, expected) {
			t.Fatalf("v%d migrated %s row %d = %#v, want %#v", fixtureVersion, table, id, row, expected)
		}
		seen[id] = struct{}{}
	}
}

func assertMigratedRecurringRelationships(t *testing.T, fixtureVersion int, client *apptest.Client, occurrences []httpclient.RecurringOccurrence) {
	t.Helper()
	for _, occurrence := range occurrences {
		definition := getRecurringDefinition(t, client, occurrence.RecurringDefinitionId).JSON200
		if definition.Fqn != occurrence.RecurringDefinitionFqn || definition.DefinitionVersion != occurrence.MaterializedDefinitionVersion || len(definition.Records) == 0 {
			t.Fatalf("v%d migrated recurring definition %d = %+v, want fqn %q, version %d, and preserved records", fixtureVersion, occurrence.RecurringDefinitionId, definition, occurrence.RecurringDefinitionFqn, occurrence.MaterializedDefinitionVersion)
		}
		if occurrence.GeneratedTransactionId == nil {
			t.Fatalf("v%d migrated recurring occurrence %d has no generated transaction", fixtureVersion, occurrence.RecurringOccurrenceId)
		}
		generated := getTransaction(t, client, *occurrence.GeneratedTransactionId).JSON200
		if generated.RecurringOccurrenceId == nil || *generated.RecurringOccurrenceId != occurrence.RecurringOccurrenceId {
			t.Fatalf("v%d generated transaction %d recurring_occurrence_id = %v, want %d", fixtureVersion, *occurrence.GeneratedTransactionId, generated.RecurringOccurrenceId, occurrence.RecurringOccurrenceId)
		}
	}
}

type migratedTransactionExpectation struct {
	createdAt             time.Time
	initiatedDate         string
	lifecycleStatus       httpclient.TransactionLifecycleStatus
	recurringOccurrenceID int64
	records               []migratedRecordExpectation
	updatedAt             time.Time
}

type migratedRecordExpectation struct {
	id        int64
	accountID int64
	amount    string
}

func assertMigratedTransaction(t *testing.T, transaction httpclient.Transaction, want migratedTransactionExpectation) {
	t.Helper()
	if !transaction.CreatedAt.Equal(want.createdAt) {
		t.Fatalf("transaction %d created_at = %s, want %s", transaction.TransactionId, transaction.CreatedAt, want.createdAt)
	}
	if transaction.InitiatedDate.String() != want.initiatedDate {
		t.Fatalf("transaction %d initiated_date = %s, want %s", transaction.TransactionId, transaction.InitiatedDate, want.initiatedDate)
	}
	if transaction.LifecycleStatus != want.lifecycleStatus {
		t.Fatalf("transaction %d lifecycle_status = %s, want %s", transaction.TransactionId, transaction.LifecycleStatus, want.lifecycleStatus)
	}
	if (transaction.RecurringOccurrenceId == nil && want.recurringOccurrenceID != 0) ||
		(transaction.RecurringOccurrenceId != nil && *transaction.RecurringOccurrenceId != want.recurringOccurrenceID) {
		t.Fatalf("transaction %d recurring_occurrence_id = %v, want %d", transaction.TransactionId, transaction.RecurringOccurrenceId, want.recurringOccurrenceID)
	}
	if !transaction.UpdatedAt.Equal(want.updatedAt) {
		t.Fatalf("transaction %d updated_at = %s, want %s", transaction.TransactionId, transaction.UpdatedAt, want.updatedAt)
	}
	if len(transaction.Records) != len(want.records) {
		t.Fatalf("transaction %d record count = %d, want %d", transaction.TransactionId, len(transaction.Records), len(want.records))
	}
	for index, record := range transaction.Records {
		expected := want.records[index]
		if record.RecordId != expected.id || record.AccountId != expected.accountID || record.Amount != expected.amount || record.Currency != "USD" {
			t.Fatalf("transaction %d record %d = %+v, want id=%d account_id=%d amount=%s currency=USD", transaction.TransactionId, index, record, expected.id, expected.accountID, expected.amount)
		}
	}
}
