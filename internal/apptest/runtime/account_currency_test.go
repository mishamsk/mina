package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestAccountCurrencyInvariantAcrossTransactionMutationBoundaries(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()
	single := scenario.AccountWithCurrency("checking:CurrencyInvariant:Single", "USD")
	multi := scenario.AccountWithType("checking:CurrencyInvariant:Multi", httpclient.WritableAccountTypeOwned)
	flow := scenario.AccountWithType("expense:CurrencyInvariant", httpclient.WritableAccountTypeFlow)
	category := scenario.Category("CurrencyInvariant")

	mismatched := accountCurrencyTransactionRequest(single.AccountId, flow.AccountId, category.CategoryId, "EUR", httpclient.WritableSourceManual)
	assertCurrencyWriteRejected(t, "ordinary create", func() (int, []byte, error) {
		response, err := client.REST().CreateTransactionWithResponse(context.Background(), mismatched)
		return response.StatusCode(), response.Body, err
	})

	imported := accountCurrencyTransactionRequest(single.AccountId, flow.AccountId, category.CategoryId, "EUR", httpclient.WritableSourceImported)
	assertCurrencyWriteRejected(t, "imported create", func() (int, []byte, error) {
		response, err := client.REST().CreateTransactionWithResponse(context.Background(), imported)
		return response.StatusCode(), response.Body, err
	})

	multiCurrency := accountCurrencyTransactionRequest(multi.AccountId, flow.AccountId, category.CategoryId, "EUR", httpclient.WritableSourceManual)
	created, err := client.REST().CreateTransactionWithResponse(context.Background(), multiCurrency)
	requireNoTransportError(t, "multi-currency create", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("multi-currency create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	usd := accountCurrencyTransactionRequest(single.AccountId, flow.AccountId, category.CategoryId, "USD", httpclient.WritableSourceManual)
	replaceTarget, err := client.REST().CreateTransactionWithResponse(context.Background(), usd)
	requireNoTransportError(t, "replace target create", err)
	if replaceTarget.StatusCode() != http.StatusCreated {
		t.Fatalf("replace target create status = %d, want %d; body %s", replaceTarget.StatusCode(), http.StatusCreated, replaceTarget.Body)
	}
	assertCurrencyWriteRejected(t, "ordinary replace", func() (int, []byte, error) {
		response, replaceErr := client.REST().ReplaceTransactionWithResponse(
			context.Background(),
			replaceTarget.JSON201.TransactionId,
			httpclient.UpdateTransactionRequest(mismatched),
		)
		return response.StatusCode(), response.Body, replaceErr
	})

	reassigned, err := client.REST().BulkReassignJournalRecordAccountWithResponse(
		context.Background(),
		httpclient.BulkReassignRecordsAccountRequest{
			AccountId: single.AccountId,
			RecordIds: []int64{created.JSON201.Records[0].RecordId},
		},
	)
	requireNoTransportError(t, "bulk reassign currency mismatch", err)
	if reassigned.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bulk reassign currency mismatch status = %d, want %d; body %s", reassigned.StatusCode(), http.StatusBadRequest, reassigned.Body)
	}
}

func TestAccountCurrencyInvariantAcrossDraftClassification(t *testing.T) {
	client := newSharedClient(t)
	account := client.Scenario().AccountWithCurrency("checking:CurrencyClassification", "USD")

	response, err := client.REST().ClassifyTransactionWithResponse(
		context.Background(),
		httpclient.ClassifyTransactionRequest{
			Records: []httpclient.ClassifyJournalRecordRequest{{
				AccountId: account.AccountId,
				Amount:    "-10.00",
				Currency:  "EUR",
			}},
		},
	)
	requireNoTransportError(t, "classify single-currency mismatch", err)
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("classify single-currency mismatch status = %d, want %d; body %s", response.StatusCode(), http.StatusBadRequest, response.Body)
	}
}

func TestAccountCurrencyInvariantAcrossOrdinaryShorthands(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()
	single := scenario.AccountWithCurrency("checking:CurrencyShorthand:Single", "USD")
	multi := scenario.AccountWithType("checking:CurrencyShorthand:Multi", httpclient.WritableAccountTypeOwned)
	flow := scenario.AccountWithType("expense:CurrencyShorthand", httpclient.WritableAccountTypeFlow)
	expense := scenario.Category("CurrencyShorthand:Expense")
	income := scenario.CategoryWithIntent("CurrencyShorthand:Income", httpclient.CategoryEconomicIntentIncome)
	date := apptest.Date("2024-06-01")

	cases := []struct {
		name string
		run  func() (int, []byte, error)
	}{
		{
			name: "spend",
			run: func() (int, []byte, error) {
				response, err := client.REST().CreateSpendTransactionWithResponse(context.Background(), httpclient.CreateSpendTransactionRequest{
					Amount:                "10.00",
					CategoryId:            expense.CategoryId,
					CounterpartyAccountId: flow.AccountId,
					Currency:              "EUR",
					FundingAccountId:      single.AccountId,
					InitiatedDate:         date,
				})
				return response.StatusCode(), response.Body, err
			},
		},
		{
			name: "income",
			run: func() (int, []byte, error) {
				response, err := client.REST().CreateIncomeTransactionWithResponse(context.Background(), httpclient.CreateIncomeTransactionRequest{
					Amount:               "10.00",
					CategoryId:           income.CategoryId,
					Currency:             "EUR",
					DestinationAccountId: single.AccountId,
					InitiatedDate:        date,
					SourceAccountId:      flow.AccountId,
				})
				return response.StatusCode(), response.Body, err
			},
		},
		{
			name: "refund",
			run: func() (int, []byte, error) {
				response, err := client.REST().CreateRefundTransactionWithResponse(context.Background(), httpclient.CreateRefundTransactionRequest{
					Amount:                "10.00",
					CategoryId:            expense.CategoryId,
					CounterpartyAccountId: flow.AccountId,
					Currency:              "EUR",
					DestinationAccountId:  single.AccountId,
					InitiatedDate:         date,
				})
				return response.StatusCode(), response.Body, err
			},
		},
		{
			name: "transfer",
			run: func() (int, []byte, error) {
				response, err := client.REST().CreateTransferTransactionWithResponse(context.Background(), httpclient.CreateTransferTransactionRequest{
					Amount:               "10.00",
					Currency:             "EUR",
					DestinationAccountId: multi.AccountId,
					InitiatedDate:        date,
					SourceAccountId:      single.AccountId,
				})
				return response.StatusCode(), response.Body, err
			},
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			assertCurrencyWriteRejected(t, testCase.name, testCase.run)
		})
	}
}

func accountCurrencyTransactionRequest(
	balanceAccountID int64,
	flowAccountID int64,
	categoryID int64,
	currency string,
	source httpclient.WritableSource,
) httpclient.CreateTransactionRequest {
	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-06-01"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            balanceAccountID,
				Amount:               "-10.00",
				Currency:             currency,
				Settlement:           apptest.PostedSettlement(),
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               source,
			},
			{
				AccountId:            flowAccountID,
				Amount:               "10.00",
				CategoryId:           &categoryID,
				Currency:             currency,
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               source,
			},
		},
	}
}

func assertCurrencyWriteRejected(
	t *testing.T,
	label string,
	run func() (int, []byte, error),
) {
	t.Helper()
	status, body, err := run()
	requireNoTransportError(t, label, err)
	if status != http.StatusBadRequest {
		t.Fatalf("%s status = %d, want %d; body %s", label, status, http.StatusBadRequest, body)
	}
}
