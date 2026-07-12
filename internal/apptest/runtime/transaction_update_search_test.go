package runtime_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionReplaceBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	oldRecordIDs := recordIDs(created.JSON201.Records)

	replacement := replacementTransactionRequest(refs)
	updated, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, replacement)
	requireNoTransportError(t, "replace transaction", err)
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("replace status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}
	if updated.JSON200.TransactionId != created.JSON201.TransactionId {
		t.Fatalf("replaced transaction id = %d, want %d", updated.JSON200.TransactionId, created.JSON201.TransactionId)
	}
	if updated.JSON200.InitiatedDate.String() != "2024-03-12" {
		t.Fatalf("replaced initiated_date = %q, want 2024-03-12", updated.JSON200.InitiatedDate)
	}
	if len(updated.JSON200.Records) != 2 {
		t.Fatalf("replaced record count = %d, want 2; body %+v", len(updated.JSON200.Records), updated.JSON200)
	}
	assertNoRecordIDs(t, updated.JSON200.Records, oldRecordIDs)

	search, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "search records", err)
	if search.StatusCode() != http.StatusOK {
		t.Fatalf("record search status = %d, want %d; body %s", search.StatusCode(), http.StatusOK, search.Body)
	}
	assertRecordIDs(t, search.JSON200.Records, recordIDs(updated.JSON200.Records))

	amountUnbalanced := replacementTransactionRequest(refs)
	amountUnbalanced.Records[1].Amount = "19.00"
	rejected, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, amountUnbalanced)
	requireNoTransportError(t, "replace transaction", err)
	if rejected.StatusCode() != http.StatusBadRequest {
		t.Fatalf("amount-unbalanced replace status = %d, want %d; body %s", rejected.StatusCode(), http.StatusBadRequest, rejected.Body)
	}

	readAfterRejected, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "get transaction", err)
	if readAfterRejected.StatusCode() != http.StatusOK {
		t.Fatalf("read after amount-unbalanced replace status = %d, want %d; body %s", readAfterRejected.StatusCode(), http.StatusOK, readAfterRejected.Body)
	}
	assertRecordIDs(t, readAfterRejected.JSON200.Records, recordIDs(updated.JSON200.Records))

	usdUnbalanced := replacementTransactionRequest(refs)
	usdUnbalanced.Records[0].AmountUsd = nil
	usdUnbalanced.Records[1].AmountUsd = apptest.StringPtr("19.00")
	usdUpdated, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, usdUnbalanced)
	requireNoTransportError(t, "replace transaction", err)
	if usdUpdated.StatusCode() != http.StatusOK {
		t.Fatalf("usd-unbalanced replace status = %d, want %d; body %s", usdUpdated.StatusCode(), http.StatusOK, usdUpdated.Body)
	}

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "get transaction", err)
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read after usd-unbalanced replace status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.Records[0].AmountUsd == nil || *read.JSON200.Records[0].AmountUsd != "-20.00000000" {
		t.Fatalf("first amount_usd after replace = %v, want -20.00000000", read.JSON200.Records[0].AmountUsd)
	}
	if read.JSON200.Records[1].AmountUsd == nil || *read.JSON200.Records[1].AmountUsd != "19.00000000" {
		t.Fatalf("second amount_usd after replace = %v, want 19.00000000", read.JSON200.Records[1].AmountUsd)
	}
}

func TestTransactionReplaceInfersMissingNonUSDAmountUSD(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	createExchangeRate(t, client, "USD", "EUR", "1.10000000", "2024-03-12T00:00:00Z")
	eurCash := client.Scenario().AccountWithCurrency("cash:Replace:EUR", "EUR")
	eurMerchant := client.Scenario().Account("merchant:Replace:EuroCoffee")
	replacement := httpclient.UpdateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-12"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            eurCash.AccountId,
				Currency:             "EUR",
				Amount:               "-11.00",
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
			{
				AccountId:            eurMerchant.AccountId,
				Currency:             "EUR",
				Amount:               "11.00",
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
		},
	}

	replaced, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, replacement)
	requireNoTransportError(t, "replace transaction", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	assertRecordAmountUSD(t, *replaced.JSON200, eurCash.AccountId, "-10.00000000")
	assertRecordAmountUSD(t, *replaced.JSON200, eurMerchant.AccountId, "10.00000000")
}

func TestTransactionDeleteTombstonesRecordsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	deleted, err := client.REST().DeleteTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "delete transaction", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "get transaction", err)
	if read.StatusCode() != http.StatusNotFound {
		t.Fatalf("read tombstoned transaction status = %d, want %d; body %s", read.StatusCode(), http.StatusNotFound, read.Body)
	}

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "list transactions", err)
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 0 {
		t.Fatalf("transaction count after delete = %d, want 0; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}

	records, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "search records", err)
	if records.StatusCode() != http.StatusOK {
		t.Fatalf("record search status = %d, want %d; body %s", records.StatusCode(), http.StatusOK, records.Body)
	}
	if len(records.JSON200.Records) != 0 {
		t.Fatalf("record count after delete = %d, want 0; body %+v", len(records.JSON200.Records), records.JSON200)
	}

	secondDelete, err := client.REST().DeleteTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "delete transaction", err)
	if secondDelete.StatusCode() != http.StatusNotFound {
		t.Fatalf("second delete status = %d, want %d; body %s", secondDelete.StatusCode(), http.StatusNotFound, secondDelete.Body)
	}
}

func TestTransactionCancelBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	request := balancedTransactionRequest(refs)
	request.Records[0].PostingStatus = httpclient.PostingStatusPending
	request.Records[0].ReconciliationStatus = httpclient.Unreconciled
	request.Records[1].PostingStatus = httpclient.PostingStatusPosted
	created, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	requireNoTransportError(t, "create transaction to cancel", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create transaction to cancel status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	cancelled, err := client.REST().CancelTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "cancel transaction", err)
	if cancelled.StatusCode() != http.StatusOK {
		t.Fatalf("cancel transaction status = %d, want %d; body %s", cancelled.StatusCode(), http.StatusOK, cancelled.Body)
	}
	assertTransactionRecordPostingStatuses(t, cancelled.JSON200.Records, httpclient.PostingStatusCancelled)
	assertTransactionCancelPreservedFields(t, created.JSON201.Records, cancelled.JSON200.Records)

	repeated, err := client.REST().CancelTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "repeat cancel transaction", err)
	if repeated.StatusCode() != http.StatusOK {
		t.Fatalf("repeat cancel transaction status = %d, want %d; body %s", repeated.StatusCode(), http.StatusOK, repeated.Body)
	}
	assertTransactionRecordPostingStatuses(t, repeated.JSON200.Records, httpclient.PostingStatusCancelled)

	accountIDs := []int64{refs.CheckingAccountId}
	balances, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &accountIDs})
	requireNoTransportError(t, "list account balances after cancel", err)
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("list account balances after cancel status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}
	assertAccountBalances(t, balances.JSON200.Balances, []wantAccountBalance{
		{accountID: refs.CheckingAccountId, currency: "USD", current: "0.00000000", currentUSD: "0.00000000", posted: "0.00000000", unconvertedCount: 0},
	})

	totals, err := client.REST().GetTransactionMonthTotalsWithResponse(context.Background(), &httpclient.GetTransactionMonthTotalsParams{Month: "2024-03"})
	requireNoTransportError(t, "month totals after cancel", err)
	if totals.StatusCode() != http.StatusOK {
		t.Fatalf("month totals after cancel status = %d, want %d; body %s", totals.StatusCode(), http.StatusOK, totals.Body)
	}
	assertMonthTotal(t, "cancelled transaction spend", totals.JSON200.Spend, "0.00000000", 0)

	missing, err := client.REST().CancelTransactionWithResponse(context.Background(), created.JSON201.TransactionId+9999)
	requireNoTransportError(t, "cancel missing transaction", err)
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("cancel missing transaction status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	tombstoned := createTransaction(t, client, balancedTransactionRequest(refs))
	deleted, err := client.REST().DeleteTransactionWithResponse(context.Background(), tombstoned.JSON201.TransactionId)
	requireNoTransportError(t, "delete transaction before cancel", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete transaction before cancel status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	cancelTombstoned, err := client.REST().CancelTransactionWithResponse(context.Background(), tombstoned.JSON201.TransactionId)
	requireNoTransportError(t, "cancel tombstoned transaction", err)
	if cancelTombstoned.StatusCode() != http.StatusNotFound {
		t.Fatalf("cancel tombstoned transaction status = %d, want %d; body %s", cancelTombstoned.StatusCode(), http.StatusNotFound, cancelTombstoned.Body)
	}
}

func TestExpectedTransactionsExcludedFromDefaultViewsAndAggregates(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	expectedRequest := balancedTransactionRequest(refs)
	expectedRequest.Records[0].PostingStatus = httpclient.PostingStatusExpected
	expectedRequest.Records[1].PostingStatus = httpclient.PostingStatusExpected
	expected := createTransaction(t, client, expectedRequest)
	posted := createTransaction(t, client, balancedTransactionRequest(refs))

	defaultList, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "default transaction list", err)
	assertTransactionListResponse(t, "default transaction list", defaultList, []int64{posted.JSON201.TransactionId}, 1)

	expectedStatuses := []httpclient.PostingStatus{httpclient.PostingStatusExpected}
	expectedList, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{PostingStatus: &expectedStatuses})
	requireNoTransportError(t, "expected transaction list", err)
	assertTransactionListResponse(t, "expected transaction list", expectedList, []int64{expected.JSON201.TransactionId}, 1)

	defaultSearch, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "default record search", err)
	if defaultSearch.StatusCode() != http.StatusOK {
		t.Fatalf("default record search status = %d, want %d; body %s", defaultSearch.StatusCode(), http.StatusOK, defaultSearch.Body)
	}
	assertRecordIDs(t, defaultSearch.JSON200.Records, recordIDs(posted.JSON201.Records))

	expectedStatus := httpclient.PostingStatusExpected
	expectedSearch, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{PostingStatus: &expectedStatus})
	requireNoTransportError(t, "expected record search", err)
	if expectedSearch.StatusCode() != http.StatusOK {
		t.Fatalf("expected record search status = %d, want %d; body %s", expectedSearch.StatusCode(), http.StatusOK, expectedSearch.Body)
	}
	assertRecordIDs(t, expectedSearch.JSON200.Records, recordIDs(expected.JSON201.Records))

	includeExpected := true
	combinedSearch, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		IncludeExpected: &includeExpected,
	})
	requireNoTransportError(t, "combined record search", err)
	if combinedSearch.StatusCode() != http.StatusOK {
		t.Fatalf("combined record search status = %d, want %d; body %s", combinedSearch.StatusCode(), http.StatusOK, combinedSearch.Body)
	}
	assertRecordIDs(t, combinedSearch.JSON200.Records, append(recordIDs(expected.JSON201.Records), recordIDs(posted.JSON201.Records)...))

	postedStatus := httpclient.PostingStatusPosted
	postedPlusExpectedSearch, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		IncludeExpected: &includeExpected,
		PostingStatus:   &postedStatus,
	})
	requireNoTransportError(t, "posted plus expected record search", err)
	if postedPlusExpectedSearch.StatusCode() != http.StatusOK {
		t.Fatalf("posted plus expected record search status = %d, want %d; body %s", postedPlusExpectedSearch.StatusCode(), http.StatusOK, postedPlusExpectedSearch.Body)
	}
	assertRecordIDs(t, postedPlusExpectedSearch.JSON200.Records, append(recordIDs(expected.JSON201.Records), recordIDs(posted.JSON201.Records)...))

	includeRunningBalance := true
	defaultRegister, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeRunningBalance: &includeRunningBalance,
	})
	requireNoTransportError(t, "default account register", err)
	if defaultRegister.StatusCode() != http.StatusOK {
		t.Fatalf("default account register status = %d, want %d; body %s", defaultRegister.StatusCode(), http.StatusOK, defaultRegister.Body)
	}
	assertRecordIDs(t, defaultRegister.JSON200.Records, []int64{posted.JSON201.Records[0].RecordId})
	assertRecordRunningBalances(t, defaultRegister.JSON200.Records, []string{"-12.34000000"})

	expectedRegister, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeRunningBalance: &includeRunningBalance,
		PostingStatus:         &expectedStatus,
	})
	requireNoTransportError(t, "expected account register", err)
	if expectedRegister.StatusCode() != http.StatusOK {
		t.Fatalf("expected account register status = %d, want %d; body %s", expectedRegister.StatusCode(), http.StatusOK, expectedRegister.Body)
	}
	assertRecordIDs(t, expectedRegister.JSON200.Records, []int64{expected.JSON201.Records[0].RecordId})
	assertRecordRunningBalances(t, expectedRegister.JSON200.Records, []string{"0.00000000"})

	combinedRegister, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeExpected:       &includeExpected,
		IncludeRunningBalance: &includeRunningBalance,
	})
	requireNoTransportError(t, "combined account register", err)
	if combinedRegister.StatusCode() != http.StatusOK {
		t.Fatalf("combined account register status = %d, want %d; body %s", combinedRegister.StatusCode(), http.StatusOK, combinedRegister.Body)
	}
	assertRecordIDs(t, combinedRegister.JSON200.Records, []int64{expected.JSON201.Records[0].RecordId, posted.JSON201.Records[0].RecordId})
	assertRecordRunningBalances(t, combinedRegister.JSON200.Records, []string{"0.00000000", "-12.34000000"})

	postedPlusExpectedRegister, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeExpected:       &includeExpected,
		IncludeRunningBalance: &includeRunningBalance,
		PostingStatus:         &postedStatus,
	})
	requireNoTransportError(t, "posted plus expected account register", err)
	if postedPlusExpectedRegister.StatusCode() != http.StatusOK {
		t.Fatalf("posted plus expected account register status = %d, want %d; body %s", postedPlusExpectedRegister.StatusCode(), http.StatusOK, postedPlusExpectedRegister.Body)
	}
	assertRecordIDs(t, postedPlusExpectedRegister.JSON200.Records, []int64{expected.JSON201.Records[0].RecordId, posted.JSON201.Records[0].RecordId})
	assertRecordRunningBalances(t, postedPlusExpectedRegister.JSON200.Records, []string{"0.00000000", "-12.34000000"})

	accountIDs := []int64{refs.CheckingAccountId}
	balances, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &accountIDs})
	requireNoTransportError(t, "account balances", err)
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("account balances status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}
	assertAccountBalances(t, balances.JSON200.Balances, []wantAccountBalance{
		{accountID: refs.CheckingAccountId, currency: "USD", current: "-12.34000000", currentUSD: "-12.34000000", posted: "-12.34000000", unconvertedCount: 0},
	})

	totals, err := client.REST().GetTransactionMonthTotalsWithResponse(context.Background(), &httpclient.GetTransactionMonthTotalsParams{Month: "2024-03"})
	requireNoTransportError(t, "month totals", err)
	if totals.StatusCode() != http.StatusOK {
		t.Fatalf("month totals status = %d, want %d; body %s", totals.StatusCode(), http.StatusOK, totals.Body)
	}
	assertMonthTotal(t, "expected-excluded spend", totals.JSON200.Spend, "12.34000000", 0)
	assertMonthTotal(t, "expected-excluded income", totals.JSON200.Income, "0.00000000", 0)
}

func TestRecordSearchFiltersBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	firstReq := balancedTransactionRequest(refs.transactionRefs)
	first, err := client.REST().CreateTransactionWithResponse(context.Background(), firstReq)
	requireNoTransportError(t, "create transaction", err)
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}

	memo := "Rent"
	pendingDate := apptest.Timestamp("2024-04-01T00:00:00Z")
	secondReq := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-04-01"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.SavingsAccountId,
				MemberId:             &refs.SecondMemberId,
				Currency:             "USD",
				Amount:               "-50.00",
				AmountUsd:            apptest.StringPtr("-50.00"),
				CategoryId:           refs.SecondCategoryId,
				TagIds:               apptest.Int64SlicePtr(refs.SecondTagId),
				Memo:                 &memo,
				PendingDate:          &pendingDate,
				PostingStatus:        httpclient.PostingStatusPending,
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               httpclient.ManualSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "50.00",
				AmountUsd:            apptest.StringPtr("50.00"),
				CategoryId:           refs.SecondCategoryId,
				PostingStatus:        httpclient.PostingStatusPending,
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               httpclient.ManualSourceManual,
			},
		},
	}
	second, err := client.REST().CreateTransactionWithResponse(context.Background(), secondReq)
	requireNoTransportError(t, "create transaction", err)
	if second.StatusCode() != http.StatusCreated {
		t.Fatalf("second create status = %d, want %d; body %s", second.StatusCode(), http.StatusCreated, second.Body)
	}

	firstDebit := first.JSON201.Records[0]
	firstCredit := first.JSON201.Records[1]
	secondDebit := second.JSON201.Records[0]
	secondCredit := second.JSON201.Records[1]

	cases := []struct {
		name   string
		params *httpclient.SearchJournalRecordsParams
		want   []int64
	}{
		{name: "account", params: &httpclient.SearchJournalRecordsParams{AccountId: &refs.CheckingAccountId}, want: []int64{firstDebit.RecordId}},
		{name: "category", params: &httpclient.SearchJournalRecordsParams{CategoryId: &refs.CategoryId}, want: []int64{firstDebit.RecordId, firstCredit.RecordId}},
		{name: "tag", params: &httpclient.SearchJournalRecordsParams{TagId: &refs.TagId}, want: []int64{firstDebit.RecordId}},
		{name: "member", params: &httpclient.SearchJournalRecordsParams{MemberId: &refs.MemberId}, want: []int64{firstDebit.RecordId}},
		{name: "posting status", params: &httpclient.SearchJournalRecordsParams{PostingStatus: ptrTo(httpclient.PostingStatusPending)}, want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
		{name: "reconciliation status", params: &httpclient.SearchJournalRecordsParams{ReconciliationStatus: ptrTo(httpclient.Unreconciled)}, want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
		{name: "amount min", params: &httpclient.SearchJournalRecordsParams{AmountMin: new("40.00")}, want: []int64{secondCredit.RecordId}},
		{name: "amount max", params: &httpclient.SearchJournalRecordsParams{AmountMax: new("-40.00")}, want: []int64{secondDebit.RecordId}},
		{name: "amount usd min", params: &httpclient.SearchJournalRecordsParams{AmountUsdMin: apptest.StringPtr("40.00")}, want: []int64{secondCredit.RecordId}},
		{name: "amount usd max", params: &httpclient.SearchJournalRecordsParams{AmountUsdMax: apptest.StringPtr("-40.00")}, want: []int64{secondDebit.RecordId}},
		{name: "initiated from", params: &httpclient.SearchJournalRecordsParams{InitiatedDateFrom: apptest.DatePtr("2024-04-01")}, want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
		{name: "initiated to", params: &httpclient.SearchJournalRecordsParams{InitiatedDateTo: apptest.DatePtr("2024-03-31")}, want: []int64{firstDebit.RecordId, firstCredit.RecordId}},
		{name: "pending from", params: &httpclient.SearchJournalRecordsParams{PendingDateFrom: apptest.TimestampPtr("2024-04-01T00:00:00Z")}, want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
		{name: "pending to", params: &httpclient.SearchJournalRecordsParams{PendingDateTo: apptest.TimestampPtr("2024-03-31T00:00:00Z")}, want: []int64{firstDebit.RecordId, firstCredit.RecordId}},
		{name: "posted from", params: &httpclient.SearchJournalRecordsParams{PostedDateFrom: apptest.TimestampPtr("2024-03-11T00:00:00Z")}, want: []int64{firstDebit.RecordId}},
		{name: "posted to", params: &httpclient.SearchJournalRecordsParams{PostedDateTo: apptest.TimestampPtr("2024-03-11T00:00:00Z")}, want: []int64{firstDebit.RecordId}},
		{name: "memo", params: &httpclient.SearchJournalRecordsParams{MemoContains: new("unc")}, want: []int64{firstDebit.RecordId}},
		{name: "combined", params: &httpclient.SearchJournalRecordsParams{CategoryId: &refs.CategoryId, TagId: &refs.TagId, MemoContains: new("Lunch")}, want: []int64{firstDebit.RecordId}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), tc.params)
			requireNoTransportError(t, "search records", err)
			if got.StatusCode() != http.StatusOK {
				t.Fatalf("search status = %d, want %d; body %s", got.StatusCode(), http.StatusOK, got.Body)
			}
			assertRecordIDs(t, got.JSON200.Records, tc.want)
		})
	}

	accountRecords, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil)
	requireNoTransportError(t, "search account records", err)
	if accountRecords.StatusCode() != http.StatusOK {
		t.Fatalf("account records status = %d, want %d; body %s", accountRecords.StatusCode(), http.StatusOK, accountRecords.Body)
	}
	assertRecordIDs(t, accountRecords.JSON200.Records, []int64{firstDebit.RecordId})
	if accountRecords.JSON200.Records[0].TransactionId != first.JSON201.TransactionId {
		t.Fatalf("account record transaction_id = %d, want %d", accountRecords.JSON200.Records[0].TransactionId, first.JSON201.TransactionId)
	}

	accountDateFiltered, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.SavingsAccountId, &httpclient.SearchAccountJournalRecordsParams{
		InitiatedDateFrom: apptest.DatePtr("2024-04-01"),
	})
	requireNoTransportError(t, "search account records", err)
	if accountDateFiltered.StatusCode() != http.StatusOK {
		t.Fatalf("account date filter status = %d, want %d; body %s", accountDateFiltered.StatusCode(), http.StatusOK, accountDateFiltered.Body)
	}
	assertRecordIDs(t, accountDateFiltered.JSON200.Records, []int64{secondDebit.RecordId})

	accountPendingFiltered, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.SavingsAccountId, &httpclient.SearchAccountJournalRecordsParams{
		PendingDateFrom: apptest.TimestampPtr("2024-04-01T00:00:00Z"),
	})
	requireNoTransportError(t, "search account records", err)
	if accountPendingFiltered.StatusCode() != http.StatusOK {
		t.Fatalf("account pending date filter status = %d, want %d; body %s", accountPendingFiltered.StatusCode(), http.StatusOK, accountPendingFiltered.Body)
	}
	assertRecordIDs(t, accountPendingFiltered.JSON200.Records, []int64{secondDebit.RecordId})

	accountAmountFiltered, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		AmountMax: new("-10.00"),
	})
	requireNoTransportError(t, "search account records", err)
	if accountAmountFiltered.StatusCode() != http.StatusOK {
		t.Fatalf("account amount filter status = %d, want %d; body %s", accountAmountFiltered.StatusCode(), http.StatusOK, accountAmountFiltered.Body)
	}
	assertRecordIDs(t, accountAmountFiltered.JSON200.Records, []int64{firstDebit.RecordId})

	unsupported, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("bad=1"))
	requireNoTransportError(t, "search records", err)
	if unsupported.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unsupported filter status = %d, want %d; body %s", unsupported.StatusCode(), http.StatusBadRequest, unsupported.Body)
	}
	invalidDecimal, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("amount_min=not-a-decimal"))
	requireNoTransportError(t, "search records", err)
	if invalidDecimal.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid decimal filter status = %d, want %d; body %s", invalidDecimal.StatusCode(), http.StatusBadRequest, invalidDecimal.Body)
	}
	invalidDate, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("initiated_date_from=2024-02-30"))
	requireNoTransportError(t, "search records", err)
	if invalidDate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid date filter status = %d, want %d; body %s", invalidDate.StatusCode(), http.StatusBadRequest, invalidDate.Body)
	}
	invalidPostingStatus, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("posting_status=unknown"))
	requireNoTransportError(t, "search records", err)
	if invalidPostingStatus.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid posting status filter status = %d, want %d; body %s", invalidPostingStatus.StatusCode(), http.StatusBadRequest, invalidPostingStatus.Body)
	}
	invalidReconciliationStatus, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("reconciliation_status=unknown"))
	requireNoTransportError(t, "search records", err)
	if invalidReconciliationStatus.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid reconciliation status filter status = %d, want %d; body %s", invalidReconciliationStatus.StatusCode(), http.StatusBadRequest, invalidReconciliationStatus.Body)
	}
	accountIDOnAccountView, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil, apptest.ReplaceRawQuery("account_id="+apptest.FormatID(refs.SavingsAccountId)))
	requireNoTransportError(t, "search account records", err)
	if accountIDOnAccountView.StatusCode() != http.StatusBadRequest {
		t.Fatalf("account_id on account view status = %d, want %d; body %s", accountIDOnAccountView.StatusCode(), http.StatusBadRequest, accountIDOnAccountView.Body)
	}
	invalidAccountDecimal, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil, apptest.ReplaceRawQuery("amount_min=not-a-decimal"))
	requireNoTransportError(t, "search account records", err)
	if invalidAccountDecimal.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid account decimal filter status = %d, want %d; body %s", invalidAccountDecimal.StatusCode(), http.StatusBadRequest, invalidAccountDecimal.Body)
	}
	invalidAccountDate, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil, apptest.ReplaceRawQuery("initiated_date_from=2024-02-30"))
	requireNoTransportError(t, "search account records", err)
	if invalidAccountDate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid account date filter status = %d, want %d; body %s", invalidAccountDate.StatusCode(), http.StatusBadRequest, invalidAccountDate.Body)
	}
}

