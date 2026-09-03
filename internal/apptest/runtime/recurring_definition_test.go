package runtime_test

import (
	"context"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
	"github.com/oapi-codegen/nullable"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

type recurringDefinitionRefs struct {
	CheckingAccountID int64
	MerchantAccountID int64
	CategoryID        int64
	CategoryFQN       string
	TagID             int64
	MemberID          int64
}

func TestRecurringDefinitionCreateReadListUpdateCancelBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-01-01T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "RecurringCRUD")
	created := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringCRUD:Subscriptions:Video", refs, "-10.00000000", "10.00000000", intervalRule(2, "WEEK"), "2024-01-15"))
	wantETag := strconv.Quote(created.JSON201.UpdatedAt.UTC().Format(time.RFC3339Nano))
	if created.JSON201.Etag != wantETag {
		t.Fatalf("recurring definition etag = %q, want quoted canonical updated_at %q", created.JSON201.Etag, wantETag)
	}
	assertRecurringDefinition(t, *created.JSON201, "RecurringCRUD:Subscriptions:Video", httpclient.Interval, "2024-01-15", 1, refs, "-10.00000000", "10.00000000")
	assertDatePtr(t, created.JSON201.NextDueDate, "2024-01-15")
	if created.JSON201.ParentFqn == nil || *created.JSON201.ParentFqn != "RecurringCRUD:Subscriptions" || created.JSON201.Name != "Video" || created.JSON201.Level != 2 {
		t.Fatalf("hierarchy = parent:%v name:%q level:%d", created.JSON201.ParentFqn, created.JSON201.Name, created.JSON201.Level)
	}
	read := getRecurringDefinition(t, client, created.JSON201.RecurringDefinitionId)
	assertRecurringDefinition(t, *read.JSON200, "RecurringCRUD:Subscriptions:Video", httpclient.Interval, "2024-01-15", 1, refs, "-10.00000000", "10.00000000")
	list, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "list recurring definitions", err)
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list recurring definitions status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	assertRecurringDefinitionIDs(t, list.JSON200.RecurringDefinitions, []int64{created.JSON201.RecurringDefinitionId})
	replacement := recurringDefinitionReplacementRequest("RecurringCRUD:Subscriptions:VideoRenamed", refs, "-12.00000000", "12.00000000", dayOfMonthRule(31), recurringStringPtr("2024-01-30"))
	params := &httpclient.ReplaceRecurringDefinitionParams{IfMatch: created.JSON201.Etag}
	missingPrecondition, err := client.REST().ReplaceRecurringDefinitionWithResponse(context.Background(), created.JSON201.RecurringDefinitionId, params, replacement, func(_ context.Context, request *http.Request) error {
		request.Header.Del("If-Match")
		return nil
	})
	requireNoTransportError(t, "replace recurring definition without precondition", err)
	if missingPrecondition.StatusCode() != http.StatusPreconditionRequired || missingPrecondition.JSON428 == nil || missingPrecondition.JSON428.Error.Code != httpclient.APIErrorCodePreconditionRequired {
		t.Fatalf("missing recurring precondition = %d/%+v, want 428/%q; body %s", missingPrecondition.StatusCode(), missingPrecondition.JSON428, httpclient.APIErrorCodePreconditionRequired, missingPrecondition.Body)
	}
	malformed, err := client.REST().ReplaceRecurringDefinitionWithResponse(context.Background(), created.JSON201.RecurringDefinitionId, &httpclient.ReplaceRecurringDefinitionParams{IfMatch: "opaque"}, replacement)
	requireNoTransportError(t, "replace recurring definition with malformed precondition", err)
	if malformed.StatusCode() != http.StatusBadRequest || malformed.JSON400 == nil || malformed.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("malformed recurring precondition = %d/%+v, want 400/%q; body %s", malformed.StatusCode(), malformed.JSON400, httpclient.APIErrorCodeInvalidRequest, malformed.Body)
	}
	replaced, err := client.REST().ReplaceRecurringDefinitionWithResponse(context.Background(), created.JSON201.RecurringDefinitionId, params, replacement)
	requireNoTransportError(t, "replace recurring definition", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace recurring definition status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	assertRecurringDefinition(t, *replaced.JSON200, "RecurringCRUD:Subscriptions:VideoRenamed", httpclient.DateRule, "2024-01-31", 2, refs, "-12.00000000", "12.00000000")
	if replaced.JSON200.Etag == created.JSON201.Etag {
		t.Fatalf("replacement etag = %q, want revision after %q", replaced.JSON200.Etag, created.JSON201.Etag)
	}
	assertDatePtr(t, replaced.JSON200.NextDueDate, "2024-01-31")
	deleted, err := client.REST().DeleteRecurringDefinitionWithResponse(context.Background(), created.JSON201.RecurringDefinitionId)
	requireNoTransportError(t, "delete recurring definition", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete recurring definition status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	missing, err := client.REST().GetRecurringDefinitionWithResponse(context.Background(), created.JSON201.RecurringDefinitionId)
	requireNoTransportError(t, "get cancelled recurring definition", err)
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get cancelled recurring definition status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}
}

