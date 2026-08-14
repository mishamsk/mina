package runtime_test

import (
	"context"
	"net/http"
	"testing"
	"time"

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
		RecordIds:  []int64{secondRecordID},
		CategoryId: refs.SecondCategoryId,
	})
	requireNoTransportError(t, "bulk categorize records", err)
	if bulkCategory.StatusCode() != http.StatusOK {
		t.Fatalf("bulk category status = %d, want %d; body %s", bulkCategory.StatusCode(), http.StatusOK, bulkCategory.Body)
	}
	assertBulkResponse(t, bulkCategory.JSON200, []int64{secondRecordID})
	categorized, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{CategoryId: &refs.SecondCategoryId})
	requireNoTransportError(t, "search records", err)
	if categorized.StatusCode() != http.StatusOK {
		t.Fatalf("categorized search status = %d, want %d; body %s", categorized.StatusCode(), http.StatusOK, categorized.Body)
	}
	assertRecordIDs(t, categorized.JSON200.Records, []int64{secondRecordID})

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

	bulkMember, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
		RecordIds: []int64{secondRecordID},
		MemberId:  &refs.SecondMemberId,
	})
	requireNoTransportError(t, "bulk set record member", err)
	if bulkMember.StatusCode() != http.StatusOK {
		t.Fatalf("bulk member status = %d, want %d; body %s", bulkMember.StatusCode(), http.StatusOK, bulkMember.Body)
	}
	assertBulkResponse(t, bulkMember.JSON200, []int64{secondRecordID})
	memberRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{MemberId: &refs.SecondMemberId})
	requireNoTransportError(t, "search member records", err)
	if memberRecords.StatusCode() != http.StatusOK {
		t.Fatalf("member records status = %d, want %d; body %s", memberRecords.StatusCode(), http.StatusOK, memberRecords.Body)
	}
	assertRecordIDs(t, memberRecords.JSON200.Records, []int64{secondRecordID})
	memberSet := getTransaction(t, client, created.JSON201.TransactionId)
	assertRecordMembers(t, memberSet.JSON200.Records, map[int64]*int64{
		firstRecordID:  &refs.MemberId,
		secondRecordID: &refs.SecondMemberId,
	})

	clearedMember, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
		RecordIds: []int64{secondRecordID},
		MemberId:  nil,
	})
	requireNoTransportError(t, "bulk clear record member", err)
	if clearedMember.StatusCode() != http.StatusOK {
		t.Fatalf("bulk clear member status = %d, want %d; body %s", clearedMember.StatusCode(), http.StatusOK, clearedMember.Body)
	}
	assertBulkResponse(t, clearedMember.JSON200, []int64{secondRecordID})
	cleared := getTransaction(t, client, created.JSON201.TransactionId)
	assertRecordMembers(t, cleared.JSON200.Records, map[int64]*int64{
		firstRecordID:  &refs.MemberId,
		secondRecordID: nil,
	})

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

	reconciliationStatus := httpclient.Unreconciled
	bulkStatus, err := client.REST().BulkSetJournalRecordReconciliationWithResponse(context.Background(), httpclient.BulkSetRecordReconciliationRequest{
		RecordIds:            []int64{firstRecordID, secondRecordID},
		ReconciliationStatus: reconciliationStatus,
	})
	requireNoTransportError(t, "bulk update record statuses", err)
	if bulkStatus.StatusCode() != http.StatusOK {
		t.Fatalf("bulk status status = %d, want %d; body %s", bulkStatus.StatusCode(), http.StatusOK, bulkStatus.Body)
	}
	assertBulkResponse(t, bulkStatus.JSON200, []int64{firstRecordID, secondRecordID})
	statusRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		ReconciliationStatus: &reconciliationStatus,
	})
	requireNoTransportError(t, "search records", err)
	if statusRecords.StatusCode() != http.StatusOK {
		t.Fatalf("status search status = %d, want %d; body %s", statusRecords.StatusCode(), http.StatusOK, statusRecords.Body)
	}
	assertRecordIDs(t, statusRecords.JSON200.Records, []int64{firstRecordID, secondRecordID})
}