func TestRecordSearchDictionaryFilterReferencesBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()

	for _, rawQuery := range []string{
		"account_id=999999",
		"category_id=999999",
		"tag_id=999999",
		"member_id=999999",
	} {
		t.Run("global missing "+rawQuery, func(t *testing.T) {
			assertInvalidRecordSearchQuery(t, client, rawQuery)
		})
	}

	tombstonedAccount := scenario.AccountWithCurrency("checking:RecordSearch:TombstonedFilter", "USD")
	deleteAccount(t, client, tombstonedAccount.AccountId)
	tombstonedCategory := scenario.Category("RecordSearch:TombstonedFilter")
	deleteCategory(t, client, tombstonedCategory.CategoryId)
	tombstonedTag := scenario.Tag("RecordSearch:TombstonedFilter")
	deleteTag(t, client, tombstonedTag.TagId)
	tombstonedMember := scenario.Member("Record Search Tombstoned Filter")
	deleteMember(t, client, tombstonedMember.MemberId)

	for _, rawQuery := range []string{
		"account_id=" + apptest.FormatID(tombstonedAccount.AccountId),
		"category_id=" + apptest.FormatID(tombstonedCategory.CategoryId),
		"tag_id=" + apptest.FormatID(tombstonedTag.TagId),
		"member_id=" + apptest.FormatID(tombstonedMember.MemberId),
	} {
		t.Run("global tombstoned "+rawQuery, func(t *testing.T) {
			assertInvalidRecordSearchQuery(t, client, rawQuery)
		})
	}

	assertAccountRecordSearchNotFound(t, client, 999999)
	assertAccountRecordSearchNotFound(t, client, tombstonedAccount.AccountId)
	assertInvalidAccountRecordSearchQuery(t, client, 999999, "category_id=0")

	hidden := true
	hiddenAccount, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:RecordSearch:HiddenFilter",
		AccountType: httpclient.Balance,
		IsHidden:    &hidden,
		Currency:    ptrTo("USD"),
	})
	if err != nil {
		t.Fatalf("hidden record search filter account request: %v", err)
	}
	if hiddenAccount.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden record search filter account status = %d, want %d; body %s", hiddenAccount.StatusCode(), http.StatusCreated, hiddenAccount.Body)
	}
	hiddenCategory := scenario.CategoryWithHidden("RecordSearch:HiddenFilter", hidden)
	hiddenTag, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      "RecordSearch:HiddenFilter",
		IsHidden: &hidden,
	})
	if err != nil {
		t.Fatalf("hidden record search filter tag request: %v", err)
	}
	if hiddenTag.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden record search filter tag status = %d, want %d; body %s", hiddenTag.StatusCode(), http.StatusCreated, hiddenTag.Body)
	}

	for _, rawQuery := range []string{
		"account_id=" + apptest.FormatID(hiddenAccount.JSON201.AccountId),
		"category_id=" + apptest.FormatID(hiddenCategory.CategoryId),
		"tag_id=" + apptest.FormatID(hiddenTag.JSON201.TagId),
	} {
		t.Run("global hidden active "+rawQuery, func(t *testing.T) {
			assertEmptyRecordSearchQuery(t, client, rawQuery)
		})
	}
	assertEmptyAccountRecordSearch(t, client, hiddenAccount.JSON201.AccountId)
	for _, rawQuery := range []string{
		"category_id=" + apptest.FormatID(hiddenCategory.CategoryId),
		"tag_id=" + apptest.FormatID(hiddenTag.JSON201.TagId),
	} {
		t.Run("account scoped hidden active "+rawQuery, func(t *testing.T) {
			assertEmptyAccountRecordSearchQuery(t, client, hiddenAccount.JSON201.AccountId, rawQuery)
		})
	}

	activeAccount := scenario.AccountWithCurrency("checking:RecordSearch:ActiveFilter", "USD")
	for _, rawQuery := range []string{
		"category_id=999999",
		"tag_id=999999",
		"member_id=999999",
		"category_id=" + apptest.FormatID(tombstonedCategory.CategoryId),
		"tag_id=" + apptest.FormatID(tombstonedTag.TagId),
		"member_id=" + apptest.FormatID(tombstonedMember.MemberId),
	} {
		t.Run("account scoped invalid "+rawQuery, func(t *testing.T) {
			assertInvalidAccountRecordSearchQuery(t, client, activeAccount.AccountId, rawQuery)
		})
	}
}

func TestRecordSearchAccountFQNPrefixBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()
	category := scenario.Category("Banking:Fees")
	funding := scenario.AccountWithCurrency("cash:Prefix:Funding", "USD")
	merchant := scenario.Account("merchant:Prefix:Coffee")
	chaseChecking := scenario.AccountWithCurrency("banks:Chase:checking:Joint", "USD")
	chaseFees := scenario.AccountWithType("banks:Chase:fees", httpclient.Flow)
	chaserChecking := scenario.AccountWithCurrency("banks:Chaser:checking", "USD")
	allyChecking := scenario.AccountWithCurrency("banks:Ally:checking", "USD")

	descendant := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-02", category.CategoryId, chaseChecking.AccountId, merchant.AccountId, httpclient.PostingStatusPosted))
	flow := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-03", category.CategoryId, funding.AccountId, chaseFees.AccountId, httpclient.PostingStatusPending))
	sibling := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-04", category.CategoryId, chaserChecking.AccountId, merchant.AccountId, httpclient.PostingStatusPosted))
	other := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-05", category.CategoryId, allyChecking.AccountId, merchant.AccountId, httpclient.PostingStatusPosted))

	prefix := "banks:Chase"
	prefixRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountFqnPrefix: &prefix,
	})
	requireNoTransportError(t, "search records by account fqn prefix", err)
	if prefixRecords.StatusCode() != http.StatusOK {
		t.Fatalf("prefix records status = %d, want %d; body %s", prefixRecords.StatusCode(), http.StatusOK, prefixRecords.Body)
	}
	assertRecordIDs(t, prefixRecords.JSON200.Records, []int64{
		descendant.JSON201.Records[0].RecordId,
		flow.JSON201.Records[1].RecordId,
	})
	if prefixRecords.JSON200.TotalCount != 2 {
		t.Fatalf("prefix total_count = %d, want 2", prefixRecords.JSON200.TotalCount)
	}

	exactPrefix := "banks:Chase:checking:Joint"
	exactRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountFqnPrefix: &exactPrefix,
	})
	requireNoTransportError(t, "search records by exact account fqn prefix", err)
	if exactRecords.StatusCode() != http.StatusOK {
		t.Fatalf("exact prefix records status = %d, want %d; body %s", exactRecords.StatusCode(), http.StatusOK, exactRecords.Body)
	}
	assertRecordIDs(t, exactRecords.JSON200.Records, []int64{descendant.JSON201.Records[0].RecordId})

	limitOne := 1
	filteredPage, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountFqnPrefix: &prefix,
		PostingStatus:    ptrTo(httpclient.PostingStatusPosted),
		Limit:            &limitOne,
	})
	requireNoTransportError(t, "search records by account fqn prefix with filters", err)
	if filteredPage.StatusCode() != http.StatusOK {
		t.Fatalf("filtered prefix page status = %d, want %d; body %s", filteredPage.StatusCode(), http.StatusOK, filteredPage.Body)
	}
	assertRecordIDs(t, filteredPage.JSON200.Records, []int64{descendant.JSON201.Records[0].RecordId})
	if filteredPage.JSON200.TotalCount != 1 {
		t.Fatalf("filtered prefix page total_count = %d, want 1", filteredPage.JSON200.TotalCount)
	}

	allRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "search records without account fqn prefix", err)
	if allRecords.StatusCode() != http.StatusOK {
		t.Fatalf("all records status = %d, want %d; body %s", allRecords.StatusCode(), http.StatusOK, allRecords.Body)
	}
	if allRecords.JSON200.TotalCount != 8 {
		t.Fatalf("all records total_count = %d, want 8; sibling=%d other=%d", allRecords.JSON200.TotalCount, sibling.JSON201.TransactionId, other.JSON201.TransactionId)
	}

	wildcardPrefix := "banks:Save_1%\\Vault"
	wildcardDescendantAccount := scenario.AccountWithCurrency(wildcardPrefix+":Joint", "USD")
	wildcardFeeAccount := scenario.AccountWithType(wildcardPrefix+":Fees", httpclient.Flow)
	wildcardLookalikeAccount := scenario.AccountWithCurrency("banks:Savex1ExtraVault:Joint", "USD")
	wildcardDescendant := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-07", category.CategoryId, wildcardDescendantAccount.AccountId, merchant.AccountId, httpclient.PostingStatusPosted))
	wildcardFee := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-08", category.CategoryId, funding.AccountId, wildcardFeeAccount.AccountId, httpclient.PostingStatusPosted))
	createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-08", category.CategoryId, wildcardLookalikeAccount.AccountId, merchant.AccountId, httpclient.PostingStatusPosted))

	wildcardPrefixRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountFqnPrefix: &wildcardPrefix,
	})
	requireNoTransportError(t, "search records by wildcard account fqn prefix", err)
	if wildcardPrefixRecords.StatusCode() != http.StatusOK {
		t.Fatalf("wildcard prefix records status = %d, want %d; body %s", wildcardPrefixRecords.StatusCode(), http.StatusOK, wildcardPrefixRecords.Body)
	}
	assertRecordIDs(t, wildcardPrefixRecords.JSON200.Records, []int64{
		wildcardDescendant.JSON201.Records[0].RecordId,
		wildcardFee.JSON201.Records[1].RecordId,
	})
	if wildcardPrefixRecords.JSON200.TotalCount != 2 {
		t.Fatalf("wildcard prefix total_count = %d, want 2", wildcardPrefixRecords.JSON200.TotalCount)
	}

	assertInvalidRecordSearchQuery(t, client, "account_fqn_prefix=banks:Chase&account_id="+apptest.FormatID(chaseChecking.AccountId))
	assertInvalidRecordSearchQuery(t, client, "account_fqn_prefix=banks:Chase&include_running_balance=true")
	assertInvalidRecordSearchQuery(t, client, "account_fqn_prefix=:bad")
}

func TestRecordSearchPaginationBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	third := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-03", "Third")
	first := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-01", "First")
	second := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-02", "Second")

	limitThree := 3
	offsetOne := 1
	allRecordsPage, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		Limit:  &limitThree,
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "search records page", err)
	if allRecordsPage.StatusCode() != http.StatusOK {
		t.Fatalf("search records page status = %d, want %d; body %s", allRecordsPage.StatusCode(), http.StatusOK, allRecordsPage.Body)
	}
	assertRecordIDs(t, allRecordsPage.JSON200.Records, []int64{
		first.JSON201.Records[1].RecordId,
		second.JSON201.Records[0].RecordId,
		second.JSON201.Records[1].RecordId,
	})
	if allRecordsPage.JSON200.TotalCount != 6 {
		t.Fatalf("search records page total_count = %d, want 6", allRecordsPage.JSON200.TotalCount)
	}

	offsetOnlyAllRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "search records offset-only page", err)
	if offsetOnlyAllRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search records offset-only page status = %d, want %d; body %s", offsetOnlyAllRecords.StatusCode(), http.StatusOK, offsetOnlyAllRecords.Body)
	}
	assertRecordIDs(t, offsetOnlyAllRecords.JSON200.Records, []int64{
		first.JSON201.Records[1].RecordId,
		second.JSON201.Records[0].RecordId,
		second.JSON201.Records[1].RecordId,
		third.JSON201.Records[0].RecordId,
		third.JSON201.Records[1].RecordId,
	})
	if offsetOnlyAllRecords.JSON200.TotalCount != 6 {
		t.Fatalf("search records offset-only total_count = %d, want 6", offsetOnlyAllRecords.JSON200.TotalCount)
	}

	limitTwo := 2
	accountRecordsPage, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		Limit:  &limitTwo,
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "search account records page", err)
	if accountRecordsPage.StatusCode() != http.StatusOK {
		t.Fatalf("search account records page status = %d, want %d; body %s", accountRecordsPage.StatusCode(), http.StatusOK, accountRecordsPage.Body)
	}
	assertRecordIDs(t, accountRecordsPage.JSON200.Records, []int64{
		second.JSON201.Records[0].RecordId,
		third.JSON201.Records[0].RecordId,
	})
	if accountRecordsPage.JSON200.TotalCount != 3 {
		t.Fatalf("search account records page total_count = %d, want 3", accountRecordsPage.JSON200.TotalCount)
	}

	offsetOnlyAccountRecords, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "search account records offset-only page", err)
	if offsetOnlyAccountRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search account records offset-only page status = %d, want %d; body %s", offsetOnlyAccountRecords.StatusCode(), http.StatusOK, offsetOnlyAccountRecords.Body)
	}
	assertRecordIDs(t, offsetOnlyAccountRecords.JSON200.Records, []int64{
		second.JSON201.Records[0].RecordId,
		third.JSON201.Records[0].RecordId,
	})
	if offsetOnlyAccountRecords.JSON200.TotalCount != 3 {
		t.Fatalf("search account records offset-only total_count = %d, want 3", offsetOnlyAccountRecords.JSON200.TotalCount)
	}

	limitOne := 1
	filteredPage, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountId: &refs.CheckingAccountId,
		Limit:     &limitOne,
		Offset:    &offsetOne,
	})
	requireNoTransportError(t, "search filtered records page", err)
	if filteredPage.StatusCode() != http.StatusOK {
		t.Fatalf("search filtered records page status = %d, want %d; body %s", filteredPage.StatusCode(), http.StatusOK, filteredPage.Body)
	}
	assertRecordIDs(t, filteredPage.JSON200.Records, []int64{second.JSON201.Records[0].RecordId})
	if filteredPage.JSON200.TotalCount != 3 {
		t.Fatalf("search filtered records page total_count = %d, want 3", filteredPage.JSON200.TotalCount)
	}

	noMatchMemo := "No matching memo"
	emptyFiltered, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		MemoContains: &noMatchMemo,
	})
	requireNoTransportError(t, "search empty filtered records", err)
	if emptyFiltered.StatusCode() != http.StatusOK {
		t.Fatalf("search empty filtered records status = %d, want %d; body %s", emptyFiltered.StatusCode(), http.StatusOK, emptyFiltered.Body)
	}
	assertRecordIDs(t, emptyFiltered.JSON200.Records, nil)
	if emptyFiltered.JSON200.TotalCount != 0 {
		t.Fatalf("search empty filtered records total_count = %d, want 0", emptyFiltered.JSON200.TotalCount)
	}

	assertInvalidRecordSearchQuery(t, client, "limit=0")
	assertInvalidRecordSearchQuery(t, client, "limit=501")
	assertInvalidRecordSearchQuery(t, client, "offset=-1")
	assertInvalidAccountRecordSearchQuery(t, client, refs.CheckingAccountId, "limit=0")
	assertInvalidAccountRecordSearchQuery(t, client, refs.CheckingAccountId, "limit=501")
	assertInvalidAccountRecordSearchQuery(t, client, refs.CheckingAccountId, "offset=-1")
}

func TestAccountRecordRunningBalanceBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	first := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-01", "First")
	cancelledRequest := balancedTransactionRequest(refs.transactionRefs)
	cancelledRequest.InitiatedDate = apptest.Date("2024-01-02")
	cancelledRequest.Records[0].PostingStatus = httpclient.PostingStatusCancelled
	cancelledRequest.Records[1].PostingStatus = httpclient.PostingStatusCancelled
	cancelled := createTransaction(t, client, cancelledRequest)
	pendingRequest := balancedTransactionRequest(refs.transactionRefs)
	pendingRequest.InitiatedDate = apptest.Date("2024-01-03")
	pendingRequest.Records[0].PostingStatus = httpclient.PostingStatusPending
	pendingRequest.Records[1].PostingStatus = httpclient.PostingStatusPending
	pending := createTransaction(t, client, pendingRequest)
	second := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-04", "Second")

	includeRunningBalance := true
	limitThree := 3
	offsetOne := 1
	page, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeRunningBalance: &includeRunningBalance,
		Limit:                 &limitThree,
		Offset:                &offsetOne,
	})
	requireNoTransportError(t, "search account records with running balance", err)
	if page.StatusCode() != http.StatusOK {
		t.Fatalf("search account records with running balance status = %d, want %d; body %s", page.StatusCode(), http.StatusOK, page.Body)
	}
	assertRecordIDs(t, page.JSON200.Records, []int64{
		cancelled.JSON201.Records[0].RecordId,
		pending.JSON201.Records[0].RecordId,
		second.JSON201.Records[0].RecordId,
	})
	assertRecordRunningBalances(t, page.JSON200.Records, []string{"-12.34000000", "-24.68000000", "-37.02000000"})

	filteredMemo := "Second"
	filtered, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeRunningBalance: &includeRunningBalance,
		MemoContains:          &filteredMemo,
	})
	requireNoTransportError(t, "search filtered account records with running balance", err)
	if filtered.StatusCode() != http.StatusOK {
		t.Fatalf("search filtered account records with running balance status = %d, want %d; body %s", filtered.StatusCode(), http.StatusOK, filtered.Body)
	}
	assertRecordIDs(t, filtered.JSON200.Records, []int64{second.JSON201.Records[0].RecordId})
	assertRecordRunningBalances(t, filtered.JSON200.Records, []string{"-37.02000000"})

	withoutRunningBalance, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil)
	requireNoTransportError(t, "search account records without running balance", err)
	if withoutRunningBalance.StatusCode() != http.StatusOK {
		t.Fatalf("search account records without running balance status = %d, want %d; body %s", withoutRunningBalance.StatusCode(), http.StatusOK, withoutRunningBalance.Body)
	}
	if withoutRunningBalance.JSON200.Records[0].RunningBalance != nil {
		t.Fatalf("running_balance without opt-in = %v, want nil", withoutRunningBalance.JSON200.Records[0].RunningBalance)
	}

	if first.JSON201.Records[0].RunningBalance != nil {
		t.Fatalf("create response running_balance = %v, want nil", first.JSON201.Records[0].RunningBalance)
	}
}

func TestAccountRecordRunningBalanceByCurrency(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	firstUSD := balancedTransactionRequest(refs.transactionRefs)
	firstUSD.InitiatedDate = apptest.Date("2024-01-01")
	firstUSD.Records[0].Amount = "-12.34"
	firstUSD.Records[0].AmountUsd = apptest.StringPtr("-12.34")
	firstUSD.Records[1].Amount = "12.34"
	firstUSD.Records[1].AmountUsd = apptest.StringPtr("12.34")
	firstUSDResponse := createTransaction(t, client, firstUSD)

	firstEUR := balancedTransactionRequest(refs.transactionRefs)
	firstEUR.InitiatedDate = apptest.Date("2024-01-02")
	firstEUR.Records[0].Currency = "EUR"
	firstEUR.Records[0].Amount = "-10.00"
	firstEUR.Records[0].AmountUsd = apptest.StringPtr("-11.00")
	firstEUR.Records[1].Currency = "EUR"
	firstEUR.Records[1].Amount = "10.00"
	firstEUR.Records[1].AmountUsd = apptest.StringPtr("11.00")
	firstEURResponse := createTransaction(t, client, firstEUR)

	secondUSD := balancedTransactionRequest(refs.transactionRefs)
	secondUSD.InitiatedDate = apptest.Date("2024-01-03")
	secondUSD.Records[0].Amount = "-1.00"
	secondUSD.Records[0].AmountUsd = apptest.StringPtr("-1.00")
	secondUSD.Records[1].Amount = "1.00"
	secondUSD.Records[1].AmountUsd = apptest.StringPtr("1.00")
	secondUSDResponse := createTransaction(t, client, secondUSD)

	includeRunningBalance := true
	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeRunningBalance: &includeRunningBalance,
	})
	requireNoTransportError(t, "search account records with multi-currency running balance", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("search account records with multi-currency running balance status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	assertRecordIDs(t, response.JSON200.Records, []int64{
		firstUSDResponse.JSON201.Records[0].RecordId,
		firstEURResponse.JSON201.Records[0].RecordId,
		secondUSDResponse.JSON201.Records[0].RecordId,
	})
	assertRecordRunningBalances(t, response.JSON200.Records, []string{"-12.34000000", "-10.00000000", "-13.34000000"})
}

func ptrTo[T any](value T) *T {
	return new(value)
}

type searchRefs struct {
	transactionRefs
	SavingsAccountId int64
	SecondCategoryId int64
	SecondTagId      int64
	SecondMemberId   int64
}

func createSearchRefs(t *testing.T, client *apptest.Client) searchRefs {
	t.Helper()

	base := createTransactionRefs(t, client)
	scenario := client.Scenario()
	savings := scenario.AccountWithCurrency("savings:Emergency", "USD")
	category := scenario.Category("Housing:Rent")
	tag := scenario.Tag("Recurring:Monthly")
	member := scenario.Member("Blake")

	return searchRefs{
		transactionRefs:  base,
		SavingsAccountId: savings.AccountId,
		SecondCategoryId: category.CategoryId,
		SecondTagId:      tag.TagId,
		SecondMemberId:   member.MemberId,
	}
}

func replacementTransactionRequest(refs transactionRefs) httpclient.UpdateTransactionRequest {
	memo := "Replacement"
	pendingDate := apptest.Timestamp("2024-03-12T00:00:00Z")
	postedDate := apptest.Timestamp("2024-03-13T00:00:00Z")
	return httpclient.UpdateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-12"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				MemberId:             &refs.MemberId,
				Currency:             "USD",
				Amount:               "-20.00",
				AmountUsd:            apptest.StringPtr("-20.00"),
				CategoryId:           refs.CategoryId,
				TagIds:               apptest.Int64SlicePtr(refs.TagId),
				Memo:                 &memo,
				PendingDate:          &pendingDate,
				PostedDate:           &postedDate,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "20.00",
				AmountUsd:            apptest.StringPtr("20.00"),
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
		},
	}
}

