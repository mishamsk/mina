package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestRecordBulkOperationsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs.transactionRefs))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	firstRecordID := created.JSON201.Records[0].RecordId
	secondRecordID := created.JSON201.Records[1].RecordId
	replacementMerchant := client.Scenario().Account("merchant:BulkReplacement")

	bulkCategory, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID},
		CategoryId: refs.SecondCategoryId,
	})
	requireNoTransportError(t, "bulk categorize records", err)
	if bulkCategory.StatusCode() != http.StatusOK {
		t.Fatalf("bulk category status = %d, want %d; body %s", bulkCategory.StatusCode(), http.StatusOK, bulkCategory.Body)
	}
	assertBulkResponse(t, bulkCategory.JSON200, []int64{firstRecordID})
	categorized, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{CategoryId: &refs.SecondCategoryId})
	requireNoTransportError(t, "search records", err)
	if categorized.StatusCode() != http.StatusOK {
		t.Fatalf("categorized search status = %d, want %d; body %s", categorized.StatusCode(), http.StatusOK, categorized.Body)
	}
	assertRecordIDs(t, categorized.JSON200.Records, []int64{firstRecordID})

	bulkTags, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{
		RecordIds:    []int64{firstRecordID, secondRecordID},
		AddTagIds:    apptest.Int64SlicePtr(refs.SecondTagId),
		RemoveTagIds: apptest.Int64SlicePtr(refs.TagId),
	})
	requireNoTransportError(t, "bulk update record tags", err)
	if bulkTags.StatusCode() != http.StatusOK {
		t.Fatalf("bulk tags status = %d, want %d; body %s", bulkTags.StatusCode(), http.StatusOK, bulkTags.Body)
	}
	assertBulkResponse(t, bulkTags.JSON200, []int64{firstRecordID, secondRecordID})
	addedTag, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{TagId: &refs.SecondTagId})
	requireNoTransportError(t, "search records", err)
	if addedTag.StatusCode() != http.StatusOK {
		t.Fatalf("added tag search status = %d, want %d; body %s", addedTag.StatusCode(), http.StatusOK, addedTag.Body)
	}
	assertRecordIDs(t, addedTag.JSON200.Records, []int64{firstRecordID, secondRecordID})
	removedTag, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{TagId: &refs.TagId})
	requireNoTransportError(t, "search records", err)
	if removedTag.StatusCode() != http.StatusOK {
		t.Fatalf("removed tag search status = %d, want %d; body %s", removedTag.StatusCode(), http.StatusOK, removedTag.Body)
	}
	if len(removedTag.JSON200.Records) != 0 {
		t.Fatalf("old tag record count = %d, want 0; body %+v", len(removedTag.JSON200.Records), removedTag.JSON200)
	}

	bulkAccount, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{secondRecordID},
		AccountId: replacementMerchant.AccountId,
	})
	requireNoTransportError(t, "bulk reassign record account", err)
	if bulkAccount.StatusCode() != http.StatusOK {
		t.Fatalf("bulk account status = %d, want %d; body %s", bulkAccount.StatusCode(), http.StatusOK, bulkAccount.Body)
	}
	assertBulkResponse(t, bulkAccount.JSON200, []int64{secondRecordID})
	accountRecords, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), replacementMerchant.AccountId, nil)
	requireNoTransportError(t, "search account records", err)
	if accountRecords.StatusCode() != http.StatusOK {
		t.Fatalf("account records status = %d, want %d; body %s", accountRecords.StatusCode(), http.StatusOK, accountRecords.Body)
	}
	assertRecordIDs(t, accountRecords.JSON200.Records, []int64{secondRecordID})
	if accountRecords.JSON200.Records[0].TransactionId != created.JSON201.TransactionId {
		t.Fatalf("bulk account transaction_id = %d, want %d", accountRecords.JSON200.Records[0].TransactionId, created.JSON201.TransactionId)
	}

	postingStatus := httpclient.Cancelled
	reconciliationStatus := httpclient.Unreconciled
	bulkStatus, err := client.REST().BulkUpdateJournalRecordStatusesWithResponse(context.Background(), httpclient.BulkUpdateRecordStatusRequest{
		RecordIds:            []int64{firstRecordID, secondRecordID},
		PostingStatus:        &postingStatus,
		ReconciliationStatus: &reconciliationStatus,
	})
	requireNoTransportError(t, "bulk update record statuses", err)
	if bulkStatus.StatusCode() != http.StatusOK {
		t.Fatalf("bulk status status = %d, want %d; body %s", bulkStatus.StatusCode(), http.StatusOK, bulkStatus.Body)
	}
	assertBulkResponse(t, bulkStatus.JSON200, []int64{firstRecordID, secondRecordID})
	statusRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		PostingStatus:        &postingStatus,
		ReconciliationStatus: &reconciliationStatus,
	})
	requireNoTransportError(t, "search records", err)
	if statusRecords.StatusCode() != http.StatusOK {
		t.Fatalf("status search status = %d, want %d; body %s", statusRecords.StatusCode(), http.StatusOK, statusRecords.Body)
	}
	assertRecordIDs(t, statusRecords.JSON200.Records, []int64{firstRecordID, secondRecordID})
}