func TestRecurringCatchUpAndExpectedReviewBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-03-12T12:00:00Z"))))
	assertIneligible := func(label string, status int, body []byte) {
		t.Helper()
		if status != http.StatusBadRequest {
			t.Fatalf("%s status = %d, want %d; body %s", label, status, http.StatusBadRequest, body)
		}
	}
	refs := createRecurringDefinitionRefs(t, client, "RecurringCatchUp")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringCatchUp:Daily", refs, "-10.00000000", "10.00000000", intervalRule(1, "DAY"), "2024-03-10"))
	if unread := listExpectedTransactions(t, client, nil); len(unread) != 0 {
		t.Fatalf("transaction read materialized due occurrences: %+v", unread)
	}
	assertDatePtr(t, getRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId).JSON200.NextDueDate, "2024-03-10")
	runRecurringCatchUp(t, client)
	first := listExpectedTransactions(t, client, nil)
	if len(first) != 3 {
		t.Fatalf("expected transaction count = %d, want 3; transactions = %+v", len(first), first)
	}
	assertTransactionDates(t, first, []string{"2024-03-12", "2024-03-11", "2024-03-10"})
	firstIDs := transactionIDs(first)
	for _, transaction := range first {
		assertRecurringTransactionProvenance(t, transaction, definition.JSON201.RecurringDefinitionId, definition.JSON201.Fqn, true)
		if transaction.LifecycleStatus != httpclient.Expected {
			t.Fatalf("transaction %d lifecycle = %q, want expected", transaction.TransactionId, transaction.LifecycleStatus)
		}
		assertRecurringRecords(t, transaction.Records)
	}
	assertDatePtr(t, getRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId).JSON200.NextDueDate, "2024-03-13")
	second := listExpectedTransactions(t, client, nil)
	assertInt64Slice(t, transactionIDs(second), firstIDs)
	futureActualDate := apptest.Date("2024-03-13")
	futureConfirmation, err := client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), first[0].TransactionId, expectedConfirmRequest(*apptest.PostedSettlement(), &futureActualDate))
	requireNoTransportError(t, "confirm expected transaction on future actual date", err)
	if futureConfirmation.StatusCode() != http.StatusBadRequest || futureConfirmation.JSON400 == nil || futureConfirmation.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("future actual-date confirmation = %d/%+v, want invalid-request response", futureConfirmation.StatusCode(), futureConfirmation.JSON400)
	}
	actualDate := apptest.Date("2024-03-09")
	confirmed, err := client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), first[2].TransactionId, expectedConfirmRequest(*apptest.PostedSettlement(), &actualDate))
	requireNoTransportError(t, "confirm expected transaction", err)
	if confirmed.StatusCode() != http.StatusOK {
		t.Fatalf("confirm expected transaction status = %d, want %d; body %s", confirmed.StatusCode(), http.StatusOK, confirmed.Body)
	}
	if confirmed.JSON200.TransactionId != first[2].TransactionId || confirmed.JSON200.LifecycleStatus != httpclient.Active || confirmed.JSON200.InitiatedDate.Format("2006-01-02") != "2024-03-09" {
		t.Fatalf("confirmed transaction = %+v, want same active identity on actual date", confirmed.JSON200)
	}
	assertRecurringRecords(t, confirmed.JSON200.Records)
	confirmedAgain, err := client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), first[2].TransactionId, expectedConfirmRequest(*apptest.PostedSettlement(), &actualDate))
	requireNoTransportError(t, "confirm already confirmed transaction", err)
	assertIneligible("confirm already confirmed transaction", confirmedAgain.StatusCode(), confirmedAgain.Body)
	dismissConfirmed, err := client.REST().DismissExpectedTransactionWithResponse(context.Background(), first[2].TransactionId)
	requireNoTransportError(t, "dismiss confirmed transaction", err)
	assertIneligible("dismiss confirmed transaction", dismissConfirmed.StatusCode(), dismissConfirmed.Body)
	dismissed, err := client.REST().DismissExpectedTransactionWithResponse(context.Background(), first[1].TransactionId)
	requireNoTransportError(t, "dismiss expected transaction", err)
	if dismissed.StatusCode() != http.StatusNoContent {
		t.Fatalf("dismiss expected transaction status = %d, want %d; body %s", dismissed.StatusCode(), http.StatusNoContent, dismissed.Body)
	}
	missing, err := client.REST().GetTransactionWithResponse(context.Background(), first[1].TransactionId, nil)
	requireNoTransportError(t, "get dismissed expected transaction", err)
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get dismissed expected transaction status = %d, want %d", missing.StatusCode(), http.StatusNotFound)
	}
	dismissedAgain, err := client.REST().DismissExpectedTransactionWithResponse(context.Background(), first[1].TransactionId)
	requireNoTransportError(t, "dismiss already dismissed transaction", err)
	assertIneligible("dismiss already dismissed transaction", dismissedAgain.StatusCode(), dismissedAgain.Body)
	confirmDismissed, err := client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), first[1].TransactionId, expectedConfirmRequest(*apptest.PostedSettlement(), nil))
	requireNoTransportError(t, "confirm dismissed transaction", err)
	assertIneligible("confirm dismissed transaction", confirmDismissed.StatusCode(), confirmDismissed.Body)
	ordinaryRefs := client.Scenario().TransactionRefs()
	ordinary := client.Scenario().BalancedTransaction(ordinaryRefs)
	confirmOrdinary, err := client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), ordinary.TransactionId, expectedConfirmRequest(*apptest.PostedSettlement(), nil))
	requireNoTransportError(t, "confirm ordinary active transaction", err)
	assertIneligible("confirm ordinary active transaction", confirmOrdinary.StatusCode(), confirmOrdinary.Body)
	dismissOrdinary, err := client.REST().DismissExpectedTransactionWithResponse(context.Background(), ordinary.TransactionId)
	requireNoTransportError(t, "dismiss ordinary active transaction", err)
	assertIneligible("dismiss ordinary active transaction", dismissOrdinary.StatusCode(), dismissOrdinary.Body)
	remaining, err := client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), first[0].TransactionId, expectedConfirmRequest(*apptest.PostedSettlement(), nil))
	requireNoTransportError(t, "confirm remaining expected transaction", err)
	if remaining.StatusCode() != http.StatusOK || remaining.JSON200.LifecycleStatus != httpclient.Active {
		t.Fatalf("confirm remaining expected transaction = status %d body %s", remaining.StatusCode(), remaining.Body)
	}
	assertDatePtr(t, getRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId).JSON200.NextDueDate, "2024-03-13")
}