func TestRecordBulkTransactionETagMaterialAndNoOpBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	created := createTransaction(t, client, balancedTransactionRequest(refs.transactionRefs))
	transactionID := created.JSON201.TransactionId
	firstRecordID := created.JSON201.Records[0].RecordId
	secondRecordID := created.JSON201.Records[1].RecordId
	replacementMerchant := client.Scenario().Account("merchant:BulkTimestampReplacement")

	assertMaterialThenNoOpTransactionETag(t, client, transactionID, "category", []int64{secondRecordID}, func() (int, int, error) {
		response, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
			RecordIds: []int64{secondRecordID}, CategoryId: refs.SecondCategoryId,
		})
		if err != nil {
			return 0, 0, err
		}
		if response.JSON200 == nil {
			return response.StatusCode(), 0, nil
		}
		return response.StatusCode(), response.JSON200.UpdatedCount, nil
	})
	assertMaterialThenNoOpTransactionETag(t, client, transactionID, "tags", []int64{firstRecordID, secondRecordID}, func() (int, int, error) {
		response, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{
			RecordIds: []int64{firstRecordID, secondRecordID}, AddTagIds: apptest.Int64SlicePtr(refs.SecondTagId), RemoveTagIds: apptest.Int64SlicePtr(refs.TagId),
		})
		if err != nil {
			return 0, 0, err
		}
		if response.JSON200 == nil {
			return response.StatusCode(), 0, nil
		}
		return response.StatusCode(), response.JSON200.UpdatedCount, nil
	})
	assertMaterialThenNoOpTransactionETag(t, client, transactionID, "member", []int64{secondRecordID}, func() (int, int, error) {
		response, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
			RecordIds: []int64{secondRecordID}, MemberId: &refs.SecondMemberId,
		})
		if err != nil {
			return 0, 0, err
		}
		if response.JSON200 == nil {
			return response.StatusCode(), 0, nil
		}
		return response.StatusCode(), response.JSON200.UpdatedCount, nil
	})
	assertMaterialThenNoOpTransactionETag(t, client, transactionID, "account", []int64{secondRecordID}, func() (int, int, error) {
		response, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
			RecordIds: []int64{secondRecordID}, AccountId: replacementMerchant.AccountId,
		})
		if err != nil {
			return 0, 0, err
		}
		if response.JSON200 == nil {
			return response.StatusCode(), 0, nil
		}
		return response.StatusCode(), response.JSON200.UpdatedCount, nil
	})
	assertMaterialThenNoOpTransactionETag(t, client, transactionID, "settlement", []int64{firstRecordID}, func() (int, int, error) {
		response, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
			RecordIds: []int64{firstRecordID}, Settlement: httpclient.SettlementStatusPending,
		})
		if err != nil {
			return 0, 0, err
		}
		if response.JSON200 == nil {
			return response.StatusCode(), 0, nil
		}
		return response.StatusCode(), response.JSON200.UpdatedCount, nil
	})
	assertMaterialThenNoOpTransactionETag(t, client, transactionID, "reconciliation", []int64{firstRecordID, secondRecordID}, func() (int, int, error) {
		response, err := client.REST().BulkSetJournalRecordReconciliationWithResponse(context.Background(), httpclient.BulkSetRecordReconciliationRequest{
			RecordIds: []int64{firstRecordID, secondRecordID}, ReconciliationStatus: httpclient.Unreconciled,
		})
		if err != nil {
			return 0, 0, err
		}
		if response.JSON200 == nil {
			return response.StatusCode(), 0, nil
		}
		return response.StatusCode(), response.JSON200.UpdatedCount, nil
	})
}

