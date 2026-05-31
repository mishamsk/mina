package runtime_test

import (
	"net/http"
	"net/url"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestTransactionReplaceBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created := apptest.Decode[models.Transaction](client, http.MethodPost, "/transactions", balancedTransactionRequest(refs))
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}
	oldRecordIDs := recordIDs(created.Body.Records)

	replacement := replacementTransactionRequest(refs)
	updated := apptest.Decode[models.Transaction](client, http.MethodPut, transactionPath(created.Body.TransactionId), replacement)
	if updated.StatusCode != http.StatusOK {
		t.Fatalf("replace status = %d, want %d; body %s", updated.StatusCode, http.StatusOK, updated.RawBody)
	}
	if updated.Body.TransactionId != created.Body.TransactionId {
		t.Fatalf("replaced transaction id = %d, want %d", updated.Body.TransactionId, created.Body.TransactionId)
	}
	if updated.Body.InitiatedDate != "2024-03-12" {
		t.Fatalf("replaced initiated_date = %q, want 2024-03-12", updated.Body.InitiatedDate)
	}
	if len(updated.Body.Records) != 2 {
		t.Fatalf("replaced record count = %d, want 2; body %+v", len(updated.Body.Records), updated.Body)
	}
	assertNoRecordIDs(t, updated.Body.Records, oldRecordIDs)

	search := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, "/records", nil)
	if search.StatusCode != http.StatusOK {
		t.Fatalf("record search status = %d, want %d; body %s", search.StatusCode, http.StatusOK, search.RawBody)
	}
	assertRecordIDs(t, search.Body.Records, recordIDs(updated.Body.Records))

	imbalanced := replacement
	imbalanced.Records[1].AmountUsd = "19.00"
	rejected := apptest.Decode[models.ErrorResponse](client, http.MethodPut, transactionPath(created.Body.TransactionId), imbalanced)
	if rejected.StatusCode != http.StatusBadRequest {
		t.Fatalf("imbalanced replace status = %d, want %d; body %s", rejected.StatusCode, http.StatusBadRequest, rejected.RawBody)
	}

	read := apptest.Decode[models.Transaction](client, http.MethodGet, transactionPath(created.Body.TransactionId), nil)
	if read.StatusCode != http.StatusOK {
		t.Fatalf("read after rejected replace status = %d, want %d; body %s", read.StatusCode, http.StatusOK, read.RawBody)
	}
	if read.Body.InitiatedDate != updated.Body.InitiatedDate {
		t.Fatalf("initiated_date after rejected replace = %q, want %q", read.Body.InitiatedDate, updated.Body.InitiatedDate)
	}
	assertRecordIDs(t, read.Body.Records, recordIDs(updated.Body.Records))
}

func TestTransactionDeleteTombstonesRecordsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created := apptest.Decode[models.Transaction](client, http.MethodPost, "/transactions", balancedTransactionRequest(refs))
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}

	deleted := apptest.Decode[struct{}](client, http.MethodDelete, transactionPath(created.Body.TransactionId), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	read := apptest.Decode[models.ErrorResponse](client, http.MethodGet, transactionPath(created.Body.TransactionId), nil)
	if read.StatusCode != http.StatusNotFound {
		t.Fatalf("read tombstoned transaction status = %d, want %d; body %s", read.StatusCode, http.StatusNotFound, read.RawBody)
	}

	list := apptest.Decode[models.TransactionListResponse](client, http.MethodGet, "/transactions", nil)
	if list.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode, http.StatusOK, list.RawBody)
	}
	if len(list.Body.Transactions) != 0 {
		t.Fatalf("transaction count after delete = %d, want 0; body %+v", len(list.Body.Transactions), list.Body)
	}

	records := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, "/records", nil)
	if records.StatusCode != http.StatusOK {
		t.Fatalf("record search status = %d, want %d; body %s", records.StatusCode, http.StatusOK, records.RawBody)
	}
	if len(records.Body.Records) != 0 {
		t.Fatalf("record count after delete = %d, want 0; body %+v", len(records.Body.Records), records.Body)
	}

	secondDelete := apptest.Decode[models.ErrorResponse](client, http.MethodDelete, transactionPath(created.Body.TransactionId), nil)
	if secondDelete.StatusCode != http.StatusNotFound {
		t.Fatalf("second delete status = %d, want %d; body %s", secondDelete.StatusCode, http.StatusNotFound, secondDelete.RawBody)
	}
}

func TestRecordSearchFiltersBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	firstReq := balancedTransactionRequest(refs.transactionRefs)
	first := apptest.Decode[models.Transaction](client, http.MethodPost, "/transactions", firstReq)
	if first.StatusCode != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode, http.StatusCreated, first.RawBody)
	}

	secondReq := models.CreateTransactionRequest{
		InitiatedDate: "2024-04-01",
		Records: []models.CreateJournalRecordRequest{
			{
				AccountId:            refs.SavingsAccountId,
				MemberId:             &refs.SecondMemberId,
				Currency:             "USD",
				Amount:               "-50.00",
				AmountUsd:            "-50.00",
				CategoryId:           refs.SecondCategoryId,
				TagIds:               apptest.Int64SlicePtr(refs.SecondTagId),
				Memo:                 apptest.StringPtr("Rent"),
				PendingDate:          apptest.StringPtr("2024-04-01"),
				PostingStatus:        models.Pending,
				ReconciliationStatus: models.Unreconciled,
				Source:               models.Manual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "50.00",
				AmountUsd:            "50.00",
				CategoryId:           refs.SecondCategoryId,
				PostingStatus:        models.Pending,
				ReconciliationStatus: models.Unreconciled,
				Source:               models.Manual,
			},
		},
	}
	second := apptest.Decode[models.Transaction](client, http.MethodPost, "/transactions", secondReq)
	if second.StatusCode != http.StatusCreated {
		t.Fatalf("second create status = %d, want %d; body %s", second.StatusCode, http.StatusCreated, second.RawBody)
	}

	firstDebit := first.Body.Records[0]
	firstCredit := first.Body.Records[1]
	secondDebit := second.Body.Records[0]
	secondCredit := second.Body.Records[1]

	cases := []struct {
		name string
		path string
		want []int64
	}{
		{name: "account", path: "/records?account_id=" + apptest.FormatID(refs.CheckingAccountId), want: []int64{firstDebit.RecordId}},
		{name: "category", path: "/records?category_id=" + apptest.FormatID(refs.CategoryId), want: []int64{firstDebit.RecordId, firstCredit.RecordId}},
		{name: "tag", path: "/records?tag_id=" + apptest.FormatID(refs.TagId), want: []int64{firstDebit.RecordId}},
		{name: "member", path: "/records?member_id=" + apptest.FormatID(refs.MemberId), want: []int64{firstDebit.RecordId}},
		{name: "posting status", path: "/records?posting_status=pending", want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
		{name: "reconciliation status", path: "/records?reconciliation_status=unreconciled", want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
		{name: "amount min", path: "/records?amount_min=40.00", want: []int64{secondCredit.RecordId}},
		{name: "amount max", path: "/records?amount_max=-40.00", want: []int64{secondDebit.RecordId}},
		{name: "amount usd min", path: "/records?amount_usd_min=40.00", want: []int64{secondCredit.RecordId}},
		{name: "amount usd max", path: "/records?amount_usd_max=-40.00", want: []int64{secondDebit.RecordId}},
		{name: "initiated from", path: "/records?initiated_date_from=2024-04-01", want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
		{name: "initiated to", path: "/records?initiated_date_to=2024-03-31", want: []int64{firstDebit.RecordId, firstCredit.RecordId}},
		{name: "pending from", path: "/records?pending_date_from=2024-04-01", want: []int64{secondDebit.RecordId}},
		{name: "pending to", path: "/records?pending_date_to=2024-03-31", want: []int64{firstDebit.RecordId}},
		{name: "posted from", path: "/records?posted_date_from=2024-03-11", want: []int64{firstDebit.RecordId}},
		{name: "posted to", path: "/records?posted_date_to=2024-03-11", want: []int64{firstDebit.RecordId}},
		{name: "memo", path: "/records?memo_contains=" + url.QueryEscape("unc"), want: []int64{firstDebit.RecordId}},
		{name: "combined", path: "/records?category_id=" + apptest.FormatID(refs.CategoryId) + "&tag_id=" + apptest.FormatID(refs.TagId) + "&memo_contains=Lunch", want: []int64{firstDebit.RecordId}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, tc.path, nil)
			if got.StatusCode != http.StatusOK {
				t.Fatalf("search status = %d, want %d; body %s", got.StatusCode, http.StatusOK, got.RawBody)
			}
			assertRecordIDs(t, got.Body.Records, tc.want)
		})
	}

	accountRecords := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, accountRecordsPath(refs.CheckingAccountId), nil)
	if accountRecords.StatusCode != http.StatusOK {
		t.Fatalf("account records status = %d, want %d; body %s", accountRecords.StatusCode, http.StatusOK, accountRecords.RawBody)
	}
	assertRecordIDs(t, accountRecords.Body.Records, []int64{firstDebit.RecordId})
	if accountRecords.Body.Records[0].TransactionId != first.Body.TransactionId {
		t.Fatalf("account record transaction_id = %d, want %d", accountRecords.Body.Records[0].TransactionId, first.Body.TransactionId)
	}

	unsupported := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/records?bad=1", nil)
	if unsupported.StatusCode != http.StatusBadRequest {
		t.Fatalf("unsupported filter status = %d, want %d; body %s", unsupported.StatusCode, http.StatusBadRequest, unsupported.RawBody)
	}
	invalidDecimal := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/records?amount_min=not-a-decimal", nil)
	if invalidDecimal.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid decimal filter status = %d, want %d; body %s", invalidDecimal.StatusCode, http.StatusBadRequest, invalidDecimal.RawBody)
	}
	invalidPostingStatus := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/records?posting_status=unknown", nil)
	if invalidPostingStatus.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid posting status filter status = %d, want %d; body %s", invalidPostingStatus.StatusCode, http.StatusBadRequest, invalidPostingStatus.RawBody)
	}
	invalidReconciliationStatus := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/records?reconciliation_status=unknown", nil)
	if invalidReconciliationStatus.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid reconciliation status filter status = %d, want %d; body %s", invalidReconciliationStatus.StatusCode, http.StatusBadRequest, invalidReconciliationStatus.RawBody)
	}
	accountIDOnAccountView := apptest.Decode[models.ErrorResponse](client, http.MethodGet, accountRecordsPath(refs.CheckingAccountId)+"?account_id="+apptest.FormatID(refs.SavingsAccountId), nil)
	if accountIDOnAccountView.StatusCode != http.StatusBadRequest {
		t.Fatalf("account_id on account view status = %d, want %d; body %s", accountIDOnAccountView.StatusCode, http.StatusBadRequest, accountIDOnAccountView.RawBody)
	}
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