func TestRecordBulkOperationsRejectInvalidRequestsAndRollback(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs.transactionRefs))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	firstRecordID := created.JSON201.Records[0].RecordId

	emptySelection, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{},
		CategoryId: refs.SecondCategoryId,
	})
	requireNoTransportError(t, "bulk categorize records", err)
	if emptySelection.StatusCode() != http.StatusBadRequest {
		t.Fatalf("empty selection status = %d, want %d; body %s", emptySelection.StatusCode(), http.StatusBadRequest, emptySelection.Body)
	}

	duplicateSelection, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID, firstRecordID},
		CategoryId: refs.SecondCategoryId,
	})
	requireNoTransportError(t, "bulk categorize records", err)
	if duplicateSelection.StatusCode() != http.StatusBadRequest {
		t.Fatalf("duplicate selection status = %d, want %d; body %s", duplicateSelection.StatusCode(), http.StatusBadRequest, duplicateSelection.Body)
	}

	missingCategory, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID},
		CategoryId: 999,
	})
	requireNoTransportError(t, "bulk categorize records", err)
	if missingCategory.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing category status = %d, want %d; body %s", missingCategory.StatusCode(), http.StatusBadRequest, missingCategory.Body)
	}

	missingTag, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{
		RecordIds: []int64{firstRecordID},
		AddTagIds: apptest.Int64SlicePtr(999),
	})
	requireNoTransportError(t, "bulk update record tags", err)
	if missingTag.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing tag status = %d, want %d; body %s", missingTag.StatusCode(), http.StatusBadRequest, missingTag.Body)
	}

	noOpTags, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{
		RecordIds: []int64{firstRecordID},
	})
	requireNoTransportError(t, "bulk update record tags", err)
	if noOpTags.StatusCode() != http.StatusBadRequest {
		t.Fatalf("no-op tag status = %d, want %d; body %s", noOpTags.StatusCode(), http.StatusBadRequest, noOpTags.Body)
	}

	overlappingTags, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{
		RecordIds:    []int64{firstRecordID},
		AddTagIds:    apptest.Int64SlicePtr(refs.SecondTagId),
		RemoveTagIds: apptest.Int64SlicePtr(refs.SecondTagId),
	})
	requireNoTransportError(t, "bulk update record tags", err)
	if overlappingTags.StatusCode() != http.StatusBadRequest {
		t.Fatalf("overlapping tag status = %d, want %d; body %s", overlappingTags.StatusCode(), http.StatusBadRequest, overlappingTags.Body)
	}

	missingAccount, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{firstRecordID},
		AccountId: 999,
	})
	requireNoTransportError(t, "bulk reassign record account", err)
	if missingAccount.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing account status = %d, want %d; body %s", missingAccount.StatusCode(), http.StatusBadRequest, missingAccount.Body)
	}

	noOpStatus, err := client.REST().BulkUpdateJournalRecordStatusesWithResponse(context.Background(), httpclient.BulkUpdateRecordStatusRequest{
		RecordIds: []int64{firstRecordID},
	})
	requireNoTransportError(t, "bulk update record statuses", err)
	if noOpStatus.StatusCode() != http.StatusBadRequest {
		t.Fatalf("no-op status status = %d, want %d; body %s", noOpStatus.StatusCode(), http.StatusBadRequest, noOpStatus.Body)
	}

	invalidStatus := httpclient.PostingStatus("settled")
	invalidStatusResponse, err := client.REST().BulkUpdateJournalRecordStatusesWithResponse(context.Background(), httpclient.BulkUpdateRecordStatusRequest{
		RecordIds:     []int64{firstRecordID},
		PostingStatus: &invalidStatus,
	})
	requireNoTransportError(t, "bulk update record statuses", err)
	if invalidStatusResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid status status = %d, want %d; body %s", invalidStatusResponse.StatusCode(), http.StatusBadRequest, invalidStatusResponse.Body)
	}

	allOrNothing, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID, 999},
		CategoryId: refs.SecondCategoryId,
	})
	requireNoTransportError(t, "bulk categorize records", err)
	if allOrNothing.StatusCode() != http.StatusBadRequest {
		t.Fatalf("all-or-nothing status = %d, want %d; body %s", allOrNothing.StatusCode(), http.StatusBadRequest, allOrNothing.Body)
	}
	newCategoryRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{CategoryId: &refs.SecondCategoryId})
	requireNoTransportError(t, "search records", err)
	if newCategoryRecords.StatusCode() != http.StatusOK {
		t.Fatalf("new category search status = %d, want %d; body %s", newCategoryRecords.StatusCode(), http.StatusOK, newCategoryRecords.Body)
	}
	if len(newCategoryRecords.JSON200.Records) != 0 {
		t.Fatalf("new category record count after rejected bulk update = %d, want 0; body %+v", len(newCategoryRecords.JSON200.Records), newCategoryRecords.JSON200)
	}
	originalCategoryRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{CategoryId: &refs.CategoryId})
	requireNoTransportError(t, "search records", err)
	if originalCategoryRecords.StatusCode() != http.StatusOK {
		t.Fatalf("original category search status = %d, want %d; body %s", originalCategoryRecords.StatusCode(), http.StatusOK, originalCategoryRecords.Body)
	}
	assertRecordIDs(t, originalCategoryRecords.JSON200.Records, []int64{created.JSON201.Records[0].RecordId, created.JSON201.Records[1].RecordId})
}