func assertMaterialThenNoOpTransactionETag(t *testing.T, client *apptest.Client, transactionID int64, operation string, changedRecordIDs []int64, mutate func() (int, int, error)) {
	t.Helper()
	before := getTransaction(t, client, transactionID).JSON200
	beforeRecords := journalRecordsByID(before.Records)
	changedRecords := make(map[int64]struct{}, len(changedRecordIDs))
	for _, recordID := range changedRecordIDs {
		changedRecords[recordID] = struct{}{}
	}
	status, updatedCount, err := mutate()
	requireNoTransportError(t, operation+" material mutation", err)
	if status != http.StatusOK {
		t.Fatalf("%s material mutation status = %d, want %d", operation, status, http.StatusOK)
	}
	if updatedCount != len(changedRecordIDs) {
		t.Fatalf("%s material mutation updated_count = %d, want %d", operation, updatedCount, len(changedRecordIDs))
	}
	after := getTransaction(t, client, transactionID).JSON200
	if after.Etag == before.Etag || !before.UpdatedAt.Before(after.UpdatedAt) {
		t.Fatalf("%s material mutation etag/updated_at = %q/%s, want after %q/%s", operation, after.Etag, after.UpdatedAt, before.Etag, before.UpdatedAt)
	}
	for _, record := range after.Records {
		prior := beforeRecords[record.RecordId]
		if record.CreatedAt != prior.CreatedAt {
			t.Fatalf("%s material mutation record %d created_at = %s, want %s", operation, record.RecordId, record.CreatedAt, prior.CreatedAt)
		}
		if _, changed := changedRecords[record.RecordId]; changed {
			if !prior.UpdatedAt.Before(record.UpdatedAt) {
				t.Fatalf("%s material mutation record %d updated_at = %s, want after %s", operation, record.RecordId, record.UpdatedAt, prior.UpdatedAt)
			}
		} else if record.UpdatedAt != prior.UpdatedAt {
			t.Fatalf("%s material mutation untouched record %d updated_at = %s, want %s", operation, record.RecordId, record.UpdatedAt, prior.UpdatedAt)
		}
	}

	status, updatedCount, err = mutate()
	requireNoTransportError(t, operation+" exact no-op", err)
	if status != http.StatusOK {
		t.Fatalf("%s exact no-op status = %d, want %d", operation, status, http.StatusOK)
	}
	if updatedCount != 0 {
		t.Fatalf("%s exact no-op updated_count = %d, want 0", operation, updatedCount)
	}
	noOp := getTransaction(t, client, transactionID).JSON200
	if noOp.Etag != after.Etag || !noOp.UpdatedAt.Equal(after.UpdatedAt) {
		t.Fatalf("%s exact no-op etag/updated_at = %q/%s, want %q/%s", operation, noOp.Etag, noOp.UpdatedAt, after.Etag, after.UpdatedAt)
	}
	afterRecords := journalRecordsByID(after.Records)
	for _, record := range noOp.Records {
		material := afterRecords[record.RecordId]
		if record.CreatedAt != material.CreatedAt || record.UpdatedAt != material.UpdatedAt {
			t.Fatalf("%s exact no-op record %d timestamps = %s/%s, want %s/%s", operation, record.RecordId, record.CreatedAt, record.UpdatedAt, material.CreatedAt, material.UpdatedAt)
		}
	}
}

func journalRecordsByID(records []httpclient.JournalRecord) map[int64]httpclient.JournalRecord {
	byID := make(map[int64]httpclient.JournalRecord, len(records))
	for _, record := range records {
		byID[record.RecordId] = record
	}
	return byID
}

func TestRecordBulkMemberValidationAndAtomicityBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	created := createTransaction(t, client, balancedTransactionRequest(refs.transactionRefs))
	firstRecordID := created.JSON201.Records[0].RecordId
	secondRecordID := created.JSON201.Records[1].RecordId

	for name, recordIDs := range map[string][]int64{
		"empty":     {},
		"duplicate": {firstRecordID, firstRecordID},
		"missing":   {999999},
	} {
		t.Run(name+" record selection", func(t *testing.T) {
			response, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
				RecordIds: recordIDs,
				MemberId:  &refs.SecondMemberId,
			})
			requireNoTransportError(t, "bulk set record member", err)
			if response.StatusCode() != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body %s", response.StatusCode(), http.StatusBadRequest, response.Body)
			}
		})
	}

	missingMemberID := int64(999999)
	missingMember, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
		RecordIds: []int64{firstRecordID},
		MemberId:  &missingMemberID,
	})
	requireNoTransportError(t, "bulk set missing member", err)
	if missingMember.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing member status = %d, want %d; body %s", missingMember.StatusCode(), http.StatusBadRequest, missingMember.Body)
	}

	tombstonedMember := client.Scenario().Member("Tombstoned Bulk Member")
	deleteMember(t, client, tombstonedMember.MemberId)
	tombstonedResponse, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
		RecordIds: []int64{firstRecordID},
		MemberId:  &tombstonedMember.MemberId,
	})
	requireNoTransportError(t, "bulk set tombstoned member", err)
	if tombstonedResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("tombstoned member status = %d, want %d; body %s", tombstonedResponse.StatusCode(), http.StatusBadRequest, tombstonedResponse.Body)
	}

	tombstonedTransaction := createTransaction(t, client, balancedTransactionRequest(refs.transactionRefs))
	deleted, err := client.REST().DeleteTransactionWithResponse(context.Background(), tombstonedTransaction.JSON201.TransactionId)
	requireNoTransportError(t, "delete transaction", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete transaction status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	tombstonedRecord, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
		RecordIds: []int64{tombstonedTransaction.JSON201.Records[0].RecordId},
		MemberId:  &refs.SecondMemberId,
	})
	requireNoTransportError(t, "bulk set tombstoned record member", err)
	if tombstonedRecord.StatusCode() != http.StatusBadRequest {
		t.Fatalf("tombstoned record status = %d, want %d; body %s", tombstonedRecord.StatusCode(), http.StatusBadRequest, tombstonedRecord.Body)
	}

	before := getTransaction(t, client, created.JSON201.TransactionId)
	allOrNothing, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
		RecordIds: []int64{secondRecordID, 999999},
		MemberId:  &refs.SecondMemberId,
	})
	requireNoTransportError(t, "bulk set member atomically", err)
	if allOrNothing.StatusCode() != http.StatusBadRequest {
		t.Fatalf("all-or-nothing status = %d, want %d; body %s", allOrNothing.StatusCode(), http.StatusBadRequest, allOrNothing.Body)
	}
	after := getTransaction(t, client, created.JSON201.TransactionId)
	for index := range before.JSON200.Records {
		if got, want := after.JSON200.Records[index].MemberId, before.JSON200.Records[index].MemberId; (got == nil) != (want == nil) || (got != nil && *got != *want) {
			t.Fatalf("record %d member_id after rejected update = %v, want %v", after.JSON200.Records[index].RecordId, got, want)
		}
	}
}