func TestRecurringExpectedTransactionsRejectGenericMutationsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "RecurringGenericGuard")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringGenericGuard:Weekly", refs, "-10.00000000", "10.00000000", intervalRule(1, "WEEK"), formatDate(civilDateOnly(client.Now()))))
	runRecurringCatchUp(t, client)
	expected := listExpectedTransactions(t, client, nil)
	if len(expected) != 1 {
		t.Fatalf("generated expected transactions = %+v, want one", expected)
	}
	transaction := expected[0]
	transactionID := transaction.TransactionId
	selectedRecordIDs := recordIDs(transaction.Records)
	assertRejected := func(label string, status int, body []byte) {
		t.Helper()
		if status != http.StatusBadRequest {
			t.Fatalf("%s status = %d, want %d; body %s", label, status, http.StatusBadRequest, body)
		}
	}

	replaced, err := client.ReplaceTransactionRetainingRecords(context.Background(), &transaction, recurringExpectedReplacementRequest(refs, "Recurring guard replace"))
	requireNoTransportError(t, "replace generated expected transaction", err)
	assertRejected("replace generated expected transaction", replaced.StatusCode(), replaced.Body)

	cancelled, err := client.REST().CancelTransactionWithResponse(context.Background(), transactionID)
	requireNoTransportError(t, "cancel generated expected transaction", err)
	assertRejected("cancel generated expected transaction", cancelled.StatusCode(), cancelled.Body)

	deleted, err := client.REST().DeleteTransactionWithResponse(context.Background(), transactionID)
	requireNoTransportError(t, "delete generated expected transaction", err)
	assertRejected("delete generated expected transaction", deleted.StatusCode(), deleted.Body)

	settled, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{RecordIds: selectedRecordIDs, Settlement: httpclient.SettlementStatusPending})
	requireNoTransportError(t, "bulk settle generated expected transaction", err)
	assertRejected("bulk settle generated expected transaction", settled.StatusCode(), settled.Body)

	reconciled, err := client.REST().BulkSetJournalRecordReconciliationWithResponse(context.Background(), httpclient.BulkSetRecordReconciliationRequest{RecordIds: selectedRecordIDs, ReconciliationStatus: httpclient.Unreconciled})
	requireNoTransportError(t, "bulk reconcile generated expected transaction", err)
	assertRejected("bulk reconcile generated expected transaction", reconciled.StatusCode(), reconciled.Body)

	categorized, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{RecordIds: selectedRecordIDs, CategoryId: refs.CategoryID})
	requireNoTransportError(t, "bulk categorize generated expected transaction", err)
	assertRejected("bulk categorize generated expected transaction", categorized.StatusCode(), categorized.Body)

	extraTag := client.Scenario().Tag("RecurringGenericGuard:ExtraTag")
	tagged, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{RecordIds: selectedRecordIDs, AddTagIds: &[]int64{extraTag.TagId}})
	requireNoTransportError(t, "bulk tag generated expected transaction", err)
	assertRejected("bulk tag generated expected transaction", tagged.StatusCode(), tagged.Body)

	member := client.Scenario().Member("Recurring Generic Guard Member")
	memberSet, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{RecordIds: selectedRecordIDs, MemberId: &member.MemberId})
	requireNoTransportError(t, "bulk member generated expected transaction", err)
	assertRejected("bulk member generated expected transaction", memberSet.StatusCode(), memberSet.Body)

	reassigned, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{RecordIds: selectedRecordIDs, AccountId: refs.CheckingAccountID})
	requireNoTransportError(t, "bulk account generated expected transaction", err)
	assertRejected("bulk account generated expected transaction", reassigned.StatusCode(), reassigned.Body)

	replacement := client.Scenario().AccountWithType("people:RecurringGenericGuard:Replacement", httpclient.WritableAccountTypeParty)
	accountReplaced, err := client.REST().BulkReplaceTransactionAccountWithResponse(context.Background(), httpclient.BulkReplaceTransactionAccountRequest{TransactionIds: []int64{transactionID}, SourceAccountId: refs.CheckingAccountID, ReplacementAccountId: replacement.AccountId})
	requireNoTransportError(t, "replace account on generated expected transaction", err)
	assertRejected("replace account on generated expected transaction", accountReplaced.StatusCode(), accountReplaced.Body)

	after := getTransaction(t, client, transactionID).JSON200
	if after.LifecycleStatus != httpclient.Expected {
		t.Fatalf("transaction lifecycle after rejected mutations = %q, want expected", after.LifecycleStatus)
	}
	assertRecurringTransactionProvenance(t, *after, definition.JSON201.RecurringDefinitionId, definition.JSON201.Fqn, true)
	assertRecordIDs(t, after.Records, selectedRecordIDs)
}

func TestRecurringPendingConfirmationBoundary(t *testing.T) {
	now := apptest.Timestamp("2026-08-02T07:01:51Z")
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(now)))
	refs := createRecurringDefinitionRefs(t, client, "RecurringPending")
	today := formatDate(civilDateOnly(now))

	createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringPending:Due", refs, "-10.00000000", "10.00000000", intervalRule(1, "WEEK"), today))
	runRecurringCatchUp(t, client)
	expected := listExpectedTransactions(t, client, nil)
	if len(expected) != 1 {
		t.Fatalf("pending expected transactions = %+v, want one", expected)
	}
	confirmed, err := client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), expected[0].TransactionId, expectedConfirmRequest(*apptest.PendingSettlement(), nil))
	requireNoTransportError(t, "confirm expected transaction pending", err)
	if confirmed.StatusCode() != http.StatusOK {
		t.Fatalf("confirm expected pending status = %d, want %d; body %s", confirmed.StatusCode(), http.StatusOK, confirmed.Body)
	}
	assertPendingRecurringTransaction(t, *confirmed.JSON200, now)

	next := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringPending:Next", refs, "-8.00000000", "8.00000000", intervalRule(1, "WEEK"), formatDate(civilDateOnly(now).AddDate(0, 0, 7))))
	confirmedNext, err := client.REST().ConfirmNextRecurringDefinitionWithResponse(context.Background(), next.JSON201.RecurringDefinitionId, *apptest.PendingSettlement())
	requireNoTransportError(t, "confirm next recurring definition pending", err)
	if confirmedNext.StatusCode() != http.StatusOK {
		t.Fatalf("confirm next pending status = %d, want %d; body %s", confirmedNext.StatusCode(), http.StatusOK, confirmedNext.Body)
	}
	assertPendingRecurringTransaction(t, *confirmedNext.JSON200, now)
}

func TestRecurringClampedIntervalCatchUpCadenceIsReadIndependentBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2023-01-31T12:00:00Z"))))
	createDefinition := func(prefix string) int64 {
		refs := createRecurringDefinitionRefs(t, client, prefix)
		definition := createRecurringDefinition(t, client, recurringDefinitionRequest(prefix+":Monthly", refs, "-10.00000000", "10.00000000", intervalRule(1, "MONTH"), "2023-01-31"))
		return definition.JSON201.RecurringDefinitionId
	}
	forDefinition := func(transactions []httpclient.Transaction, definitionID int64) []httpclient.Transaction {
		matched := []httpclient.Transaction{}
		for _, transaction := range transactions {
			if transaction.RecurringDefinitionId != nil && *transaction.RecurringDefinitionId == definitionID {
				matched = append(matched, transaction)
			}
		}
		return matched
	}

	frequentID := createDefinition("RecurringFrequentCatchUp")
	runRecurringCatchUp(t, client)
	assertTransactionDates(t, listExpectedTransactions(t, client, nil), []string{"2023-01-31"})
	client.SetTime(apptest.Timestamp("2023-03-31T12:00:00Z"))
	singleID := createDefinition("RecurringSingleCatchUp")
	runRecurringCatchUp(t, client)
	all := listExpectedTransactions(t, client, nil)
	frequent := forDefinition(all, frequentID)
	single := forDefinition(all, singleID)

	assertTransactionDates(t, frequent, []string{"2023-03-28", "2023-02-28", "2023-01-31"})
	assertTransactionDates(t, single, []string{"2023-03-28", "2023-02-28", "2023-01-31"})
	assertDatePtr(t, getRecurringDefinition(t, client, frequentID).JSON200.NextDueDate, "2023-04-28")
	assertDatePtr(t, getRecurringDefinition(t, client, singleID).JSON200.NextDueDate, "2023-04-28")
}

