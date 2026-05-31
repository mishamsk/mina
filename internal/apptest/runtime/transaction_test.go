package runtime_test

import (
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestTransactionCreateReadListBoundary(t *testing.T) {
	client := newClient(t)
	refs := createTransactionRefs(t, client)

	created := apptest.Decode[models.Transaction](client, http.MethodPost, "/transactions", balancedTransactionRequest(refs))
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}
	if created.Body.InitiatedDate != "2024-03-10" {
		t.Fatalf("initiated_date = %q, want 2024-03-10", created.Body.InitiatedDate)
	}
	if len(created.Body.Records) != 2 {
		t.Fatalf("created record count = %d, want 2; body %+v", len(created.Body.Records), created.Body)
	}
	if created.Body.Records[0].AccountId != refs.CheckingAccountId || created.Body.Records[1].AccountId != refs.MerchantAccountId {
		t.Fatalf("created account ids = %d/%d, want %d/%d", created.Body.Records[0].AccountId, created.Body.Records[1].AccountId, refs.CheckingAccountId, refs.MerchantAccountId)
	}
	if created.Body.Records[0].MemberId == nil || *created.Body.Records[0].MemberId != refs.MemberId {
		t.Fatalf("member_id = %v, want %d", created.Body.Records[0].MemberId, refs.MemberId)
	}
	assertInt64s(t, created.Body.Records[0].TagIds, []int64{refs.TagId})

	read := apptest.Decode[models.Transaction](client, http.MethodGet, transactionPath(created.Body.TransactionId), nil)
	if read.StatusCode != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode, http.StatusOK, read.RawBody)
	}
	if read.Body.TransactionId != created.Body.TransactionId {
		t.Fatalf("read transaction id = %d, want %d", read.Body.TransactionId, created.Body.TransactionId)
	}
	if len(read.Body.Records) != 2 {
		t.Fatalf("read record count = %d, want 2; body %+v", len(read.Body.Records), read.Body)
	}
	if read.Body.Records[0].Memo == nil || *read.Body.Records[0].Memo != "Lunch" {
		t.Fatalf("read memo = %v, want Lunch", read.Body.Records[0].Memo)
	}

	list := apptest.Decode[models.TransactionListResponse](client, http.MethodGet, "/transactions", nil)
	if list.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode, http.StatusOK, list.RawBody)
	}
	if len(list.Body.Transactions) != 1 {
		t.Fatalf("transaction count = %d, want 1; body %+v", len(list.Body.Transactions), list.Body)
	}
	if list.Body.Transactions[0].TransactionId != created.Body.TransactionId || len(list.Body.Transactions[0].Records) != 2 {
		t.Fatalf("listed transaction = %+v, want id %d with 2 records", list.Body.Transactions[0], created.Body.TransactionId)
	}
}