func replacementTransactionRequest(refs transactionRefs) models.UpdateTransactionRequest {
	return models.UpdateTransactionRequest{
		InitiatedDate: "2024-03-12",
		Records: []models.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				MemberId:             &refs.MemberId,
				Currency:             "USD",
				Amount:               "-20.00",
				AmountUsd:            "-20.00",
				CategoryId:           refs.CategoryId,
				TagIds:               apptest.Int64SlicePtr(refs.TagId),
				Memo:                 apptest.StringPtr("Replacement"),
				PendingDate:          apptest.StringPtr("2024-03-12"),
				PostedDate:           apptest.StringPtr("2024-03-13"),
				PostingStatus:        models.Posted,
				ReconciliationStatus: models.Reconciled,
				Source:               models.Manual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "20.00",
				AmountUsd:            "20.00",
				CategoryId:           refs.CategoryId,
				PostingStatus:        models.Posted,
				ReconciliationStatus: models.Reconciled,
				Source:               models.Manual,
			},
		},
	}
}

func accountRecordsPath(accountID int64) string {
	return apptest.IDPath("/accounts", accountID) + "/records"
}

func recordIDs(records []models.JournalRecord) []int64 {
	ids := make([]int64, 0, len(records))
	for _, record := range records {
		ids = append(ids, record.RecordId)
	}

	return ids
}

func assertRecordIDs(t *testing.T, records []models.JournalRecord, want []int64) {
	t.Helper()

	assertInt64s(t, recordIDs(records), want)
}

func assertNoRecordIDs(t *testing.T, records []models.JournalRecord, blocked []int64) {
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
