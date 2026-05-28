package app_test

import (
	"net/http"
	"strconv"
	"testing"

	"mina.local/mina/internal/apptest"
	"mina.local/mina/internal/models"
)

func TestTransactionCreateReadListBoundary(t *testing.T) {
	client := apptest.New(t)
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
	if created.Body.Records[0].AccountID != refs.CheckingAccountID || created.Body.Records[1].AccountID != refs.MerchantAccountID {
		t.Fatalf("created account ids = %d/%d, want %d/%d", created.Body.Records[0].AccountID, created.Body.Records[1].AccountID, refs.CheckingAccountID, refs.MerchantAccountID)
	}
	if created.Body.Records[0].MemberID == nil || *created.Body.Records[0].MemberID != refs.MemberID {
		t.Fatalf("member_id = %v, want %d", created.Body.Records[0].MemberID, refs.MemberID)
	}
	assertInt64s(t, created.Body.Records[0].TagIDs, []int64{refs.TagID})

	read := apptest.Decode[models.Transaction](client, http.MethodGet, transactionPath(created.Body.ID), nil)
	if read.StatusCode != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode, http.StatusOK, read.RawBody)
	}
	if read.Body.ID != created.Body.ID {
		t.Fatalf("read transaction id = %d, want %d", read.Body.ID, created.Body.ID)
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
	if list.Body.Transactions[0].ID != created.Body.ID || len(list.Body.Transactions[0].Records) != 2 {
		t.Fatalf("listed transaction = %+v, want id %d with 2 records", list.Body.Transactions[0], created.Body.ID)
	}
}

func TestTransactionRejectsImbalanceAndDoesNotPersist(t *testing.T) {
	client := apptest.New(t)
	refs := createTransactionRefs(t, client)
	req := balancedTransactionRequest(refs)
	req.Records[1].AmountUSD = "11.00"

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
	client := apptest.New(t)
	refs := createTransactionRefs(t, client)

	missingAccount := balancedTransactionRequest(refs)
	missingAccount.Records[0].AccountID = 999
	missingAccountResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", missingAccount)
	if missingAccountResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing account status = %d, want %d; body %s", missingAccountResponse.StatusCode, http.StatusBadRequest, missingAccountResponse.RawBody)
	}

	missingMember := balancedTransactionRequest(refs)
	*missingMember.Records[0].MemberID = 999
	missingMemberResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", missingMember)
	if missingMemberResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing member status = %d, want %d; body %s", missingMemberResponse.StatusCode, http.StatusBadRequest, missingMemberResponse.RawBody)
	}

	missingCategory := balancedTransactionRequest(refs)
	missingCategory.Records[0].CategoryID = 999
	missingCategoryResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/transactions", missingCategory)
	if missingCategoryResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing category status = %d, want %d; body %s", missingCategoryResponse.StatusCode, http.StatusBadRequest, missingCategoryResponse.RawBody)
	}

	missingTag := balancedTransactionRequest(refs)
	missingTag.Records[0].TagIDs = []int64{999}
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

	unsupportedListQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/transactions?limit=1", nil)
	if unsupportedListQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("unsupported list query status = %d, want %d; body %s", unsupportedListQuery.StatusCode, http.StatusBadRequest, unsupportedListQuery.RawBody)
	}
}

type transactionRefs struct {
	CheckingAccountID int64
	MerchantAccountID int64
	CategoryID        int64
	TagID             int64
	MemberID          int64
}

func createTransactionRefs(t *testing.T, client *apptest.Client) transactionRefs {
	t.Helper()

	checking := apptest.Decode[models.Account](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:      "checking:Chase:Primary",
		Currency: stringPtr("USD"),
	})
	if checking.StatusCode != http.StatusCreated {
		t.Fatalf("checking account status = %d, want %d; body %s", checking.StatusCode, http.StatusCreated, checking.RawBody)
	}
	merchant := apptest.Decode[models.Account](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN: "merchant:CoffeeShop",
	})
	if merchant.StatusCode != http.StatusCreated {
		t.Fatalf("merchant account status = %d, want %d; body %s", merchant.StatusCode, http.StatusCreated, merchant.RawBody)
	}
	category := apptest.Decode[models.Category](client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		FQN: "Food:Restaurants",
	})
	if category.StatusCode != http.StatusCreated {
		t.Fatalf("category status = %d, want %d; body %s", category.StatusCode, http.StatusCreated, category.RawBody)
	}
	tag := apptest.Decode[models.Tag](client, http.MethodPost, "/tags", models.CreateTagRequest{
		FQN: "Trips:Local",
	})
	if tag.StatusCode != http.StatusCreated {
		t.Fatalf("tag status = %d, want %d; body %s", tag.StatusCode, http.StatusCreated, tag.RawBody)
	}
	member := apptest.Decode[models.Member](client, http.MethodPost, "/members", models.CreateMemberRequest{
		Name: "Avery",
	})
	if member.StatusCode != http.StatusCreated {
		t.Fatalf("member status = %d, want %d; body %s", member.StatusCode, http.StatusCreated, member.RawBody)
	}

	return transactionRefs{
		CheckingAccountID: checking.Body.ID,
		MerchantAccountID: merchant.Body.ID,
		CategoryID:        category.Body.ID,
		TagID:             tag.Body.ID,
		MemberID:          member.Body.ID,
	}
}

func balancedTransactionRequest(refs transactionRefs) models.CreateTransactionRequest {
	return models.CreateTransactionRequest{
		InitiatedDate: "2024-03-10",
		Records: []models.CreateJournalRecordRequest{
			{
				AccountID:            refs.CheckingAccountID,
				MemberID:             &refs.MemberID,
				Currency:             "USD",
				Amount:               "-12.34",
				AmountUSD:            "-12.34",
				CategoryID:           refs.CategoryID,
				TagIDs:               []int64{refs.TagID},
				Memo:                 stringPtr("Lunch"),
				PendingDate:          stringPtr("2024-03-10"),
				PostedDate:           stringPtr("2024-03-11"),
				PostingStatus:        models.PostingStatusPosted,
				ReconciliationStatus: models.ReconciliationStatusReconciled,
				Source:               models.SourceManual,
			},
			{
				AccountID:            refs.MerchantAccountID,
				Currency:             "USD",
				Amount:               "12.34",
				AmountUSD:            "12.34",
				CategoryID:           refs.CategoryID,
				PostingStatus:        models.PostingStatusPosted,
				ReconciliationStatus: models.ReconciliationStatusReconciled,
				Source:               models.SourceManual,
			},
		},
	}
}

func transactionPath(id int64) string {
	return "/transactions/" + strconv.FormatInt(id, 10)
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
