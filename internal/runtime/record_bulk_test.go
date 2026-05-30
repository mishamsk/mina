package runtime_test

import (
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestRecordBulkOperationsBoundary(t *testing.T) {
	client := apptest.New(t)
	refs := createSearchRefs(t, client)

	created := apptest.Decode[models.Transaction](client, http.MethodPost, "/transactions", balancedTransactionRequest(refs.transactionRefs))
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}
	firstRecordID := created.Body.Records[0].RecordId
	secondRecordID := created.Body.Records[1].RecordId

	bulkCategory := apptest.Decode[models.BulkRecordOperationResponse](client, http.MethodPost, "/records/bulk/category", models.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID},
		CategoryId: refs.SecondCategoryId,
	})
	if bulkCategory.StatusCode != http.StatusOK {
		t.Fatalf("bulk category status = %d, want %d; body %s", bulkCategory.StatusCode, http.StatusOK, bulkCategory.RawBody)
	}
	assertBulkResponse(t, bulkCategory.Body, []int64{firstRecordID})
	categorized := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, "/records?category_id="+formatID(refs.SecondCategoryId), nil)
	if categorized.StatusCode != http.StatusOK {
		t.Fatalf("categorized search status = %d, want %d; body %s", categorized.StatusCode, http.StatusOK, categorized.RawBody)
	}
	assertRecordIDs(t, categorized.Body.Records, []int64{firstRecordID})

	bulkTags := apptest.Decode[models.BulkRecordOperationResponse](client, http.MethodPost, "/records/bulk/tags", models.BulkTagRecordsRequest{
		RecordIds:    []int64{firstRecordID, secondRecordID},
		AddTagIds:    int64SlicePtr(refs.SecondTagId),
		RemoveTagIds: int64SlicePtr(refs.TagId),
	})
	if bulkTags.StatusCode != http.StatusOK {
		t.Fatalf("bulk tags status = %d, want %d; body %s", bulkTags.StatusCode, http.StatusOK, bulkTags.RawBody)
	}
	assertBulkResponse(t, bulkTags.Body, []int64{firstRecordID, secondRecordID})
	addedTag := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, "/records?tag_id="+formatID(refs.SecondTagId), nil)
	if addedTag.StatusCode != http.StatusOK {
		t.Fatalf("added tag search status = %d, want %d; body %s", addedTag.StatusCode, http.StatusOK, addedTag.RawBody)
	}
	assertRecordIDs(t, addedTag.Body.Records, []int64{firstRecordID, secondRecordID})
	removedTag := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, "/records?tag_id="+formatID(refs.TagId), nil)
	if removedTag.StatusCode != http.StatusOK {
		t.Fatalf("removed tag search status = %d, want %d; body %s", removedTag.StatusCode, http.StatusOK, removedTag.RawBody)
	}
	if len(removedTag.Body.Records) != 0 {
		t.Fatalf("old tag record count = %d, want 0; body %+v", len(removedTag.Body.Records), removedTag.Body)
	}

	bulkAccount := apptest.Decode[models.BulkRecordOperationResponse](client, http.MethodPost, "/records/bulk/account", models.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{secondRecordID},
		AccountId: refs.SavingsAccountId,
	})
	if bulkAccount.StatusCode != http.StatusOK {
		t.Fatalf("bulk account status = %d, want %d; body %s", bulkAccount.StatusCode, http.StatusOK, bulkAccount.RawBody)
	}
	assertBulkResponse(t, bulkAccount.Body, []int64{secondRecordID})
	accountRecords := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, accountRecordsPath(refs.SavingsAccountId), nil)
	if accountRecords.StatusCode != http.StatusOK {
		t.Fatalf("account records status = %d, want %d; body %s", accountRecords.StatusCode, http.StatusOK, accountRecords.RawBody)
	}
	assertRecordIDs(t, accountRecords.Body.Records, []int64{secondRecordID})
	if accountRecords.Body.Records[0].TransactionId != created.Body.TransactionId {
		t.Fatalf("bulk account transaction_id = %d, want %d", accountRecords.Body.Records[0].TransactionId, created.Body.TransactionId)
	}

	postingStatus := models.Cancelled
	reconciliationStatus := models.Unreconciled
	bulkStatus := apptest.Decode[models.BulkRecordOperationResponse](client, http.MethodPost, "/records/bulk/status", models.BulkUpdateRecordStatusRequest{
		RecordIds:            []int64{firstRecordID, secondRecordID},
		PostingStatus:        &postingStatus,
		ReconciliationStatus: &reconciliationStatus,
	})
	if bulkStatus.StatusCode != http.StatusOK {
		t.Fatalf("bulk status status = %d, want %d; body %s", bulkStatus.StatusCode, http.StatusOK, bulkStatus.RawBody)
	}
	assertBulkResponse(t, bulkStatus.Body, []int64{firstRecordID, secondRecordID})
	statusRecords := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, "/records?posting_status=cancelled&reconciliation_status=unreconciled", nil)
	if statusRecords.StatusCode != http.StatusOK {
		t.Fatalf("status search status = %d, want %d; body %s", statusRecords.StatusCode, http.StatusOK, statusRecords.RawBody)
	}
	assertRecordIDs(t, statusRecords.Body.Records, []int64{firstRecordID, secondRecordID})
}