func TestRecordBulkReassignToFixedSystemAccountBoundary(t *testing.T) {
	client := newSharedClient(t)
	owned := client.Scenario().AccountWithCurrency("accounts:BulkSystemReassign", "USD")
	systemAccounts := fixedSystemAccounts(t, client)
	created := createTransaction(t, client, classificationRequest(
		semanticRecord(owned.AccountId, "10.00", "USD", nil),
		semanticRecordWithoutSettlement(systemAccounts["system:correction"].AccountId, "-10.00", "USD", nil),
	))

	reassigned, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{created.JSON201.Records[0].RecordId},
		AccountId: systemAccounts["system:opening_balance"].AccountId,
	})
	requireNoTransportError(t, "bulk reassign to fixed system account", err)
	if reassigned.StatusCode() != http.StatusOK {
		t.Fatalf("bulk reassign status = %d, want %d; body %s", reassigned.StatusCode(), http.StatusOK, reassigned.Body)
	}
	selectedRecordID := created.JSON201.Records[0].RecordId
	assertBulkResponse(t, reassigned.JSON200, []int64{selectedRecordID})

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "read system-reassigned transaction", err)
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read reassigned transaction status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	selectedFound := false
	for _, record := range read.JSON200.Records {
		if record.RecordId == selectedRecordID {
			selectedFound = true
			if record.AccountId != systemAccounts["system:opening_balance"].AccountId {
				t.Fatalf("selected record account_id = %d, want %d", record.AccountId, systemAccounts["system:opening_balance"].AccountId)
			}
			if record.Settlement != nil || record.PendingDate != nil || record.PostedDate != nil {
				t.Fatalf("system-reassigned record settlement/dates = %v/%v/%v, want nil/nil/nil", record.Settlement, record.PendingDate, record.PostedDate)
			}
			continue
		}
		if record.AccountId != systemAccounts["system:correction"].AccountId {
			t.Fatalf("unselected record account_id = %d, want %d", record.AccountId, systemAccounts["system:correction"].AccountId)
		}
	}
	if !selectedFound {
		t.Fatalf("selected record %d not found after reassignment", selectedRecordID)
	}
	if read.JSON200.Settlement != httpclient.TransactionSettlementNotApplicable {
		t.Fatalf("system-reassigned transaction settlement = %q, want not_applicable", read.JSON200.Settlement)
	}
}

