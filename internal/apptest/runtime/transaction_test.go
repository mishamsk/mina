package runtime_test

import (
	"bytes"
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionCreateReadListBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	if created.JSON201.InitiatedDate.String() != "2024-03-10" {
		t.Fatalf("initiated_date = %q, want 2024-03-10", created.JSON201.InitiatedDate)
	}
	if len(created.JSON201.Records) != 2 {
		t.Fatalf("created record count = %d, want 2; body %+v", len(created.JSON201.Records), created.JSON201)
	}
	if created.JSON201.Records[0].AccountId != refs.CheckingAccountId || created.JSON201.Records[1].AccountId != refs.MerchantAccountId {
		t.Fatalf("created account ids = %d/%d, want %d/%d", created.JSON201.Records[0].AccountId, created.JSON201.Records[1].AccountId, refs.CheckingAccountId, refs.MerchantAccountId)
	}
	if created.JSON201.Records[0].MemberId == nil || *created.JSON201.Records[0].MemberId != refs.MemberId {
		t.Fatalf("member_id = %v, want %d", created.JSON201.Records[0].MemberId, refs.MemberId)
	}
	assertInt64s(t, created.JSON201.Records[0].TagIds, []int64{refs.TagId})

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.TransactionId != created.JSON201.TransactionId {
		t.Fatalf("read transaction id = %d, want %d", read.JSON200.TransactionId, created.JSON201.TransactionId)
	}
	if len(read.JSON200.Records) != 2 {
		t.Fatalf("read record count = %d, want 2; body %+v", len(read.JSON200.Records), read.JSON200)
	}
	if read.JSON200.Records[0].Memo == nil || *read.JSON200.Records[0].Memo != "Lunch" {
		t.Fatalf("read memo = %v, want Lunch", read.JSON200.Records[0].Memo)
	}

	list, err := client.REST().ListTransactionsWithResponse(context.Background())
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 1 {
		t.Fatalf("transaction count = %d, want 1; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
	if list.JSON200.Transactions[0].TransactionId != created.JSON201.TransactionId || len(list.JSON200.Transactions[0].Records) != 2 {
		t.Fatalf("listed transaction = %+v, want id %d with 2 records", list.JSON200.Transactions[0], created.JSON201.TransactionId)
	}
}

func TestTransactionRecordFieldsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	record := created.JSON201.Records[0]
	if record.PostingStatus != httpclient.Posted {
		t.Fatalf("posting_status = %q, want %q", record.PostingStatus, httpclient.Posted)
	}
	if record.ReconciliationStatus != httpclient.Reconciled {
		t.Fatalf("reconciliation_status = %q, want %q", record.ReconciliationStatus, httpclient.Reconciled)
	}
	if record.Source != httpclient.Manual {
		t.Fatalf("source = %q, want %q", record.Source, httpclient.Manual)
	}
	if record.PendingDate == nil || !record.PendingDate.Equal(apptest.Timestamp("2024-03-10T00:00:00Z")) {
		t.Fatalf("pending_date = %v, want 2024-03-10T00:00:00Z", record.PendingDate)
	}
	if record.PostedDate == nil || !record.PostedDate.Equal(apptest.Timestamp("2024-03-11T00:00:00Z")) {
		t.Fatalf("posted_date = %v, want 2024-03-11T00:00:00Z", record.PostedDate)
	}
	if record.Amount != "-12.34000000" || record.AmountUsd != "-12.34000000" {
		t.Fatalf("amounts = %q/%q, want -12.34000000/-12.34000000", record.Amount, record.AmountUsd)
	}
	assertInt64s(t, record.TagIds, []int64{refs.TagId})
	if record.CreatedAt.IsZero() || record.UpdatedAt.IsZero() {
		t.Fatalf("timestamps = %q/%q, want populated created_at/updated_at", record.CreatedAt, record.UpdatedAt)
	}

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if len(read.JSON200.Records) != 2 {
		t.Fatalf("read record count = %d, want 2; body %+v", len(read.JSON200.Records), read.JSON200)
	}
	readRecord := read.JSON200.Records[0]
	if readRecord.RecordId != record.RecordId {
		t.Fatalf("read record id = %d, want %d", readRecord.RecordId, record.RecordId)
	}
	if readRecord.PostingStatus != httpclient.Posted {
		t.Fatalf("read posting_status = %q, want %q", readRecord.PostingStatus, httpclient.Posted)
	}
	if readRecord.ReconciliationStatus != httpclient.Reconciled {
		t.Fatalf("read reconciliation_status = %q, want %q", readRecord.ReconciliationStatus, httpclient.Reconciled)
	}
	if readRecord.Source != httpclient.Manual {
		t.Fatalf("read source = %q, want %q", readRecord.Source, httpclient.Manual)
	}
	if readRecord.PendingDate == nil || !readRecord.PendingDate.Equal(apptest.Timestamp("2024-03-10T00:00:00Z")) {
		t.Fatalf("read pending_date = %v, want 2024-03-10T00:00:00Z", readRecord.PendingDate)
	}
	if readRecord.PostedDate == nil || !readRecord.PostedDate.Equal(apptest.Timestamp("2024-03-11T00:00:00Z")) {
		t.Fatalf("read posted_date = %v, want 2024-03-11T00:00:00Z", readRecord.PostedDate)
	}
	if readRecord.Amount != "-12.34000000" || readRecord.AmountUsd != "-12.34000000" {
		t.Fatalf("read amounts = %q/%q, want -12.34000000/-12.34000000", readRecord.Amount, readRecord.AmountUsd)
	}
	assertInt64s(t, readRecord.TagIds, []int64{refs.TagId})
	if readRecord.CreatedAt != record.CreatedAt || readRecord.UpdatedAt != record.UpdatedAt {
		t.Fatalf("read timestamps = %q/%q, want %q/%q", readRecord.CreatedAt, readRecord.UpdatedAt, record.CreatedAt, record.UpdatedAt)
	}
}

func TestTransactionTimestampsNormalizeOffsetInputBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	memo := "Offset lunch"
	pendingDate := parseTimestamp(t, "2024-03-10T00:30:00-05:00")
	postedDate := parseTimestamp(t, "2024-03-11T00:30:00-04:00")
	wantPendingDate := apptest.Timestamp("2024-03-10T05:30:00Z")
	wantPostedDate := apptest.Timestamp("2024-03-11T04:30:00Z")
	wantPendingJSON := `"pending_date":"2024-03-10T05:30:00Z"`
	wantPostedJSON := `"posted_date":"2024-03-11T04:30:00Z"`
	req := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				MemberId:             &refs.MemberId,
				Currency:             "USD",
				Amount:               "-12.34",
				AmountUsd:            "-12.34",
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
				Amount:               "12.34",
				AmountUsd:            "12.34",
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	}

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), req)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertRecordTimestamps(t, "created", created.JSON201.Records[0], wantPendingDate, wantPostedDate)
	assertBodyContains(t, "created", created.Body, wantPendingJSON)
	assertBodyContains(t, "created", created.Body, wantPostedJSON)

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	assertRecordTimestamps(t, "read", read.JSON200.Records[0], wantPendingDate, wantPostedDate)
	assertBodyContains(t, "read", read.Body, wantPendingJSON)
	assertBodyContains(t, "read", read.Body, wantPostedJSON)

	list, err := client.REST().ListTransactionsWithResponse(context.Background())
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 1 {
		t.Fatalf("transaction count = %d, want 1; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
	assertRecordTimestamps(t, "list", list.JSON200.Transactions[0].Records[0], wantPendingDate, wantPostedDate)
	assertBodyContains(t, "list", list.Body, wantPendingJSON)
	assertBodyContains(t, "list", list.Body, wantPostedJSON)

	search, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		PendingDateFrom: &pendingDate,
		PendingDateTo:   &pendingDate,
		PostedDateFrom:  &postedDate,
		PostedDateTo:    &postedDate,
	})
	if err != nil {
		t.Fatalf("search request: %v", err)
	}
	if search.StatusCode() != http.StatusOK {
		t.Fatalf("search status = %d, want %d; body %s", search.StatusCode(), http.StatusOK, search.Body)
	}
	assertRecordIDs(t, search.JSON200.Records, []int64{created.JSON201.Records[0].RecordId})
	assertRecordTimestamps(t, "search", search.JSON200.Records[0], wantPendingDate, wantPostedDate)
	assertBodyContains(t, "search", search.Body, wantPendingJSON)
	assertBodyContains(t, "search", search.Body, wantPostedJSON)
}