func TestRecordBulkOperationsRejectTombstonedTargetReferences(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs.transactionRefs))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	firstRecordID := created.JSON201.Records[0].RecordId
	secondRecordID := created.JSON201.Records[1].RecordId

	tombstonedCategory := client.Scenario().Category("Food:TombstonedBulkTarget")
	deleteCategory, err := client.REST().DeleteCategoryWithResponse(context.Background(), tombstonedCategory.CategoryId)
	requireNoTransportError(t, "delete category", err)
	if deleteCategory.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete category status = %d, want %d; body %s", deleteCategory.StatusCode(), http.StatusNoContent, deleteCategory.Body)
	}
	tombstonedAccount := client.Scenario().Account("merchant:TombstonedBulkTarget")
	deleteAccount, err := client.REST().DeleteAccountWithResponse(context.Background(), tombstonedAccount.AccountId)
	requireNoTransportError(t, "delete account", err)
	if deleteAccount.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete account status = %d, want %d; body %s", deleteAccount.StatusCode(), http.StatusNoContent, deleteAccount.Body)
	}
	tombstonedTag := client.Scenario().Tag("Bulk:TombstonedTagTarget")
	deleteTag(t, client, tombstonedTag.TagId)

	tombstonedBulkCategory, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID},
		CategoryId: tombstonedCategory.CategoryId,
	})
	requireNoTransportError(t, "bulk categorize tombstoned category", err)
	if tombstonedBulkCategory.StatusCode() != http.StatusBadRequest {
		t.Fatalf("tombstoned category status = %d, want %d; body %s", tombstonedBulkCategory.StatusCode(), http.StatusBadRequest, tombstonedBulkCategory.Body)
	}

	tombstonedBulkAccount, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{secondRecordID},
		AccountId: tombstonedAccount.AccountId,
	})
	requireNoTransportError(t, "bulk reassign tombstoned account", err)
	if tombstonedBulkAccount.StatusCode() != http.StatusBadRequest {
		t.Fatalf("tombstoned account status = %d, want %d; body %s", tombstonedBulkAccount.StatusCode(), http.StatusBadRequest, tombstonedBulkAccount.Body)
	}

	tombstonedBulkTag, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{
		RecordIds: []int64{firstRecordID},
		AddTagIds: apptest.Int64SlicePtr(tombstonedTag.TagId),
	})
	requireNoTransportError(t, "bulk update tombstoned tag", err)
	if tombstonedBulkTag.StatusCode() != http.StatusBadRequest {
		t.Fatalf("tombstoned tag status = %d, want %d; body %s", tombstonedBulkTag.StatusCode(), http.StatusBadRequest, tombstonedBulkTag.Body)
	}
}

func assertBulkResponse(t *testing.T, got *httpclient.BulkRecordOperationResponse, wantRecordIDs []int64) {
	t.Helper()

	if got == nil {
		t.Fatal("bulk response body is nil")
	}
	assertInt64s(t, got.RecordIds, wantRecordIDs)
	if got.UpdatedCount != len(wantRecordIDs) {
		t.Fatalf("updated_count = %d, want %d", got.UpdatedCount, len(wantRecordIDs))
	}
}