func TestRecordBulkReassignmentSettlementBoundary(t *testing.T) {
	now := apptest.Timestamp("2026-08-02T07:01:51Z")
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(now)))
	scenario := client.Scenario()
	firstOwned := scenario.AccountWithCurrency("accounts:BulkSettlement:First", "USD")
	secondOwned := scenario.AccountWithCurrency("accounts:BulkSettlement:Second", "USD")
	thirdOwned := scenario.AccountWithCurrency("accounts:BulkSettlement:Third", "USD")
	systemAccounts := fixedSystemAccounts(t, client)

	requiresSettlement := createTransaction(t, client, classificationRequest(
		semanticRecord(firstOwned.AccountId, "10.00", "USD", nil),
		semanticRecordWithoutSettlement(systemAccounts["system:correction"].AccountId, "-10.00", "USD", nil),
	))
	dateFreeRecordID := requiresSettlement.JSON201.Records[1].RecordId
	omitted, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{dateFreeRecordID},
		AccountId: secondOwned.AccountId,
	})
	requireNoTransportError(t, "reassign date-free record without settlement", err)
	if omitted.StatusCode() != http.StatusBadRequest {
		t.Fatalf("omitted settlement status = %d, want %d; body %s", omitted.StatusCode(), http.StatusBadRequest, omitted.Body)
	}

	pending, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds:  []int64{dateFreeRecordID},
		AccountId:  secondOwned.AccountId,
		Settlement: apptest.PendingSettlement(),
	})
	requireNoTransportError(t, "reassign date-free record pending", err)
	if pending.StatusCode() != http.StatusOK {
		t.Fatalf("pending reassignment status = %d, want %d; body %s", pending.StatusCode(), http.StatusOK, pending.Body)
	}
	pendingRead := getTransaction(t, client, requiresSettlement.JSON201.TransactionId)
	for _, record := range pendingRead.JSON200.Records {
		if record.RecordId == dateFreeRecordID {
			if record.Settlement == nil || *record.Settlement != httpclient.SettlementStatusPending || record.PendingDate == nil || !record.PendingDate.Equal(now) || record.PostedDate != nil {
				t.Fatalf("reassigned pending settlement/dates = %v/%v/%v, want pending/%v/nil", record.Settlement, record.PendingDate, record.PostedDate, now)
			}
		}
	}

	forbiddenSource := createTransaction(t, client, classificationRequest(
		semanticRecord(firstOwned.AccountId, "12.00", "USD", nil),
		semanticRecordWithoutSettlement(systemAccounts["system:correction"].AccountId, "-12.00", "USD", nil),
	))
	forbidden, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds:  []int64{forbiddenSource.JSON201.Records[0].RecordId},
		AccountId:  systemAccounts["system:opening_balance"].AccountId,
		Settlement: apptest.PendingSettlement(),
	})
	requireNoTransportError(t, "reassign to system with settlement", err)
	if forbidden.StatusCode() != http.StatusBadRequest {
		t.Fatalf("forbidden settlement status = %d, want %d; body %s", forbidden.StatusCode(), http.StatusBadRequest, forbidden.Body)
	}

	preservedSource := createTransaction(t, client, classificationRequest(
		semanticRecord(firstOwned.AccountId, "-5.00", "USD", nil),
		semanticRecord(secondOwned.AccountId, "5.00", "USD", nil),
	))
	preservedRecord := preservedSource.JSON201.Records[0]
	preserved, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{preservedRecord.RecordId},
		AccountId: thirdOwned.AccountId,
	})
	requireNoTransportError(t, "reassign balance record preserving settlement", err)
	if preserved.StatusCode() != http.StatusOK {
		t.Fatalf("preserving reassignment status = %d, want %d; body %s", preserved.StatusCode(), http.StatusOK, preserved.Body)
	}
	preservedRead := getTransaction(t, client, preservedSource.JSON201.TransactionId)
	for _, record := range preservedRead.JSON200.Records {
		if record.RecordId == preservedRecord.RecordId {
			if record.PendingDate != preservedRecord.PendingDate || record.PostedDate == nil || preservedRecord.PostedDate == nil || !record.PostedDate.Equal(*preservedRecord.PostedDate) {
				t.Fatalf("preserved reassignment dates = %v/%v, want %v/%v", record.PendingDate, record.PostedDate, preservedRecord.PendingDate, preservedRecord.PostedDate)
			}
		}
	}
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
	secondRecordID := created.JSON201.Records[1].RecordId

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

	ownedRecord, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{firstRecordID},
		CategoryId: refs.SecondCategoryId,
	})
	requireNoTransportError(t, "bulk categorize owned record", err)
	if ownedRecord.StatusCode() != http.StatusBadRequest {
		t.Fatalf("owned record category status = %d, want %d; body %s", ownedRecord.StatusCode(), http.StatusBadRequest, ownedRecord.Body)
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

	semanticReassignment, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{secondRecordID},
		AccountId: refs.SavingsAccountId,
	})
	requireNoTransportError(t, "bulk reassign categorized flow record to owned account", err)
	if semanticReassignment.StatusCode() != http.StatusBadRequest {
		t.Fatalf("semantic reassignment status = %d, want %d; body %s", semanticReassignment.StatusCode(), http.StatusBadRequest, semanticReassignment.Body)
	}
	originalAccountRecords, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.MerchantAccountId, nil)
	requireNoTransportError(t, "search original account after rejected reassignment", err)
	if originalAccountRecords.StatusCode() != http.StatusOK {
		t.Fatalf("original account records status = %d, want %d; body %s", originalAccountRecords.StatusCode(), http.StatusOK, originalAccountRecords.Body)
	}
	assertRecordIDs(t, originalAccountRecords.JSON200.Records, []int64{secondRecordID})

	invalidStatusResponse, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds:  []int64{firstRecordID},
		Settlement: httpclient.SettlementStatus("settled"),
	})
	requireNoTransportError(t, "bulk update record statuses", err)
	if invalidStatusResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid status status = %d, want %d; body %s", invalidStatusResponse.StatusCode(), http.StatusBadRequest, invalidStatusResponse.Body)
	}

	allOrNothing, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{secondRecordID, 999},
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
	assertRecordIDs(t, originalCategoryRecords.JSON200.Records, []int64{created.JSON201.Records[1].RecordId})
}