func TestTransactionRejectsImbalanceAndDoesNotPersist(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	req := balancedTransactionRequest(refs)
	req.Records[1].AmountUsd = "11.00"

	rejected, err := client.REST().CreateTransactionWithResponse(context.Background(), req)
	if err != nil {
		t.Fatalf("imbalance request: %v", err)
	}
	if rejected.StatusCode() != http.StatusBadRequest {
		t.Fatalf("imbalance status = %d, want %d; body %s", rejected.StatusCode(), http.StatusBadRequest, rejected.Body)
	}

	list, err := client.REST().ListTransactionsWithResponse(context.Background())
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 0 {
		t.Fatalf("transaction count after rejected create = %d, want 0; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
}

func TestTransactionValidationErrors(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	missingAccount := balancedTransactionRequest(refs)
	missingAccount.Records[0].AccountId = 999
	missingAccountResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), missingAccount)
	if err != nil {
		t.Fatalf("missing account request: %v", err)
	}
	if missingAccountResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing account status = %d, want %d; body %s", missingAccountResponse.StatusCode(), http.StatusBadRequest, missingAccountResponse.Body)
	}

	missingMember := balancedTransactionRequest(refs)
	*missingMember.Records[0].MemberId = 999
	missingMemberResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), missingMember)
	if err != nil {
		t.Fatalf("missing member request: %v", err)
	}
	if missingMemberResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing member status = %d, want %d; body %s", missingMemberResponse.StatusCode(), http.StatusBadRequest, missingMemberResponse.Body)
	}

	missingCategory := balancedTransactionRequest(refs)
	missingCategory.Records[0].CategoryId = 999
	missingCategoryResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), missingCategory)
	if err != nil {
		t.Fatalf("missing category request: %v", err)
	}
	if missingCategoryResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing category status = %d, want %d; body %s", missingCategoryResponse.StatusCode(), http.StatusBadRequest, missingCategoryResponse.Body)
	}

	missingTag := balancedTransactionRequest(refs)
	missingTag.Records[0].TagIds = apptest.Int64SlicePtr(999)
	missingTagResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), missingTag)
	if err != nil {
		t.Fatalf("missing tag request: %v", err)
	}
	if missingTagResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing tag status = %d, want %d; body %s", missingTagResponse.StatusCode(), http.StatusBadRequest, missingTagResponse.Body)
	}

	invalidStatus := balancedTransactionRequest(refs)
	invalidStatus.Records[0].PostingStatus = httpclient.PostingStatus("settled")
	invalidStatusResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), invalidStatus)
	if err != nil {
		t.Fatalf("invalid status request: %v", err)
	}
	if invalidStatusResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid status status = %d, want %d; body %s", invalidStatusResponse.StatusCode(), http.StatusBadRequest, invalidStatusResponse.Body)
	}

	invalidReconciliation := balancedTransactionRequest(refs)
	invalidReconciliation.Records[0].ReconciliationStatus = httpclient.ReconciliationStatus("matched")
	invalidReconciliationResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), invalidReconciliation)
	if err != nil {
		t.Fatalf("invalid reconciliation request: %v", err)
	}
	if invalidReconciliationResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid reconciliation status = %d, want %d; body %s", invalidReconciliationResponse.StatusCode(), http.StatusBadRequest, invalidReconciliationResponse.Body)
	}

	invalidSource := balancedTransactionRequest(refs)
	invalidSource.Records[0].Source = httpclient.Source("imported")
	invalidSourceResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), invalidSource)
	if err != nil {
		t.Fatalf("invalid source request: %v", err)
	}
	if invalidSourceResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid source status = %d, want %d; body %s", invalidSourceResponse.StatusCode(), http.StatusBadRequest, invalidSourceResponse.Body)
	}

	invalidDate := balancedTransactionRequest(refs)
	invalidDateResponse, err := client.REST().CreateTransactionWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"initiated_date": "2024-02-30",
		"records":        invalidDate.Records,
	}))
	if err != nil {
		t.Fatalf("invalid date request: %v", err)
	}
	if invalidDateResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid date status = %d, want %d; body %s", invalidDateResponse.StatusCode(), http.StatusBadRequest, invalidDateResponse.Body)
	}

	tooManyIntegerDigits := balancedTransactionRequest(refs)
	tooManyIntegerDigits.Records[0].Amount = "-12345678901"
	tooManyIntegerDigitsResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), tooManyIntegerDigits)
	if err != nil {
		t.Fatalf("too many integer digits request: %v", err)
	}
	if tooManyIntegerDigitsResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("too many integer digits status = %d, want %d; body %s", tooManyIntegerDigitsResponse.StatusCode(), http.StatusBadRequest, tooManyIntegerDigitsResponse.Body)
	}

	unsupportedListQuery, err := client.REST().ListTransactionsWithResponse(context.Background(), apptest.ReplaceRawQuery("limit=1"))
	if err != nil {
		t.Fatalf("unsupported list query request: %v", err)
	}
	if unsupportedListQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unsupported list query status = %d, want %d; body %s", unsupportedListQuery.StatusCode(), http.StatusBadRequest, unsupportedListQuery.Body)
	}
}