func TestRecurringOccupiedAnchorRecoveryBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-04-01T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "RecurringOccupiedAnchor")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringOccupiedAnchor:Daily", refs, "-15.00000000", "15.00000000", intervalRule(1, "DAY"), "2024-04-02"))
	id := definition.JSON201.RecurringDefinitionId
	first := confirmNextRecurringDefinition(t, client, id)
	if first.JSON200.TransactionId <= 0 || first.JSON200.InitiatedDate.Format("2006-01-02") != "2024-04-01" {
		t.Fatalf("first early confirmation = %+v, want durable transaction dated today", first.JSON200)
	}
	assertRecurringTransactionProvenance(t, *first.JSON200, id, definition.JSON201.Fqn, true)
	assertDatePtr(t, getRecurringDefinition(t, client, id).JSON200.NextDueDate, "2024-04-03")
	preservedRequest := recurringDefinitionReplacementRequest(definition.JSON201.Fqn, refs, "-25.00000000", "25.00000000", intervalRule(1, "DAY"), nil)
	stale, err := client.REST().ReplaceRecurringDefinitionWithResponse(context.Background(), id, &httpclient.ReplaceRecurringDefinitionParams{IfMatch: definition.JSON201.Etag}, preservedRequest)
	requireNoTransportError(t, "replace recurring definition with stale anchor revision", err)
	if stale.StatusCode() != http.StatusPreconditionFailed || stale.JSON412 == nil || stale.JSON412.Error.Code != httpclient.APIErrorCodePreconditionFailed {
		t.Fatalf("stale recurring replacement = %d/%+v, want 412/%q; body %s", stale.StatusCode(), stale.JSON412, httpclient.APIErrorCodePreconditionFailed, stale.Body)
	}
	current := getRecurringDefinition(t, client, id).JSON200
	assertDatePtr(t, current.NextDueDate, "2024-04-03")
	unchanged, err := client.REST().ReplaceRecurringDefinitionWithResponse(context.Background(), id, &httpclient.ReplaceRecurringDefinitionParams{IfMatch: current.Etag}, preservedRequest)
	requireNoTransportError(t, "replace recurring definition without moving anchor", err)
	if unchanged.StatusCode() != http.StatusOK {
		t.Fatalf("unchanged anchor replacement status = %d; body %s", unchanged.StatusCode(), unchanged.Body)
	}
	assertDatePtr(t, unchanged.JSON200.NextDueDate, "2024-04-03")
	unchangedFirst := getTransaction(t, client, first.JSON200.TransactionId).JSON200
	if got := recurringCheckingAmount(*unchangedFirst, refs.CheckingAccountID); got != "-15.00000000" {
		t.Fatalf("earlier confirmation amount after definition replacement = %q, want -15.00000000", got)
	}
	reanchored, err := client.REST().ReplaceRecurringDefinitionWithResponse(context.Background(), id, &httpclient.ReplaceRecurringDefinitionParams{IfMatch: unchanged.JSON200.Etag}, recurringDefinitionReplacementRequest(definition.JSON201.Fqn, refs, "-25.00000000", "25.00000000", intervalRule(1, "DAY"), recurringStringPtr("2024-04-02")))
	requireNoTransportError(t, "move recurring anchor backward", err)
	if reanchored.StatusCode() != http.StatusOK {
		t.Fatalf("backward re-anchor status = %d; body %s", reanchored.StatusCode(), reanchored.Body)
	}
	assertDatePtr(t, reanchored.JSON200.NextDueDate, "2024-04-02")
	second := confirmNextRecurringDefinition(t, client, id)
	if second.JSON200.TransactionId == first.JSON200.TransactionId {
		t.Fatalf("re-anchored confirmation reused transaction %d", first.JSON200.TransactionId)
	}
	unchangedFirst = getTransaction(t, client, first.JSON200.TransactionId).JSON200
	if unchangedFirst.InitiatedDate.Format("2006-01-02") != "2024-04-01" || unchangedFirst.LifecycleStatus != httpclient.Active {
		t.Fatalf("earlier confirmation changed after re-anchor: %+v", unchangedFirst)
	}
	if got := recurringCheckingAmount(*unchangedFirst, refs.CheckingAccountID); got != "-15.00000000" {
		t.Fatalf("earlier confirmation amount after re-anchor = %q, want -15.00000000", got)
	}
	assertDatePtr(t, getRecurringDefinition(t, client, id).JSON200.NextDueDate, "2024-04-03")
}

func recurringCheckingAmount(transaction httpclient.Transaction, accountID int64) string {
	for _, record := range transaction.Records {
		if record.AccountId == accountID {
			return record.Amount
		}
	}
	return ""
}

func TestRecurringDeferPauseResumeAndCancelledProvenanceBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-05-01T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "RecurringLifecycle")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringLifecycle:Daily", refs, "-20.00000000", "20.00000000", intervalRule(1, "DAY"), "2024-05-02"))
	id := definition.JSON201.RecurringDefinitionId
	deferred := deferRecurringDefinition(t, client, id, httpclient.RecurringDefinitionDeferRequest{})
	assertDatePtr(t, deferred.JSON200.NextDueDate, "2024-05-03")
	pauseRecurringDefinition(t, client, id)
	deferPaused, err := client.REST().DeferRecurringDefinitionWithResponse(context.Background(), id, httpclient.RecurringDefinitionDeferRequest{})
	requireClientResponse(t, "defer paused recurring definition", err, deferPaused.StatusCode(), http.StatusBadRequest, deferPaused.Body)
	confirmPaused, err := client.REST().ConfirmNextRecurringDefinitionWithResponse(context.Background(), id, *apptest.PostedSettlement())
	requireClientResponse(t, "confirm next paused recurring definition", err, confirmPaused.StatusCode(), http.StatusBadRequest, confirmPaused.Body)
	if got := getRecurringDefinition(t, client, id).JSON200.AnchorDate.Format("2006-01-02"); got != "2024-05-03" {
		t.Fatalf("paused mutation anchor = %s, want 2024-05-03", got)
	}
	transactions, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	requireClientResponse(t, "list transactions after paused mutations", err, transactions.StatusCode(), http.StatusOK, transactions.Body)
	if len(transactions.JSON200.Transactions) != 0 {
		t.Fatalf("paused mutations created transactions: %+v", transactions.JSON200.Transactions)
	}
	client.SetTime(apptest.Timestamp("2024-05-05T12:00:00Z"))
	runRecurringCatchUp(t, client)
	if got := listExpectedTransactions(t, client, nil); len(got) != 0 {
		t.Fatalf("paused definition materialized transactions: %+v", got)
	}
	resumed := resumeRecurringDefinition(t, client, id)
	assertDatePtr(t, resumed.JSON200.NextDueDate, "2024-05-05")
	runRecurringCatchUp(t, client)
	materialized := listExpectedTransactions(t, client, nil)
	if len(materialized) != 1 || materialized[0].InitiatedDate.Format("2006-01-02") != "2024-05-05" {
		t.Fatalf("resumed catch-up = %+v, want one expected transaction for today", materialized)
	}
	deleted, err := client.REST().DeleteRecurringDefinitionWithResponse(context.Background(), id)
	requireNoTransportError(t, "cancel recurring definition", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("cancel recurring definition status = %d; body %s", deleted.StatusCode(), deleted.Body)
	}
	preserved := getTransaction(t, client, materialized[0].TransactionId).JSON200
	assertRecurringTransactionProvenance(t, *preserved, id, definition.JSON201.Fqn, false)
	confirmed, err := client.REST().ConfirmExpectedTransactionWithResponse(context.Background(), preserved.TransactionId, expectedConfirmRequest(*apptest.PostedSettlement(), nil))
	requireNoTransportError(t, "confirm cancelled-definition expected transaction", err)
	if confirmed.StatusCode() != http.StatusOK {
		t.Fatalf("confirm cancelled-definition expected transaction status = %d; body %s", confirmed.StatusCode(), confirmed.Body)
	}
	assertRecurringTransactionProvenance(t, *confirmed.JSON200, id, definition.JSON201.Fqn, false)
}