func TestRecordBulkSettlementAndTransactionLifecycleBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	transaction := createTransaction(t, client, balancedTransactionRequest(refs.transactionRefs))
	balanceRecordID := transaction.JSON201.Records[0].RecordId

	pending, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds: []int64{balanceRecordID}, Settlement: httpclient.SettlementStatusPending,
	})
	requireNoTransportError(t, "set balance record pending", err)
	if pending.StatusCode() != http.StatusOK {
		t.Fatalf("set pending status = %d, want %d; body %s", pending.StatusCode(), http.StatusOK, pending.Body)
	}
	read := getTransaction(t, client, transaction.JSON201.TransactionId)
	if got := read.JSON200.Records[0].Settlement; got == nil || *got != httpclient.SettlementStatusPending {
		t.Fatalf("balance record settlement = %v, want pending", got)
	}
	wantPendingDate := apptest.Timestamp("2024-03-10T00:00:00Z")
	if read.JSON200.Records[0].PendingDate == nil || !read.JSON200.Records[0].PendingDate.Equal(wantPendingDate) {
		t.Fatalf("pending_date = %v, want preserved %v", read.JSON200.Records[0].PendingDate, wantPendingDate)
	}
	if read.JSON200.Records[0].PostedDate != nil || read.JSON200.Settlement != httpclient.TransactionSettlementPending {
		t.Fatalf("pending transaction dates/settlement = %v/%q, want nil/pending", read.JSON200.Records[0].PostedDate, read.JSON200.Settlement)
	}

	posted, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds: []int64{balanceRecordID}, Settlement: httpclient.SettlementStatusPosted,
	})
	requireNoTransportError(t, "post balance record", err)
	if posted.StatusCode() != http.StatusOK {
		t.Fatalf("set posted status = %d, want %d; body %s", posted.StatusCode(), http.StatusOK, posted.Body)
	}
	read = getTransaction(t, client, transaction.JSON201.TransactionId)
	if postedAt := read.JSON200.Records[0].PostedDate; postedAt == nil || !postedAt.Equal(client.Now()) {
		t.Fatalf("posted_date = %v, want %s", postedAt, client.Now())
	}
	if read.JSON200.Settlement != httpclient.TransactionSettlementPosted {
		t.Fatalf("posted transaction settlement = %q, want posted", read.JSON200.Settlement)
	}

	_, err = client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds: []int64{balanceRecordID}, Settlement: httpclient.SettlementStatusPending,
	})
	requireNoTransportError(t, "return balance record to pending", err)
	cancelled, err := client.REST().CancelTransactionWithResponse(context.Background(), transaction.JSON201.TransactionId)
	requireNoTransportError(t, "cancel pending transaction", err)
	if cancelled.StatusCode() != http.StatusOK {
		t.Fatalf("cancel status = %d, want %d; body %s", cancelled.StatusCode(), http.StatusOK, cancelled.Body)
	}
	apptest.AssertTransactionLifecycle(t, cancelled.JSON200, httpclient.TransactionLifecycleStatusCancelled)
	if cancelled.JSON200.Settlement != httpclient.TransactionSettlementPending {
		t.Fatalf("cancelled transaction settlement = %q, want pending", cancelled.JSON200.Settlement)
	}

	categorized, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{transaction.JSON201.Records[1].RecordId},
		CategoryId: refs.SecondCategoryId,
	})
	requireNoTransportError(t, "categorize cancelled transaction record", err)
	if categorized.StatusCode() != http.StatusOK {
		t.Fatalf("categorize cancelled transaction record status = %d, want %d; body %s", categorized.StatusCode(), http.StatusOK, categorized.Body)
	}
	assertBulkResponse(t, categorized.JSON200, []int64{transaction.JSON201.Records[1].RecordId})

	tagged, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{
		RecordIds: []int64{transaction.JSON201.Records[1].RecordId},
		AddTagIds: apptest.Int64SlicePtr(refs.SecondTagId),
	})
	requireNoTransportError(t, "tag cancelled transaction record", err)
	if tagged.StatusCode() != http.StatusOK {
		t.Fatalf("tag cancelled transaction record status = %d, want %d; body %s", tagged.StatusCode(), http.StatusOK, tagged.Body)
	}
	assertBulkResponse(t, tagged.JSON200, []int64{transaction.JSON201.Records[1].RecordId})

	memberSet, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
		RecordIds: []int64{transaction.JSON201.Records[1].RecordId},
		MemberId:  &refs.SecondMemberId,
	})
	requireNoTransportError(t, "set member on cancelled transaction record", err)
	if memberSet.StatusCode() != http.StatusOK {
		t.Fatalf("set member on cancelled transaction record status = %d, want %d; body %s", memberSet.StatusCode(), http.StatusOK, memberSet.Body)
	}
	assertBulkResponse(t, memberSet.JSON200, []int64{transaction.JSON201.Records[1].RecordId})

	restored, err := client.REST().RestoreTransactionWithResponse(context.Background(), transaction.JSON201.TransactionId)
	requireNoTransportError(t, "restore transaction", err)
	if restored.StatusCode() != http.StatusOK {
		t.Fatalf("restore status = %d, want %d; body %s", restored.StatusCode(), http.StatusOK, restored.Body)
	}
	apptest.AssertTransactionLifecycle(t, restored.JSON200, httpclient.TransactionLifecycleStatusActive)
}

