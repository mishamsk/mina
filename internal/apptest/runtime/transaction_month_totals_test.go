package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionMonthTotalsBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)
	scenario := client.Scenario()

	createMonthTotalsTransaction(t, client, "2024-06-03",
		record(fixture.checking.AccountId, fixture.expenseCategory.CategoryId, "USD", "-100.00"),
		record(fixture.merchant.AccountId, fixture.expenseCategory.CategoryId, "USD", "100.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-06-04",
		record(fixture.checking.AccountId, fixture.feeCategory.CategoryId, "USD", "-5.00"),
		record(fixture.feeProvider.AccountId, fixture.feeCategory.CategoryId, "USD", "5.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-06-05",
		record(fixture.checking.AccountId, fixture.refundCategory.CategoryId, "USD", "20.00"),
		record(fixture.merchant.AccountId, fixture.refundCategory.CategoryId, "USD", "-20.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-06-06",
		record(fixture.checking.AccountId, fixture.incomeCategory.CategoryId, "USD", "200.00"),
		record(fixture.employer.AccountId, fixture.incomeCategory.CategoryId, "USD", "-200.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-06-07",
		record(fixture.checking.AccountId, fixture.transferCategory.CategoryId, "USD", "-50.00"),
		record(fixture.savings.AccountId, fixture.transferCategory.CategoryId, "USD", "50.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-06-08",
		record(fixture.checking.AccountId, fixture.exchangeCategory.CategoryId, "USD", "-110.00"),
		record(fixture.exchangeProvider.AccountId, fixture.exchangeCategory.CategoryId, "USD", "110.00"),
		record(fixture.exchangeProvider.AccountId, fixture.exchangeCategory.CategoryId, "EUR", "-100.00"),
		record(fixture.cashEUR.AccountId, fixture.exchangeCategory.CategoryId, "EUR", "100.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-06-08",
		record(fixture.checking.AccountId, fixture.transferCategory.CategoryId, "USD", "-25.00"),
		record(fixture.savings.AccountId, fixture.transferCategory.CategoryId, "USD", "25.00"),
		record(fixture.checking.AccountId, fixture.feeCategory.CategoryId, "USD", "-1.00"),
		record(fixture.feeProvider.AccountId, fixture.feeCategory.CategoryId, "USD", "1.00"),
	)

	createExchangeRate(t, client, "USD", "EUR", "1.10000000", "2024-06-09T00:00:00Z")
	createMonthTotalsTransaction(t, client, "2024-06-09",
		record(fixture.cashEUR.AccountId, fixture.expenseCategory.CategoryId, "EUR", "-11.00"),
		record(fixture.merchant.AccountId, fixture.expenseCategory.CategoryId, "EUR", "11.00"),
	)

	cryptoCash := scenario.AccountWithCurrency("crypto:MonthTotals:BTC", "C::BTC")
	cryptoMerchant := scenario.Account("merchant:MonthTotals:Crypto")
	createMonthTotalsTransaction(t, client, "2024-06-10",
		record(cryptoCash.AccountId, fixture.expenseCategory.CategoryId, "C::BTC", "-1.00"),
		record(cryptoMerchant.AccountId, fixture.expenseCategory.CategoryId, "C::BTC", "1.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-06-11",
		record(cryptoCash.AccountId, fixture.incomeCategory.CategoryId, "C::BTC", "2.00"),
		record(cryptoMerchant.AccountId, fixture.incomeCategory.CategoryId, "C::BTC", "-2.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-06-12",
		record(fixture.checking.AccountId, fixture.adjustmentCategory.CategoryId, "USD", "40.00"),
		record(fixture.openingSystem.AccountId, fixture.adjustmentCategory.CategoryId, "USD", "-40.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-06-13",
		record(fixture.checking.AccountId, fixture.fxCategory.CategoryId, "USD", "3.00"),
		record(fixture.fxSystem.AccountId, fixture.fxCategory.CategoryId, "USD", "-3.00"),
	)
	createMonthTotalsTransaction(t, client, "2024-05-31",
		record(fixture.checking.AccountId, fixture.expenseCategory.CategoryId, "USD", "-999.00"),
		record(fixture.merchant.AccountId, fixture.expenseCategory.CategoryId, "USD", "999.00"),
	)
	cancelled := createMonthTotalsTransaction(t, client, "2024-06-14",
		record(fixture.checking.AccountId, fixture.expenseCategory.CategoryId, "USD", "-300.00"),
		record(fixture.merchant.AccountId, fixture.expenseCategory.CategoryId, "USD", "300.00"),
	)
	cancelTransactionRecords(t, client, cancelled)
	deleted := createMonthTotalsTransaction(t, client, "2024-06-15",
		record(fixture.checking.AccountId, fixture.expenseCategory.CategoryId, "USD", "-400.00"),
		record(fixture.merchant.AccountId, fixture.expenseCategory.CategoryId, "USD", "400.00"),
	)
	deleteTransaction(t, client, deleted.TransactionId)

	june, err := client.REST().GetTransactionMonthTotalsWithResponse(context.Background(), &httpclient.GetTransactionMonthTotalsParams{Month: "2024-06"})
	if err != nil {
		t.Fatalf("month totals request: %v", err)
	}
	if june.StatusCode() != http.StatusOK {
		t.Fatalf("month totals status = %d, want %d; body %s", june.StatusCode(), http.StatusOK, june.Body)
	}
	if june.JSON200.Month != "2024-06" {
		t.Fatalf("month = %q, want 2024-06", june.JSON200.Month)
	}
	assertMonthTotal(t, "spend", june.JSON200.Spend, "116.00000000", 1)
	assertMonthTotal(t, "income", june.JSON200.Income, "200.00000000", 1)

	july, err := client.REST().GetTransactionMonthTotalsWithResponse(context.Background(), &httpclient.GetTransactionMonthTotalsParams{Month: "2024-07"})
	if err != nil {
		t.Fatalf("empty month totals request: %v", err)
	}
	if july.StatusCode() != http.StatusOK {
		t.Fatalf("empty month totals status = %d, want %d; body %s", july.StatusCode(), http.StatusOK, july.Body)
	}
	assertMonthTotal(t, "empty spend", july.JSON200.Spend, "0.00000000", 0)
	assertMonthTotal(t, "empty income", july.JSON200.Income, "0.00000000", 0)
}

func TestTransactionMonthTotalsRejectsInvalidMonth(t *testing.T) {
	client := newSharedClient(t)

	response, err := client.REST().GetTransactionMonthTotalsWithResponse(context.Background(), &httpclient.GetTransactionMonthTotalsParams{Month: "2024-13"})
	if err != nil {
		t.Fatalf("invalid month totals request: %v", err)
	}
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid month status = %d, want %d; body %s", response.StatusCode(), http.StatusBadRequest, response.Body)
	}
	if response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid month code = %q, want %q", response.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
}

func createMonthTotalsTransaction(t *testing.T, client *apptest.Client, date string, records ...httpclient.CreateJournalRecordRequest) httpclient.Transaction {
	t.Helper()

	request := classificationRequest(records...)
	request.InitiatedDate = apptest.Date(date)
	response, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create month totals transaction request: %v", err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create month totals transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func cancelTransactionRecords(t *testing.T, client *apptest.Client, transaction httpclient.Transaction) {
	t.Helper()

	recordIDs := make([]int64, 0, len(transaction.Records))
	for _, record := range transaction.Records {
		recordIDs = append(recordIDs, record.RecordId)
	}
	postingStatus := httpclient.Cancelled
	response, err := client.REST().BulkUpdateJournalRecordStatusesWithResponse(context.Background(), httpclient.BulkUpdateRecordStatusRequest{
		RecordIds:     recordIDs,
		PostingStatus: &postingStatus,
	})
	if err != nil {
		t.Fatalf("cancel month totals transaction records request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("cancel month totals transaction records status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
}

func deleteTransaction(t *testing.T, client *apptest.Client, transactionID int64) {
	t.Helper()

	response, err := client.REST().DeleteTransactionWithResponse(context.Background(), transactionID)
	if err != nil {
		t.Fatalf("delete month totals transaction request: %v", err)
	}
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete month totals transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}

func assertMonthTotal(t *testing.T, label string, got httpclient.TransactionMonthTotal, wantAmountUSD string, wantUnconverted int64) {
	t.Helper()

	if got.AmountUsd != wantAmountUSD {
		t.Fatalf("%s amount_usd = %q, want %q", label, got.AmountUsd, wantAmountUSD)
	}
	if got.UnconvertedCount != wantUnconverted {
		t.Fatalf("%s unconverted_count = %d, want %d", label, got.UnconvertedCount, wantUnconverted)
	}
}