func TestRecordBulkOperationsRejectInvalidRequestsAndRollback(t *testing.T) {
	client := apptest.New(t)
	refs := createSearchRefs(t, client)

	created := apptest.Decode[models.Transaction](client, http.MethodPost, "/transactions", balancedTransactionRequest(refs.transactionRefs))
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}
	firstRecordID := created.Body.Records[0].RecordId

	emptySelection := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/category", models.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{},
		CategoryId: refs.SecondCategoryId,
	})
	if emptySelection.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty selection status = %d, want %d; body %s", emptySelection.StatusCode, http.StatusBadRequest, emptySelection.RawBody)
	}

	duplicateSelection := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/category", models.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID, firstRecordID},
		CategoryId: refs.SecondCategoryId,
	})
	if duplicateSelection.StatusCode != http.StatusBadRequest {
		t.Fatalf("duplicate selection status = %d, want %d; body %s", duplicateSelection.StatusCode, http.StatusBadRequest, duplicateSelection.RawBody)
	}

	missingCategory := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/category", models.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID},
		CategoryId: 999,
	})
	if missingCategory.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing category status = %d, want %d; body %s", missingCategory.StatusCode, http.StatusBadRequest, missingCategory.RawBody)
	}

	missingTag := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/tags", models.BulkTagRecordsRequest{
		RecordIds: []int64{firstRecordID},
		AddTagIds: int64SlicePtr(999),
	})
	if missingTag.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing tag status = %d, want %d; body %s", missingTag.StatusCode, http.StatusBadRequest, missingTag.RawBody)
	}

	noOpTags := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/tags", models.BulkTagRecordsRequest{
		RecordIds: []int64{firstRecordID},
	})
	if noOpTags.StatusCode != http.StatusBadRequest {
		t.Fatalf("no-op tag status = %d, want %d; body %s", noOpTags.StatusCode, http.StatusBadRequest, noOpTags.RawBody)
	}

	overlappingTags := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/tags", models.BulkTagRecordsRequest{
		RecordIds:    []int64{firstRecordID},
		AddTagIds:    int64SlicePtr(refs.SecondTagId),
		RemoveTagIds: int64SlicePtr(refs.SecondTagId),
	})
	if overlappingTags.StatusCode != http.StatusBadRequest {
		t.Fatalf("overlapping tag status = %d, want %d; body %s", overlappingTags.StatusCode, http.StatusBadRequest, overlappingTags.RawBody)
	}

	missingAccount := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/account", models.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{firstRecordID},
		AccountId: 999,
	})
	if missingAccount.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing account status = %d, want %d; body %s", missingAccount.StatusCode, http.StatusBadRequest, missingAccount.RawBody)
	}

	noOpStatus := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/status", models.BulkUpdateRecordStatusRequest{
		RecordIds: []int64{firstRecordID},
	})
	if noOpStatus.StatusCode != http.StatusBadRequest {
		t.Fatalf("no-op status status = %d, want %d; body %s", noOpStatus.StatusCode, http.StatusBadRequest, noOpStatus.RawBody)
	}

	invalidStatus := models.PostingStatus("settled")
	invalidStatusResponse := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/status", models.BulkUpdateRecordStatusRequest{
		RecordIds:     []int64{firstRecordID},
		PostingStatus: &invalidStatus,
	})
	if invalidStatusResponse.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid status status = %d, want %d; body %s", invalidStatusResponse.StatusCode, http.StatusBadRequest, invalidStatusResponse.RawBody)
	}

	allOrNothing := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/records/bulk/category", models.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID, 999},
		CategoryId: refs.SecondCategoryId,
	})
	if allOrNothing.StatusCode != http.StatusBadRequest {
		t.Fatalf("all-or-nothing status = %d, want %d; body %s", allOrNothing.StatusCode, http.StatusBadRequest, allOrNothing.RawBody)
	}
	newCategoryRecords := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, "/records?category_id="+formatID(refs.SecondCategoryId), nil)
	if newCategoryRecords.StatusCode != http.StatusOK {
		t.Fatalf("new category search status = %d, want %d; body %s", newCategoryRecords.StatusCode, http.StatusOK, newCategoryRecords.RawBody)
	}
	if len(newCategoryRecords.Body.Records) != 0 {
		t.Fatalf("new category record count after rejected bulk update = %d, want 0; body %+v", len(newCategoryRecords.Body.Records), newCategoryRecords.Body)
	}
	originalCategoryRecords := apptest.Decode[models.JournalRecordSearchResponse](client, http.MethodGet, "/records?category_id="+formatID(refs.CategoryId), nil)
	if originalCategoryRecords.StatusCode != http.StatusOK {
		t.Fatalf("original category search status = %d, want %d; body %s", originalCategoryRecords.StatusCode, http.StatusOK, originalCategoryRecords.RawBody)
	}
	assertRecordIDs(t, originalCategoryRecords.Body.Records, []int64{created.Body.Records[0].RecordId, created.Body.Records[1].RecordId})
}

func assertBulkResponse(t *testing.T, got models.BulkRecordOperationResponse, wantRecordIDs []int64) {
	t.Helper()

	assertInt64s(t, got.RecordIds, wantRecordIDs)
	if got.UpdatedCount != len(wantRecordIDs) {
		t.Fatalf("updated_count = %d, want %d", got.UpdatedCount, len(wantRecordIDs))
	}
}