func TestRecordBulkSettlementAcceptsExplicitEventTimesBoundary(t *testing.T) {
	now := apptest.Timestamp("2026-08-04T15:30:00Z")
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(now)))
	refs := createSearchRefs(t, client)
	transaction := createTransaction(t, client, settlementTransactionRequest(refs.transactionRefs, "2024-03-10", httpclient.SettlementStatusPending))
	balanceRecordID := transaction.JSON201.Records[0].RecordId
	pendingDate := apptest.Timestamp("2024-03-11T09:00:00Z")
	postedDate := apptest.Timestamp("2024-03-12T14:45:00Z")

	posted, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds:   []int64{balanceRecordID},
		Settlement:  httpclient.SettlementStatusPosted,
		PendingDate: &pendingDate,
		PostedDate:  &postedDate,
	})
	requireNoTransportError(t, "set explicit settlement dates", err)
	if posted.StatusCode() != http.StatusOK {
		t.Fatalf("set explicit settlement dates status = %d, want %d; body %s", posted.StatusCode(), http.StatusOK, posted.Body)
	}

	read := getTransaction(t, client, transaction.JSON201.TransactionId)
	assertRecordLifecycleDates(t, "explicit bulk settlement dates", read.JSON200.Records, &pendingDate, &postedDate)
}

func TestRecordBulkSettlementPostsMultipleRecordsAtExplicitTimeBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)
	checkingPendingDate := apptest.Timestamp("2024-03-11T09:00:00Z")
	savingsPendingDate := apptest.Timestamp("2024-03-11T10:00:00Z")
	postedDate := apptest.Timestamp("2024-03-12T14:45:00Z")
	checking := semanticRecord(fixture.checking.AccountId, "-30.00", "USD", nil)
	checking.Settlement = &httpclient.SettlementIntent{
		Status:      httpclient.SettlementStatusPending,
		PendingDate: &checkingPendingDate,
	}
	savings := semanticRecord(fixture.savings.AccountId, "20.00", "USD", nil)
	savings.Settlement = &httpclient.SettlementIntent{
		Status:      httpclient.SettlementStatusPending,
		PendingDate: &savingsPendingDate,
	}
	transaction := createTransaction(t, client, classificationRequest(
		checking,
		savings,
		semanticRecord(fixture.merchantA.AccountId, "10.00", "USD", &fixture.expense.CategoryId),
	))
	balanceRecordIDs := []int64{
		transaction.JSON201.Records[0].RecordId,
		transaction.JSON201.Records[1].RecordId,
	}

	posted, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds:  balanceRecordIDs,
		Settlement: httpclient.SettlementStatusPosted,
		PostedDate: &postedDate,
	})
	requireNoTransportError(t, "post multiple pending balance records", err)
	if posted.StatusCode() != http.StatusOK {
		t.Fatalf("post multiple pending balance records status = %d, want %d; body %s", posted.StatusCode(), http.StatusOK, posted.Body)
	}
	assertBulkResponse(t, posted.JSON200, balanceRecordIDs)

	read := getTransaction(t, client, transaction.JSON201.TransactionId)
	for index, wantPendingDate := range []*time.Time{&checkingPendingDate, &savingsPendingDate} {
		record := read.JSON200.Records[index]
		if record.PendingDate == nil || !record.PendingDate.Equal(*wantPendingDate) {
			t.Fatalf("posted record %d pending_date = %v, want %v", record.RecordId, record.PendingDate, wantPendingDate)
		}
		if record.PostedDate == nil || !record.PostedDate.Equal(postedDate) {
			t.Fatalf("posted record %d posted_date = %v, want %v", record.RecordId, record.PostedDate, postedDate)
		}
	}
}

