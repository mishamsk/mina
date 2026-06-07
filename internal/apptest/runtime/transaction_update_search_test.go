package runtime_test

import (
	"context"
	"net/http"
	"testing"

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
	if read.JSON200.Records[0].AmountUsd != nil {
		t.Fatalf("first amount_usd after replace = %v, want nil", read.JSON200.Records[0].AmountUsd)
	}
	if read.JSON200.Records[1].AmountUsd == nil || *read.JSON200.Records[1].AmountUsd != "19.00000000" {
		t.Fatalf("second amount_usd after replace = %v, want 19.00000000", read.JSON200.Records[1].AmountUsd)
	}
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

	list, err := client.REST().ListTransactionsWithResponse(context.Background())
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
				PostingStatus:        httpclient.Pending,
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "50.00",
				AmountUsd:            apptest.StringPtr("50.00"),
				CategoryId:           refs.SecondCategoryId,
				PostingStatus:        httpclient.Pending,
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               httpclient.Manual,
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
		{name: "posting status", params: &httpclient.SearchJournalRecordsParams{PostingStatus: ptrTo(httpclient.Pending)}, want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
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
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "20.00",
				AmountUsd:            apptest.StringPtr("20.00"),
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
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