func recordIDs(records []httpclient.JournalRecord) []int64 {
	ids := make([]int64, 0, len(records))
	for _, record := range records {
		ids = append(ids, record.RecordId)
	}

	return ids
}

func assertRecordIDs(t *testing.T, records []httpclient.JournalRecord, want []int64) {
	t.Helper()

	assertInt64s(t, recordIDs(records), want)
}

func createTransaction(t *testing.T, client *apptest.Client, request httpclient.CreateTransactionRequest) *httpclient.CreateTransactionResponse {
	t.Helper()

	response, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	requireNoTransportError(t, "create transaction", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return response
}

func recordSearchPrefixTransactionRequest(
	date string,
	categoryID int64,
	firstAccountID int64,
	secondAccountID int64,
	postingStatus httpclient.PostingStatus,
) httpclient.CreateTransactionRequest {
	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date(date),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            firstAccountID,
				Currency:             "USD",
				Amount:               "-10.00",
				AmountUsd:            apptest.StringPtr("-10.00"),
				CategoryId:           categoryID,
				PostingStatus:        postingStatus,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
			{
				AccountId:            secondAccountID,
				Currency:             "USD",
				Amount:               "10.00",
				AmountUsd:            apptest.StringPtr("10.00"),
				CategoryId:           categoryID,
				PostingStatus:        postingStatus,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
		},
	}
}

func assertRecordRunningBalances(t *testing.T, records []httpclient.JournalRecord, want []string) {
	t.Helper()

	if len(records) != len(want) {
		t.Fatalf("record count = %d, want %d; records = %+v", len(records), len(want), records)
	}
	for index, record := range records {
		if record.RunningBalance == nil || *record.RunningBalance != want[index] {
			t.Fatalf("running_balance at %d = %v, want %q; records = %+v", index, record.RunningBalance, want[index], records)
		}
	}
}

func assertTransactionCancelPreservedFields(t *testing.T, before []httpclient.JournalRecord, after []httpclient.JournalRecord) {
	t.Helper()

	if len(after) != len(before) {
		t.Fatalf("cancelled record count = %d, want %d; before %+v after %+v", len(after), len(before), before, after)
	}
	for index := range before {
		if !after[index].PendingDate.Equal(before[index].PendingDate) ||
			!equalOptionalTime(after[index].PostedDate, before[index].PostedDate) ||
			after[index].ReconciliationStatus != before[index].ReconciliationStatus {
			t.Fatalf("cancelled record %d preserved fields = pending:%v posted:%v reconciliation:%q, want pending:%v posted:%v reconciliation:%q",
				index,
				after[index].PendingDate,
				after[index].PostedDate,
				after[index].ReconciliationStatus,
				before[index].PendingDate,
				before[index].PostedDate,
				before[index].ReconciliationStatus,
			)
		}
	}
}

func equalOptionalTime(left *time.Time, right *time.Time) bool {
	if left == nil || right == nil {
		return left == right
	}

	return left.Equal(*right)
}

func assertEmptyRecordSearchQuery(t *testing.T, client *apptest.Client, rawQuery string) {
	t.Helper()

	response, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery(rawQuery))
	requireNoTransportError(t, "search records", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("search records query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusOK, response.Body)
	}
	assertRecordIDs(t, response.JSON200.Records, nil)
	if response.JSON200.TotalCount != 0 {
		t.Fatalf("search records query %q total_count = %d, want 0; body %+v", rawQuery, response.JSON200.TotalCount, response.JSON200)
	}
}

func assertInvalidRecordSearchQuery(t *testing.T, client *apptest.Client, rawQuery string) {
	t.Helper()

	response, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery(rawQuery))
	requireNoTransportError(t, "invalid search records", err)
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid search records query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusBadRequest, response.Body)
	}
	if response.JSON400 == nil || response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid search records query %q code = %+v, want %q", rawQuery, response.JSON400, httpclient.APIErrorCodeInvalidRequest)
	}
}

func assertEmptyAccountRecordSearch(t *testing.T, client *apptest.Client, accountID int64) {
	t.Helper()

	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), accountID, nil)
	requireNoTransportError(t, "search account records", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("search account records status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	assertRecordIDs(t, response.JSON200.Records, nil)
	if response.JSON200.TotalCount != 0 {
		t.Fatalf("search account records total_count = %d, want 0; body %+v", response.JSON200.TotalCount, response.JSON200)
	}
}

func assertEmptyAccountRecordSearchQuery(t *testing.T, client *apptest.Client, accountID int64, rawQuery string) {
	t.Helper()

	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), accountID, nil, apptest.ReplaceRawQuery(rawQuery))
	requireNoTransportError(t, "search account records", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("search account records query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusOK, response.Body)
	}
	assertRecordIDs(t, response.JSON200.Records, nil)
	if response.JSON200.TotalCount != 0 {
		t.Fatalf("search account records query %q total_count = %d, want 0; body %+v", rawQuery, response.JSON200.TotalCount, response.JSON200)
	}
}

func assertInvalidAccountRecordSearchQuery(t *testing.T, client *apptest.Client, accountID int64, rawQuery string) {
	t.Helper()

	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), accountID, nil, apptest.ReplaceRawQuery(rawQuery))
	requireNoTransportError(t, "invalid search account records", err)
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid search account records query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusBadRequest, response.Body)
	}
	if response.JSON400 == nil || response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid search account records query %q code = %+v, want %q", rawQuery, response.JSON400, httpclient.APIErrorCodeInvalidRequest)
	}
}

func assertAccountRecordSearchNotFound(t *testing.T, client *apptest.Client, accountID int64) {
	t.Helper()

	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), accountID, nil)
	requireNoTransportError(t, "search missing account records", err)
	if response.StatusCode() != http.StatusNotFound {
		t.Fatalf("missing account records status = %d, want %d; body %s", response.StatusCode(), http.StatusNotFound, response.Body)
	}
	if response.JSON404 == nil || response.JSON404.Error.Code != httpclient.APIErrorCodeNotFound {
		t.Fatalf("missing account records error = %+v, want %q; body %s", response.JSON404, httpclient.APIErrorCodeNotFound, response.Body)
	}
}

func assertNoRecordIDs(t *testing.T, records []httpclient.JournalRecord, blocked []int64) {
	t.Helper()

	blockedSet := map[int64]struct{}{}
	for _, id := range blocked {
		blockedSet[id] = struct{}{}
	}
	for _, record := range records {
		if _, ok := blockedSet[record.RecordId]; ok {
			t.Fatalf("record id %d unexpectedly reused from tombstoned records %+v", record.RecordId, blocked)
		}
	}
}