func TestTransactionDuckDBMappingsBoundary(t *testing.T) {
	client := newClient(t)
	refs := createTransactionRefs(t, client)

	created := apptest.Decode[models.Transaction](client, http.MethodPost, "/transactions", balancedTransactionRequest(refs))
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}
	record := created.Body.Records[0]
	if record.PostingStatus != models.Posted {
		t.Fatalf("posting_status = %q, want %q", record.PostingStatus, models.Posted)
	}
	if record.ReconciliationStatus != models.Reconciled {
		t.Fatalf("reconciliation_status = %q, want %q", record.ReconciliationStatus, models.Reconciled)
	}
	if record.Source != models.Manual {
		t.Fatalf("source = %q, want %q", record.Source, models.Manual)
	}
	if record.PendingDate == nil || *record.PendingDate != "2024-03-10" {
		t.Fatalf("pending_date = %v, want 2024-03-10", record.PendingDate)
	}
	if record.PostedDate == nil || *record.PostedDate != "2024-03-11" {
		t.Fatalf("posted_date = %v, want 2024-03-11", record.PostedDate)
	}
	if record.Amount != "-12.34000000" || record.AmountUsd != "-12.34000000" {
		t.Fatalf("amounts = %q/%q, want -12.34000000/-12.34000000", record.Amount, record.AmountUsd)
	}
	assertInt64s(t, record.TagIds, []int64{refs.TagId})

	var dbPostingStatus string
	var dbReconciliationStatus string
	var dbSource string
	var dbPendingDate string
	var dbPostedDate string
	var dbCreatedAt string
	var dbUpdatedAt string
	var dbAmount string
	var hasTag bool
	persistence := client.Persistence()
	if err := persistence.QueryRowContext(
		t.Context(),
		`SELECT CAST(posting_status AS VARCHAR), CAST(reconciliation_status AS VARCHAR), CAST(source AS VARCHAR),
	CAST(pending_date AS VARCHAR), CAST(posted_date AS VARCHAR), CAST(created_at AS VARCHAR), CAST(updated_at AS VARCHAR), CAST(amount AS VARCHAR),
	list_contains(tag_ids, ?)
FROM `+persistence.QualifiedName("journal_record")+`
WHERE record_id = ?`,
		refs.TagId,
		record.RecordId,
	).Scan(&dbPostingStatus, &dbReconciliationStatus, &dbSource, &dbPendingDate, &dbPostedDate, &dbCreatedAt, &dbUpdatedAt, &dbAmount, &hasTag); err != nil {
		t.Fatalf("read db-backed transaction mapping: %v", err)
	}
	if dbPostingStatus != "POSTED" || dbReconciliationStatus != "RECONCILED" || dbSource != "MANUAL" {
		t.Fatalf("db enum values = %q/%q/%q, want POSTED/RECONCILED/MANUAL", dbPostingStatus, dbReconciliationStatus, dbSource)
	}
	if dbPendingDate != "2024-03-10" || dbPostedDate != "2024-03-11" {
		t.Fatalf("db dates = %q/%q, want 2024-03-10/2024-03-11", dbPendingDate, dbPostedDate)
	}
	if record.CreatedAt != dbCreatedAt || record.UpdatedAt != dbUpdatedAt {
		t.Fatalf("api timestamps = %q/%q, want db timestamps %q/%q", record.CreatedAt, record.UpdatedAt, dbCreatedAt, dbUpdatedAt)
	}
	if dbCreatedAt == "" || dbAmount != "-12.34000000" || !hasTag {
		t.Fatalf("db timestamp/decimal/tag = %q/%q/%v, want timestamp/-12.34000000/true", dbCreatedAt, dbAmount, hasTag)
	}
}

func TestTransactionRejectsImbalanceAndDoesNotPersist(t *testing.T) {
	client := newClient(t)
	refs := createTransactionRefs(t, client)
	req := balancedTransactionRequest(refs)
	req.Records[1].AmountUsd = "11.00"

	rejected := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", req)
	if rejected.StatusCode != http.StatusBadRequest {
		t.Fatalf("imbalance status = %d, want %d; body %s", rejected.StatusCode, http.StatusBadRequest, rejected.RawBody)
	}

	list := apptest.Decode[models.TransactionListResponse](client, http.MethodGet, "/transactions", nil)
	if list.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode, http.StatusOK, list.RawBody)
	}
	if len(list.Body.Transactions) != 0 {
		t.Fatalf("transaction count after rejected create = %d, want 0; body %+v", len(list.Body.Transactions), list.Body)
	}
}