func TestRecurringCalendarRuleAnchorAdvancementBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-02-29T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "RecurringCalendarRules")
	forDefinition := func(transactions []httpclient.Transaction, definitionID int64, projected bool) []httpclient.Transaction {
		matched := []httpclient.Transaction{}
		for _, transaction := range transactions {
			if transaction.RecurringDefinitionId != nil && *transaction.RecurringDefinitionId == definitionID && (transaction.TransactionId < 0) == projected {
				matched = append(matched, transaction)
			}
		}
		return matched
	}
	projectionsThrough := func(definitionID int64, through string) []httpclient.Transaction {
		anchor := apptest.Date(through)
		return forDefinition(listExpectedTransactions(t, client, &anchor), definitionID, true)
	}

	dayOfMonth := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringCalendarRules:Day31", refs, "-11.00000000", "11.00000000", dayOfMonthRule(31), "2024-01-01"))
	dayID := dayOfMonth.JSON201.RecurringDefinitionId
	runRecurringCatchUp(t, client)
	dayCatchUp := forDefinition(listExpectedTransactions(t, client, nil), dayID, false)
	assertTransactionDates(t, dayCatchUp, []string{"2024-02-29", "2024-01-31"})
	assertDatePtr(t, getRecurringDefinition(t, client, dayID).JSON200.NextDueDate, "2024-03-31")
	confirmNextRecurringDefinition(t, client, dayID)
	assertDatePtr(t, getRecurringDefinition(t, client, dayID).JSON200.NextDueDate, "2024-04-30")
	deferRecurringDefinition(t, client, dayID, httpclient.RecurringDefinitionDeferRequest{})
	assertDatePtr(t, getRecurringDefinition(t, client, dayID).JSON200.NextDueDate, "2024-05-31")
	assertTransactionDates(t, projectionsThrough(dayID, "2024-06-30"), []string{"2024-06-30", "2024-05-31"})

	lastDay := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringCalendarRules:LastDay", refs, "-12.00000000", "12.00000000", lastDayOfMonthRule(), "2024-01-01"))
	lastDayID := lastDay.JSON201.RecurringDefinitionId
	runRecurringCatchUp(t, client)
	lastDayCatchUp := forDefinition(listExpectedTransactions(t, client, nil), lastDayID, false)
	assertTransactionDates(t, lastDayCatchUp, []string{"2024-02-29", "2024-01-31"})
	assertDatePtr(t, getRecurringDefinition(t, client, lastDayID).JSON200.NextDueDate, "2024-03-31")
	deferRecurringDefinition(t, client, lastDayID, httpclient.RecurringDefinitionDeferRequest{})
	assertDatePtr(t, getRecurringDefinition(t, client, lastDayID).JSON200.NextDueDate, "2024-04-30")
	confirmNextRecurringDefinition(t, client, lastDayID)
	assertDatePtr(t, getRecurringDefinition(t, client, lastDayID).JSON200.NextDueDate, "2024-05-31")
	assertTransactionDates(t, projectionsThrough(lastDayID, "2024-06-30"), []string{"2024-06-30", "2024-05-31"})
}

func TestRecurringScheduleAdvancementRejectsUnsupportedDatesBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2026-09-02T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "RecurringDateRange")

	confirmDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringDateRange:ConfirmNext", refs, "-10.00000000", "10.00000000", intervalRule(1, "DAY"), "9999-12-31"))
	confirmed, err := client.REST().ConfirmNextRecurringDefinitionWithResponse(context.Background(), confirmDefinition.JSON201.RecurringDefinitionId, *apptest.PostedSettlement())
	requireNoTransportError(t, "confirm next outside supported date range", err)
	if confirmed.StatusCode() != http.StatusBadRequest {
		t.Fatalf("confirm next outside supported date range status = %d, want %d; body %s", confirmed.StatusCode(), http.StatusBadRequest, confirmed.Body)
	}
	assertDatePtr(t, getRecurringDefinition(t, client, confirmDefinition.JSON201.RecurringDefinitionId).JSON200.NextDueDate, "9999-12-31")

	catchUpDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringDateRange:CatchUp", refs, "-10.00000000", "10.00000000", intervalRule(8000, "YEAR"), "2026-09-02"))
	filter := "lifecycle:expected"
	listed, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &filter})
	requireNoTransportError(t, "read transactions before invalid catch-up", err)
	if listed.StatusCode() != http.StatusOK || len(listed.JSON200.Transactions) != 0 {
		t.Fatalf("read transactions before invalid catch-up = %d/%+v, want empty read", listed.StatusCode(), listed.JSON200)
	}
	started, err := client.REST().StartRecurringCatchUpRunWithResponse(context.Background())
	requireNoTransportError(t, "start catch-up outside supported date range", err)
	if started.StatusCode() != http.StatusAccepted {
		t.Fatalf("start catch-up outside supported date range status = %d, want %d; body %s", started.StatusCode(), http.StatusAccepted, started.Body)
	}
	run := client.AwaitRecurringCatchUpRun(started.JSON202.OperationRunId)
	if run.Outcome != httpclient.BackgroundOperationRunOutcomeFailed || run.Error == nil {
		t.Fatalf("catch-up outside supported date range run = %+v, want failed run", run)
	}
	assertDatePtr(t, getRecurringDefinition(t, client, catchUpDefinition.JSON201.RecurringDefinitionId).JSON200.NextDueDate, "2026-09-02")
}

func TestRecurringFutureProjectionIsReadOnlyBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-06-01T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "RecurringProjection")
	otherRefs := createRecurringDefinitionRefs(t, client, "RecurringProjectionOther")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringProjection:Weekly", refs, "-25.00000000", "25.00000000", intervalRule(1, "WEEK"), "2024-06-03"))
	through := apptest.Date("2024-06-17")
	filter := "lifecycle:expected"
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{AnchorDate: &through, Filter: &filter})
	requireNoTransportError(t, "list future recurring projections", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list future recurring projections status = %d; body %s", response.StatusCode(), response.Body)
	}
	projected := response.JSON200.Transactions
	if len(projected) != 3 {
		t.Fatalf("future projections = %+v, want three weekly rows", projected)
	}
	assertTransactionDates(t, projected, []string{"2024-06-17", "2024-06-10", "2024-06-03"})
	nextCount := 0
	for _, transaction := range projected {
		if transaction.TransactionId >= 0 || transaction.LifecycleStatus != httpclient.Expected {
			t.Fatalf("projected transaction = %+v, want negative expected identity", transaction)
		}
		assertRecurringTransactionProvenance(t, transaction, definition.JSON201.RecurringDefinitionId, definition.JSON201.Fqn, true)
		assertRecurringRecords(t, transaction.Records)
		if transaction.RecurringProjectionIsNext != nil && *transaction.RecurringProjectionIsNext {
			nextCount++
			if transaction.InitiatedDate.Format("2006-01-02") != "2024-06-03" {
				t.Fatalf("actionable projection date = %s, want anchor 2024-06-03", transaction.InitiatedDate.Format("2006-01-02"))
			}
		}
	}
	if nextCount != 1 {
		t.Fatalf("actionable projection count = %d, want 1", nextCount)
	}
	for _, tc := range []struct {
		name      string
		filter    string
		search    string
		class     httpclient.TransactionClass
		wantCount int
	}{
		{name: "matching category", filter: `category:"RecurringProjection:Category"`, wantCount: 3},
		{name: "other category", filter: `category:"` + otherRefs.CategoryFQN + `"`},
		{name: "matching tag", filter: `tag:"RecurringProjection:Tag"`, wantCount: 3},
		{name: "other tag", filter: `tag:"RecurringProjectionOther:Tag"`},
		{name: "matching account", filter: `account:"checking:RecurringProjection:Primary"`, wantCount: 3},
		{name: "other account", filter: `account:"checking:RecurringProjectionOther:Primary"`},
		{name: "matching amount", filter: "amount < -24", wantCount: 3},
		{name: "other amount", filter: "amount < -30"},
		{name: "matching class", filter: "lifecycle:expected", class: httpclient.TransactionClassSpend, wantCount: 3},
		{name: "other class", filter: "lifecycle:expected", class: httpclient.TransactionClassIncome},
		{name: "matching search", filter: "lifecycle:expected", search: "debit", wantCount: 3},
		{name: "other search", filter: "lifecycle:expected", search: "not present"},
	} {
		t.Run("projection filter "+tc.name, func(t *testing.T) {
			params := &httpclient.ListTransactionsParams{AnchorDate: &through}
			if tc.filter != "" {
				params.Filter = &tc.filter
			}
			if tc.search != "" {
				params.Search = &tc.search
			}
			if tc.class != "" {
				params.TransactionClass = &[]httpclient.TransactionClass{tc.class}
			}
			filtered, err := client.REST().ListTransactionsWithResponse(context.Background(), params)
			requireNoTransportError(t, "filter future recurring projections", err)
			if filtered.StatusCode() != http.StatusOK || len(filtered.JSON200.Transactions) != tc.wantCount || filtered.JSON200.TotalCount != int64(tc.wantCount) {
				t.Fatalf("filtered projections = status:%d response:%+v, want %d rows", filtered.StatusCode(), filtered.JSON200, tc.wantCount)
			}
		})
	}
	ordinary := createTransactionForDate(t, client, createTransactionRefs(t, client), "2024-06-17", "Future persisted transaction")
	allLifecycles := "(lifecycle:active or lifecycle:expected)"
	limit := 10
	merged, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{AnchorDate: &through, Filter: &allLifecycles, Limit: &limit})
	requireNoTransportError(t, "list merged persisted and projected transactions", err)
	if merged.StatusCode() != http.StatusOK || merged.JSON200.TotalCount != 4 || len(merged.JSON200.Transactions) != 4 {
		t.Fatalf("merged future transactions = status:%d response:%+v, want four rows", merged.StatusCode(), merged.JSON200)
	}
	if merged.JSON200.Transactions[0].TransactionId != ordinary.JSON201.TransactionId || merged.JSON200.Transactions[1].TransactionId >= 0 || merged.JSON200.Transactions[1].RecurringDefinitionId == nil {
		t.Fatalf("merged future transaction order = %+v, want persisted row before same-date projection", merged.JSON200.Transactions)
	}
	pageLimit := 1
	projectionOffset := 1
	page, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{AnchorDate: &through, Filter: &allLifecycles, Limit: &pageLimit, Offset: &projectionOffset})
	requireNoTransportError(t, "list merged projection page", err)
	if page.StatusCode() != http.StatusOK || page.JSON200.Offset != projectionOffset || page.JSON200.TotalCount != 4 || len(page.JSON200.Transactions) != 1 || page.JSON200.Transactions[0].RecurringDefinitionId == nil {
		t.Fatalf("merged projection page = status:%d response:%+v, want offset 1 projection of four rows", page.StatusCode(), page.JSON200)
	}
	if persisted := listExpectedTransactions(t, client, nil); len(persisted) != 0 {
		t.Fatalf("future projection read created persisted transactions: %+v", persisted)
	}
	assertDatePtr(t, getRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId).JSON200.NextDueDate, "2024-06-03")
}

func TestRecurringFutureProjectionDoesNotReassignStaleAnchorAction(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-06-01T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "RecurringStaleProjection")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringStaleProjection:Weekly", refs, "-25.00000000", "25.00000000", intervalRule(1, "WEEK"), "2024-05-27"))
	through := apptest.Date("2024-06-17")
	filter := "lifecycle:expected"
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{AnchorDate: &through, Filter: &filter})
	requireClientResponse(t, "list projections from stale anchor", err, response.StatusCode(), http.StatusOK, response.Body)

	if len(response.JSON200.Transactions) != 3 {
		t.Fatalf("future projections from stale anchor = %+v, want three rows", response.JSON200.Transactions)
	}
	for _, transaction := range response.JSON200.Transactions {
		assertRecurringTransactionProvenance(t, transaction, definition.JSON201.RecurringDefinitionId, definition.JSON201.Fqn, true)
		if transaction.RecurringProjectionIsNext != nil && *transaction.RecurringProjectionIsNext {
			t.Fatalf("future projection %s marked actionable despite hidden stale anchor", transaction.InitiatedDate.Format("2006-01-02"))
		}
	}
}

func TestRecurringFutureProjectionRejectsMoreThanTenThousandBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "RecurringProjectionLimit")
	createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringProjectionLimit:Daily",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "DAY"),
		formatDate(civilDateOnly(client.Now())),
	))
	farFuture := apptest.Date("9999-12-31")
	active := "lifecycle:active"
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &farFuture,
		Filter:     &active,
	})
	requireNoTransportError(t, "future recurring projection over request limit", err)
	if response.StatusCode() != http.StatusBadRequest || response.JSON400 == nil || response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("future recurring projection over request limit = %d/%+v, want invalid-request response", response.StatusCode(), response.JSON400)
	}
}