type transactionRefs struct {
	CheckingAccountId int64
	MerchantAccountId int64
	CategoryId        int64
	TagId             int64
	MemberId          int64
}

func createTransactionRefs(t *testing.T, client *apptest.Client) transactionRefs {
	t.Helper()

	refs := client.Scenario().TransactionRefs()

	return transactionRefs{
		CheckingAccountId: refs.CheckingAccountID,
		MerchantAccountId: refs.MerchantAccountID,
		CategoryId:        refs.CategoryID,
		TagId:             refs.TagID,
		MemberId:          refs.MemberID,
	}
}

func balancedTransactionRequest(refs transactionRefs) httpclient.CreateTransactionRequest {
	memo := "Lunch"
	pendingDate := apptest.Timestamp("2024-03-10T00:00:00Z")
	postedDate := apptest.Timestamp("2024-03-11T00:00:00Z")
	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				MemberId:             &refs.MemberId,
				Currency:             "USD",
				Amount:               "-12.34",
				AmountUsd:            "-12.34",
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
				Amount:               "12.34",
				AmountUsd:            "12.34",
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	}
}

func assertInt64s(t *testing.T, got []int64, want []int64) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("int64 slice length = %d, want %d; got %+v", len(got), len(want), got)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("int64 slice at %d = %d, want %d; got %+v", i, got[i], want[i], got)
		}
	}
}

func parseTimestamp(t *testing.T, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("parse timestamp %q: %v", value, err)
	}

	return parsed
}

func assertRecordTimestamps(t *testing.T, label string, record httpclient.JournalRecord, wantPending time.Time, wantPosted time.Time) {
	t.Helper()

	if record.PendingDate == nil || !record.PendingDate.Equal(wantPending) {
		t.Fatalf("%s pending_date = %v, want %s", label, record.PendingDate, wantPending.Format(time.RFC3339))
	}
	if record.PostedDate == nil || !record.PostedDate.Equal(wantPosted) {
		t.Fatalf("%s posted_date = %v, want %s", label, record.PostedDate, wantPosted.Format(time.RFC3339))
	}
}

func assertBodyContains(t *testing.T, label string, body []byte, want string) {
	t.Helper()

	if !bytes.Contains(body, []byte(want)) {
		t.Fatalf("%s body missing %s: %s", label, want, body)
	}
}