func TestTransactionValidationErrors(t *testing.T) {
	client := newClient(t)
	refs := createTransactionRefs(t, client)

	missingAccount := balancedTransactionRequest(refs)
	missingAccount.Records[0].AccountId = 999
	missingAccountResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", missingAccount)
	if missingAccountResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing account status = %d, want %d; body %s", missingAccountResponse.StatusCode, http.StatusBadRequest, missingAccountResponse.RawBody)
	}

	missingMember := balancedTransactionRequest(refs)
	*missingMember.Records[0].MemberId = 999
	missingMemberResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", missingMember)
	if missingMemberResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing member status = %d, want %d; body %s", missingMemberResponse.StatusCode, http.StatusBadRequest, missingMemberResponse.RawBody)
	}

	missingCategory := balancedTransactionRequest(refs)
	missingCategory.Records[0].CategoryId = 999
	missingCategoryResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", missingCategory)
	if missingCategoryResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing category status = %d, want %d; body %s", missingCategoryResponse.StatusCode, http.StatusBadRequest, missingCategoryResponse.RawBody)
	}

	missingTag := balancedTransactionRequest(refs)
	missingTag.Records[0].TagIds = apptest.Int64SlicePtr(999)
	missingTagResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", missingTag)
	if missingTagResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing tag status = %d, want %d; body %s", missingTagResponse.StatusCode, http.StatusBadRequest, missingTagResponse.RawBody)
	}

	invalidStatus := balancedTransactionRequest(refs)
	invalidStatus.Records[0].PostingStatus = models.PostingStatus("settled")
	invalidStatusResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", invalidStatus)
	if invalidStatusResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid status status = %d, want %d; body %s", invalidStatusResponse.StatusCode, http.StatusBadRequest, invalidStatusResponse.RawBody)
	}

	invalidReconciliation := balancedTransactionRequest(refs)
	invalidReconciliation.Records[0].ReconciliationStatus = models.ReconciliationStatus("matched")
	invalidReconciliationResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", invalidReconciliation)
	if invalidReconciliationResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid reconciliation status = %d, want %d; body %s", invalidReconciliationResponse.StatusCode, http.StatusBadRequest, invalidReconciliationResponse.RawBody)
	}

	invalidSource := balancedTransactionRequest(refs)
	invalidSource.Records[0].Source = models.Source("imported")
	invalidSourceResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", invalidSource)
	if invalidSourceResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid source status = %d, want %d; body %s", invalidSourceResponse.StatusCode, http.StatusBadRequest, invalidSourceResponse.RawBody)
	}

	invalidDate := balancedTransactionRequest(refs)
	invalidDate.InitiatedDate = "2024-02-30"
	invalidDateResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", invalidDate)
	if invalidDateResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid date status = %d, want %d; body %s", invalidDateResponse.StatusCode, http.StatusBadRequest, invalidDateResponse.RawBody)
	}

	tooManyIntegerDigits := balancedTransactionRequest(refs)
	tooManyIntegerDigits.Records[0].Amount = "-12345678901"
	tooManyIntegerDigitsResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", tooManyIntegerDigits)
	if tooManyIntegerDigitsResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("too many integer digits status = %d, want %d; body %s", tooManyIntegerDigitsResponse.StatusCode, http.StatusBadRequest, tooManyIntegerDigitsResponse.RawBody)
	}

	unsupportedListQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/transactions?limit=1", nil)
	if unsupportedListQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("unsupported list query status = %d, want %d; body %s", unsupportedListQuery.StatusCode, http.StatusBadRequest, unsupportedListQuery.RawBody)
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

func balancedTransactionRequest(refs transactionRefs) models.CreateTransactionRequest {
	return models.CreateTransactionRequest{
		InitiatedDate: "2024-03-10",
		Records: []models.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				MemberId:             &refs.MemberId,
				Currency:             "USD",
				Amount:               "-12.34",
				AmountUsd:            "-12.34",
				CategoryId:           refs.CategoryId,
				TagIds:               apptest.Int64SlicePtr(refs.TagId),
				Memo:                 apptest.StringPtr("Lunch"),
				PendingDate:          apptest.StringPtr("2024-03-10"),
				PostedDate:           apptest.StringPtr("2024-03-11"),
				PostingStatus:        models.Posted,
				ReconciliationStatus: models.Reconciled,
				Source:               models.Manual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "12.34",
				AmountUsd:            "12.34",
				CategoryId:           refs.CategoryId,
				PostingStatus:        models.Posted,
				ReconciliationStatus: models.Reconciled,
				Source:               models.Manual,
			},
		},
	}
}

func transactionPath(id int64) string {
	return apptest.IDPath("/transactions", id)
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