func createRecurringDefinitionRefs(t *testing.T, client *apptest.Client, prefix string) recurringDefinitionRefs {
	t.Helper()
	checking := client.Scenario().AccountWithCurrency("checking:"+prefix+":Primary", "USD")
	merchant := client.Scenario().Account("expense:" + prefix + ":Merchant")
	category := client.Scenario().Category(prefix + ":Category")
	tag := client.Scenario().Tag(prefix + ":Tag")
	member := client.Scenario().Member(prefix + " Member")
	return recurringDefinitionRefs{CheckingAccountID: checking.AccountId, MerchantAccountID: merchant.AccountId, CategoryID: category.CategoryId, CategoryFQN: category.Fqn, TagID: tag.TagId, MemberID: member.MemberId}
}

func recurringDefinitionRequest(fqn string, refs recurringDefinitionRefs, debit string, credit string, rule httpclient.RecurringScheduleRule, anchor string) httpclient.RecurringDefinitionWriteRequest {
	return httpclient.RecurringDefinitionWriteRequest{Fqn: fqn, ScheduleRule: rule, AnchorDate: apptest.Date(anchor), Records: &[]httpclient.RecurringDefinitionRecordRequest{
		{AccountId: &refs.CheckingAccountID, MemberId: nullable.NewNullableWithValue(refs.MemberID), Currency: recurringStringPtr("USD"), Amount: recurringStringPtr(debit), TagIds: &[]int64{refs.TagID}, Memo: nullable.NewNullableWithValue("debit")},
		{AccountId: &refs.MerchantAccountID, MemberId: nullable.NewNullableWithValue(refs.MemberID), Currency: recurringStringPtr("USD"), Amount: recurringStringPtr(credit), CategoryId: nullable.NewNullableWithValue(refs.CategoryID), TagIds: &[]int64{refs.TagID}, Memo: nullable.NewNullableWithValue("credit")},
	}}
}

func recurringDefinitionReplacementRequest(fqn string, refs recurringDefinitionRefs, debit string, credit string, rule httpclient.RecurringScheduleRule, anchor *string) httpclient.RecurringDefinitionReplaceRequest {
	create := recurringDefinitionRequest(fqn, refs, debit, credit, rule, "2024-01-01")
	request := httpclient.RecurringDefinitionReplaceRequest{Fqn: create.Fqn, ScheduleRule: create.ScheduleRule, Records: create.Records}
	if anchor != nil {
		date := apptest.Date(*anchor)
		request.AnchorDate = &date
	}
	return request
}

func recurringExpectedReplacementRequest(refs recurringDefinitionRefs, memo string) httpclient.CreateTransactionRequest {
	return httpclient.CreateTransactionRequest{InitiatedDate: apptest.Date("2024-03-12"), Records: []httpclient.CreateJournalRecordRequest{
		{AccountId: refs.CheckingAccountID, MemberId: &refs.MemberID, Currency: "USD", Amount: "-20.00", TagIds: apptest.Int64SlicePtr(refs.TagID), Memo: &memo, ReconciliationStatus: httpclient.Reconciled, Source: httpclient.WritableSourceManual},
		{AccountId: refs.MerchantAccountID, Currency: "USD", Amount: "20.00", CategoryId: &refs.CategoryID, ReconciliationStatus: httpclient.Reconciled, Source: httpclient.WritableSourceManual},
	}}
}

func createRecurringDefinition(t *testing.T, client *apptest.Client, request httpclient.RecurringDefinitionWriteRequest) *httpclient.CreateRecurringDefinitionResponse {
	t.Helper()
	response, err := client.REST().CreateRecurringDefinitionWithResponse(context.Background(), request)
	requireNoTransportError(t, "create recurring definition", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create recurring definition status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}
	return response
}