func TestRecordBulkSettlementReportsTopLevelDateFieldsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	transaction := createTransaction(t, client, settlementTransactionRequest(refs.transactionRefs, "2024-03-10", httpclient.SettlementStatusPending))
	balanceRecordID := transaction.JSON201.Records[0].RecordId
	pendingDate := apptest.Timestamp("2024-03-11T09:00:00Z")
	postedDate := apptest.Timestamp("2024-03-10T09:00:00Z")

	pendingWithPostedDate, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds:  []int64{balanceRecordID},
		Settlement: httpclient.SettlementStatusPending,
		PostedDate: &postedDate,
	})
	requireNoTransportError(t, "set pending with posted date", err)
	if pendingWithPostedDate.JSON400 == nil || pendingWithPostedDate.JSON400.Error.Message != "posted_date must be omitted for pending settlement" {
		t.Fatalf("pending posted_date error = %+v, want top-level field path", pendingWithPostedDate.JSON400)
	}

	postedBeforePending, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds:   []int64{balanceRecordID},
		Settlement:  httpclient.SettlementStatusPosted,
		PendingDate: &pendingDate,
		PostedDate:  &postedDate,
	})
	requireNoTransportError(t, "set posted before pending date", err)
	if postedBeforePending.JSON400 == nil || postedBeforePending.JSON400.Error.Message != "posted_date must not precede pending_date" {
		t.Fatalf("posted-before-pending error = %+v, want top-level field path", postedBeforePending.JSON400)
	}
}

func TestRecordBulkSettlementPostsBeforeDefaultPendingTimestampBoundary(t *testing.T) {
	now := apptest.Timestamp("2026-08-02T07:01:51Z")
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(now)))
	refs := createSearchRefs(t, client)
	request := settlementTransactionRequest(refs.transactionRefs, "2026-08-02", httpclient.SettlementStatusPending)
	transaction := createTransaction(t, client, request)
	balanceRecord := transaction.JSON201.Records[0]

	posted, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds:  []int64{balanceRecord.RecordId},
		Settlement: httpclient.SettlementStatusPosted,
	})
	requireNoTransportError(t, "post balance record before default pending timestamp", err)
	if posted.StatusCode() != http.StatusOK {
		t.Fatalf("set posted status = %d, want %d; body %s", posted.StatusCode(), http.StatusOK, posted.Body)
	}

	read := getTransaction(t, client, transaction.JSON201.TransactionId)
	record := read.JSON200.Records[0]
	if record.PendingDate == nil || record.PostedDate == nil || !record.PostedDate.Equal(*record.PendingDate) {
		t.Fatalf("pending_date/posted_date = %v/%v, want equal default timestamps", record.PendingDate, record.PostedDate)
	}
	if read.JSON200.Settlement != httpclient.TransactionSettlementPosted {
		t.Fatalf("transaction settlement = %q, want posted", read.JSON200.Settlement)
	}
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

func assertRecordMembers(t *testing.T, records []httpclient.JournalRecord, wantByRecordID map[int64]*int64) {
	t.Helper()

	if len(records) != len(wantByRecordID) {
		t.Fatalf("member assertion record count = %d, want %d", len(records), len(wantByRecordID))
	}
	for _, record := range records {
		want, ok := wantByRecordID[record.RecordId]
		if !ok {
			t.Fatalf("unexpected record %d in member assertion", record.RecordId)
		}
		if (record.MemberId == nil) != (want == nil) || (record.MemberId != nil && *record.MemberId != *want) {
			t.Fatalf("record %d member_id = %v, want %v", record.RecordId, record.MemberId, want)
		}
	}
}
