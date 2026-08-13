package runtime_test

import (
	"context"
	"net/http"
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