func getRecurringDefinition(t *testing.T, client *apptest.Client, id int64) *httpclient.GetRecurringDefinitionResponse {
	t.Helper()
	response, err := client.REST().GetRecurringDefinitionWithResponse(context.Background(), id)
	requireNoTransportError(t, "get recurring definition", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get recurring definition status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return response
}

func getTransaction(t *testing.T, client *apptest.Client, id int64) *httpclient.GetTransactionResponse {
	t.Helper()
	response, err := client.REST().GetTransactionWithResponse(context.Background(), id, nil)
	requireNoTransportError(t, "get transaction", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return response
}

func confirmNextRecurringDefinition(t *testing.T, client *apptest.Client, id int64) *httpclient.ConfirmNextRecurringDefinitionResponse {
	t.Helper()
	response, err := client.REST().ConfirmNextRecurringDefinitionWithResponse(context.Background(), id, *apptest.PostedSettlement())
	requireNoTransportError(t, "confirm next recurring definition", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("confirm next recurring definition status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return response
}

func deferRecurringDefinition(t *testing.T, client *apptest.Client, id int64, request httpclient.RecurringDefinitionDeferRequest) *httpclient.DeferRecurringDefinitionResponse {
	t.Helper()
	response, err := client.REST().DeferRecurringDefinitionWithResponse(context.Background(), id, request)
	requireNoTransportError(t, "defer recurring definition", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("defer recurring definition status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return response
}

func pauseRecurringDefinition(t *testing.T, client *apptest.Client, id int64) *httpclient.PauseRecurringDefinitionResponse {
	t.Helper()
	response, err := client.REST().PauseRecurringDefinitionWithResponse(context.Background(), id)
	requireNoTransportError(t, "pause recurring definition", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("pause recurring definition status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return response
}

func resumeRecurringDefinition(t *testing.T, client *apptest.Client, id int64) *httpclient.ResumeRecurringDefinitionResponse {
	t.Helper()
	response, err := client.REST().ResumeRecurringDefinitionWithResponse(context.Background(), id)
	requireNoTransportError(t, "resume recurring definition", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("resume recurring definition status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return response
}

func listExpectedTransactions(t *testing.T, client *apptest.Client, anchor *openapi_types.Date) []httpclient.Transaction {
	t.Helper()
	filter := "lifecycle:expected"
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &filter, AnchorDate: anchor})
	requireNoTransportError(t, "list expected transactions", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list expected transactions status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return response.JSON200.Transactions
}

func runRecurringCatchUp(t *testing.T, client *apptest.Client) *httpclient.RecurringCatchUpRun {
	t.Helper()
	started, err := client.REST().StartRecurringCatchUpRunWithResponse(context.Background())
	requireNoTransportError(t, "start recurring catch-up", err)
	if started.StatusCode() != http.StatusAccepted {
		t.Fatalf("start recurring catch-up status = %d, want %d; body %s", started.StatusCode(), http.StatusAccepted, started.Body)
	}
	run := client.AwaitRecurringCatchUpRun(started.JSON202.OperationRunId)
	if run.Outcome != httpclient.BackgroundOperationRunOutcomeSucceeded {
		t.Fatalf("recurring catch-up run = %+v, want succeeded", run)
	}
	return run
}

func expectedConfirmRequest(settlement httpclient.SettlementIntent, actualDate *openapi_types.Date) httpclient.ExpectedTransactionConfirmRequest {
	return httpclient.ExpectedTransactionConfirmRequest{ActualDate: actualDate, Status: settlement.Status, PendingDate: settlement.PendingDate, PostedDate: settlement.PostedDate}
}

func assertRecurringTransactionProvenance(t *testing.T, transaction httpclient.Transaction, definitionID int64, definitionFQN string, active bool) {
	t.Helper()
	if transaction.RecurringDefinitionId == nil || *transaction.RecurringDefinitionId != definitionID || transaction.RecurringDefinitionFqn == nil || *transaction.RecurringDefinitionFqn != definitionFQN || transaction.RecurringDefinitionActive == nil || *transaction.RecurringDefinitionActive != active {
		t.Fatalf("transaction %d recurring provenance = id:%v fqn:%v active:%v, want %d %q %t", transaction.TransactionId, transaction.RecurringDefinitionId, transaction.RecurringDefinitionFqn, transaction.RecurringDefinitionActive, definitionID, definitionFQN, active)
	}
}

func assertRecurringRecords(t *testing.T, records []httpclient.JournalRecord) {
	t.Helper()
	if len(records) != 2 {
		t.Fatalf("generated record count = %d, want 2", len(records))
	}
	for _, record := range records {
		if record.Source != httpclient.RecurringTemplate || record.ReconciliationStatus != httpclient.Reconciled {
			t.Fatalf("generated record = %+v, want reconciled recurring-template provenance", record)
		}
	}
}

func assertPendingRecurringTransaction(t *testing.T, transaction httpclient.Transaction, pendingAt time.Time) {
	t.Helper()
	if transaction.LifecycleStatus != httpclient.Active {
		t.Fatalf("pending recurring transaction lifecycle = %q, want active", transaction.LifecycleStatus)
	}
	assertRecordLifecycleDates(t, "pending recurring transaction", transaction.Records, &pendingAt, nil)
	pendingRecords := 0
	for _, record := range transaction.Records {
		if record.Settlement == nil {
			continue
		}
		pendingRecords++
		if *record.Settlement != httpclient.SettlementStatusPending {
			t.Fatalf("pending recurring record %d settlement = %v, want pending", record.RecordId, record.Settlement)
		}
	}
	if pendingRecords != 1 {
		t.Fatalf("pending recurring settled records = %d, want 1", pendingRecords)
	}
}

func assertTransactionDates(t *testing.T, transactions []httpclient.Transaction, want []string) {
	t.Helper()
	if len(transactions) != len(want) {
		t.Fatalf("transaction count = %d, want %d", len(transactions), len(want))
	}
	for index := range transactions {
		if got := transactions[index].InitiatedDate.Format("2006-01-02"); got != want[index] {
			t.Fatalf("transaction dates at %d = %s, want %s", index, got, want[index])
		}
	}
}

func assertRecurringDefinition(t *testing.T, definition httpclient.RecurringDefinition, fqn string, class httpclient.RecurringScheduleClass, anchor string, version int64, refs recurringDefinitionRefs, debit string, credit string) {
	t.Helper()
	if definition.Fqn != fqn || definition.ScheduleClass != class || definition.AnchorDate.Format("2006-01-02") != anchor || definition.DefinitionVersion != version {
		t.Fatalf("definition = fqn:%q class:%q anchor:%s version:%d", definition.Fqn, definition.ScheduleClass, definition.AnchorDate.Format("2006-01-02"), definition.DefinitionVersion)
	}
	if len(definition.Records) != 2 {
		t.Fatalf("record count = %d, want 2", len(definition.Records))
	}
	assertRecurringRecord(t, definition.Records[0], refs.CheckingAccountID, nil, refs.TagID, refs.MemberID, debit)
	assertRecurringRecord(t, definition.Records[1], refs.MerchantAccountID, &refs.CategoryID, refs.TagID, refs.MemberID, credit)
}

func assertRecurringRecord(t *testing.T, record httpclient.RecurringDefinitionRecord, accountID int64, categoryID *int64, tagID int64, memberID int64, amount string) {
	t.Helper()
	if record.AccountId != accountID || !optionalInt64Equal(record.CategoryId, categoryID) || record.Currency != "USD" || record.Amount != amount {
		t.Fatalf("record = account:%d category:%v currency:%q amount:%q", record.AccountId, record.CategoryId, record.Currency, record.Amount)
	}
	if record.MemberId == nil || *record.MemberId != memberID || len(record.TagIds) != 1 || record.TagIds[0] != tagID {
		t.Fatalf("record references = member:%v tags:%v, want member %d tag %d", record.MemberId, record.TagIds, memberID, tagID)
	}
}

func optionalInt64Equal(left, right *int64) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func assertRecurringDefinitionIDs(t *testing.T, definitions []httpclient.RecurringDefinition, want []int64) {
	t.Helper()
	got := make([]int64, 0, len(definitions))
	for _, definition := range definitions {
		got = append(got, definition.RecurringDefinitionId)
	}
	assertInt64Slice(t, got, want)
}

func transactionIDs(transactions []httpclient.Transaction) []int64 {
	ids := make([]int64, 0, len(transactions))
	for _, transaction := range transactions {
		ids = append(ids, transaction.TransactionId)
	}
	return ids
}

func assertSameInt64Set(t *testing.T, got []int64, want []int64) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("ids = %v, want set %v", got, want)
	}
	seen := map[int64]int{}
	for _, id := range got {
		seen[id]++
	}
	for _, id := range want {
		seen[id]--
	}
	for id, count := range seen {
		if count != 0 {
			t.Fatalf("ids = %v, want set %v; id %d count delta %d", got, want, id, count)
		}
	}
}

func civilDateOnly(value time.Time) time.Time {
	year, month, day := value.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, value.Location())
}

func formatDate(value time.Time) string { return value.Format("2006-01-02") }

func assertDatePtr(t *testing.T, got *openapi_types.Date, want string) {
	t.Helper()
	if got == nil || got.Format("2006-01-02") != want {
		t.Fatalf("date = %v, want %s", got, want)
	}
}

func assertInt64Slice(t *testing.T, got []int64, want []int64) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
	for index := range got {
		if got[index] != want[index] {
			t.Fatalf("ids = %v, want %v", got, want)
		}
	}
}

func intervalRule(every int, unit string) httpclient.RecurringScheduleRule {
	return httpclient.RecurringScheduleRule{"version": 1, "kind": "interval", "every": every, "unit": unit}
}

func dayOfMonthRule(day int) httpclient.RecurringScheduleRule {
	return httpclient.RecurringScheduleRule{"version": 1, "kind": "day_of_month", "day": day}
}

func lastDayOfMonthRule() httpclient.RecurringScheduleRule {
	return httpclient.RecurringScheduleRule{"version": 1, "kind": "last_day_of_month"}
}

func recurringStringPtr(value string) *string { return &value }
