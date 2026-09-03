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
		lifecycleStatus: httpclient.Cancelled,
		records: []migratedRecordExpectation{
			{id: 200, accountID: 5, amount: "10.00000000"},
			{id: 204, accountID: 6, amount: "-10.00000000"},
		},
		// The latest v13 nested update belongs to tombstoned record 201.
		updatedAt: time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC),
	})
	assertMigratedTransaction(t, response.JSON200.Transactions[1], migratedTransactionExpectation{
		createdAt:       time.Date(2026, 4, 5, 6, 7, 8, 0, time.UTC),
		initiatedDate:   "2026-02-01",
		lifecycleStatus: httpclient.Active,
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

	transaction, err := client.REST().GetTransactionWithResponse(ctx, 8, nil)
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

func TestMigrationV18PreservesCategoryAndTagRowsWithAutomaticLabels(t *testing.T) {
	client := apptest.NewFromMigrationFixture(t, 17)
	ctx := context.Background()

	categories, err := client.REST().ListCategoriesWithResponse(ctx, nil)
	requireClientResponse(t, "list v18 migrated categories", err, categories.StatusCode(), http.StatusOK, categories.Body)
	if categories.JSON200.TotalCount != 1 || len(categories.JSON200.Categories) != 1 {
		t.Fatalf("migrated categories = total %d rows %d, want 1", categories.JSON200.TotalCount, len(categories.JSON200.Categories))
	}
	category := categories.JSON200.Categories[0]
	if category.Fqn != "Household:Food:Groceries" || category.DisplayLabel != "Food:Groceries" || category.DisplayLabelOverride != nil {
		t.Fatalf("migrated category = %+v", category)
	}

	tags, err := client.REST().ListTagsWithResponse(ctx, nil)
	requireClientResponse(t, "list v18 migrated tags", err, tags.StatusCode(), http.StatusOK, tags.Body)
	if tags.JSON200.TotalCount != 1 || len(tags.JSON200.Tags) != 1 {
		t.Fatalf("migrated tags = total %d rows %d, want 1", tags.JSON200.TotalCount, len(tags.JSON200.Tags))
	}
	tag := tags.JSON200.Tags[0]
	if tag.Fqn != "Household:Routine:Weekly" || tag.DisplayLabel != "Routine:Weekly" || tag.DisplayLabelOverride != nil {
		t.Fatalf("migrated tag = %+v", tag)
	}
}

func TestMigrationV19ReplacesRecurringStateWithNextSlotAnchors(t *testing.T) {
	client := apptest.NewFromMigrationFixture(t, 18)
	ctx := context.Background()
	definitions, err := client.REST().ListRecurringDefinitionsWithResponse(ctx, nil)
	requireClientResponse(t, "list v19 migrated recurring definitions", err, definitions.StatusCode(), http.StatusOK, definitions.Body)
	wantAnchors := map[int64]string{
		8:   "2026-09-16",
		15:  "2026-09-09",
		30:  "2026-10-02",
		37:  "2026-09-15",
		44:  "2026-09-17",
		48:  "2026-09-09",
		55:  "2026-09-30",
		90:  "2026-10-02",
		127: "2026-09-30",
		142: "2026-09-30",
		153: "9999-12-31",
	}
	if len(definitions.JSON200.RecurringDefinitions) != len(wantAnchors) {
		t.Fatalf("v19 migrated recurring definition count = %d, want %d", len(definitions.JSON200.RecurringDefinitions), len(wantAnchors))
	}
	for _, definition := range definitions.JSON200.RecurringDefinitions {
		want, ok := wantAnchors[definition.RecurringDefinitionId]
		if !ok {
			t.Fatalf("v19 migrated unexpected recurring definition: %+v", definition)
		}
		if got := definition.AnchorDate.Format("2006-01-02"); got != want {
			t.Fatalf("v19 migrated definition %d anchor = %s, want %s", definition.RecurringDefinitionId, got, want)
		}
		if len(definition.Records) != 2 {
			t.Fatalf("v19 migrated definition %d records = %d, want 2", definition.RecurringDefinitionId, len(definition.Records))
		}
		if definition.RecurringDefinitionId == 48 && definition.PausedAt == nil {
			t.Fatalf("v19 migrated definition 48 paused_at = nil, want preserved pause state")
		}
	}

	preserved := map[int64]int64{
		12:  8,
		21:  15,
		22:  15,
		23:  15,
		34:  30,
		52:  48,
		66:  55,
		67:  55,
		68:  55,
		69:  55,
		70:  55,
		71:  55,
		72:  55,
		73:  55,
		101: 90,
		102: 90,
		103: 90,
		104: 90,
		105: 90,
		106: 90,
		107: 90,
		108: 90,
		133: 90,
		134: 127,
		135: 127,
		147: 142,
		148: 142,
		157: 153,
	}
	for transactionID, definitionID := range preserved {
		transaction := getTransaction(t, client, transactionID).JSON200
		if transaction.RecurringDefinitionId == nil || *transaction.RecurringDefinitionId != definitionID || transaction.RecurringDefinitionFqn == nil || transaction.RecurringDefinitionActive == nil || !*transaction.RecurringDefinitionActive {
			t.Fatalf("v19 migrated transaction %d provenance = id:%v fqn:%v active:%v, want active definition %d", transactionID, transaction.RecurringDefinitionId, transaction.RecurringDefinitionFqn, transaction.RecurringDefinitionActive, definitionID)
		}
		if len(transaction.Records) != 2 {
			t.Fatalf("v19 migrated transaction %d records = %d, want 2", transactionID, len(transaction.Records))
		}
		for _, record := range transaction.Records {
			if record.Amount != "-10.00000000" && record.Amount != "10.00000000" || record.ReconciliationStatus != httpclient.Reconciled || record.Source != httpclient.RecurringTemplate {
				t.Fatalf("v19 migrated transaction %d record = %+v, want preserved reconciled accounting data", transactionID, record)
			}
		}
	}
	includeTombstoned := true
	dismissed, err := client.REST().GetTransactionWithResponse(ctx, 41, &httpclient.GetTransactionParams{IncludeTombstoned: &includeTombstoned})
	requireClientResponse(t, "get v19 migrated dismissed transaction", err, dismissed.StatusCode(), http.StatusOK, dismissed.Body)
	if dismissed.JSON200.TombstonedAt == nil || dismissed.JSON200.LifecycleStatus != httpclient.Expected {
		t.Fatalf("v19 migrated dismissed transaction state = tombstoned:%v lifecycle:%q, want tombstoned expected", dismissed.JSON200.TombstonedAt, dismissed.JSON200.LifecycleStatus)
	}
	if dismissed.JSON200.RecurringDefinitionId == nil || *dismissed.JSON200.RecurringDefinitionId != 37 || dismissed.JSON200.RecurringDefinitionFqn == nil || dismissed.JSON200.RecurringDefinitionActive == nil || !*dismissed.JSON200.RecurringDefinitionActive {
		t.Fatalf("v19 migrated dismissed transaction provenance = id:%v fqn:%v active:%v, want active definition 37", dismissed.JSON200.RecurringDefinitionId, dismissed.JSON200.RecurringDefinitionFqn, dismissed.JSON200.RecurringDefinitionActive)
	}
	if len(dismissed.JSON200.Records) != 2 {
		t.Fatalf("v19 migrated dismissed transaction records = %d, want 2", len(dismissed.JSON200.Records))
	}
	for index, record := range dismissed.JSON200.Records {
		if record.RecordId != int64(42+index) || record.TombstonedAt == nil || record.ReconciliationStatus != httpclient.Reconciled || record.Source != httpclient.RecurringTemplate || record.Amount != "-10.00000000" && record.Amount != "10.00000000" {
			t.Fatalf("v19 migrated dismissed transaction record %d = %+v, want tombstoned preserved recurring accounting data", index, record)
		}
	}
	if got := getTransaction(t, client, 12).JSON200; got.LifecycleStatus != httpclient.Active || got.InitiatedDate.Format("2006-01-02") != "2026-09-02" {
		t.Fatalf("v19 occupied-anchor transaction identity changed: %+v", got)
	}
	if got := getTransaction(t, client, 34).JSON200; got.LifecycleStatus != httpclient.Active {
		t.Fatalf("v19 confirmed transaction lifecycle = %q, want active", got.LifecycleStatus)
	}
	if got := getTransaction(t, client, 21).JSON200; got.LifecycleStatus != httpclient.Cancelled {
		t.Fatalf("v19 cancelled transaction lifecycle = %q, want cancelled", got.LifecycleStatus)
	}
	if got := getTransaction(t, client, 22).JSON200; got.LifecycleStatus != httpclient.Expected {
		t.Fatalf("v19 expected transaction lifecycle = %q, want expected", got.LifecycleStatus)
	}

	manual := getTransaction(t, client, 160).JSON200
	if len(manual.Records) != 2 {
		t.Fatalf("v19 migrated manual transaction records = %d, want 2", len(manual.Records))
	}
	for _, record := range manual.Records {
		if record.Source != httpclient.Manual || record.ReconciliationStatus != httpclient.Unreconciled {
			t.Fatalf("v19 migrated manual record = %+v, want manual unreconciled", record)
		}
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

	generated := map[int64]int64{294: 278, 301: 284, 305: 287, 309: 287, 313: 287, 317: 287, 321: 287, 325: 290}
	for transactionID, definitionID := range generated {
		transaction := getTransaction(t, client, transactionID).JSON200
		if transaction.RecurringDefinitionId == nil || *transaction.RecurringDefinitionId != definitionID || transaction.RecurringDefinitionFqn == nil || transaction.RecurringDefinitionActive == nil || !*transaction.RecurringDefinitionActive {
			t.Fatalf("v%d generated transaction %d provenance = id:%v fqn:%v active:%v, want active definition %d", fixtureVersion, transactionID, transaction.RecurringDefinitionId, transaction.RecurringDefinitionFqn, transaction.RecurringDefinitionActive, definitionID)
		}
		for _, record := range transaction.Records {
			if record.ReconciliationStatus != httpclient.Reconciled {
				t.Fatalf("v%d generated transaction %d record %d reconciliation = %q, want reconciled", fixtureVersion, transactionID, record.RecordId, record.ReconciliationStatus)
			}
		}
	}
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

type migratedTransactionExpectation struct {
	createdAt       time.Time
	initiatedDate   string
	lifecycleStatus httpclient.TransactionLifecycleStatus
	records         []migratedRecordExpectation
	updatedAt       time.Time
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
