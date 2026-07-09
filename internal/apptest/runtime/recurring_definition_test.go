package runtime_test

import (
	"context"
	"net/http"
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
	TagID             int64
	MemberID          int64
}

func TestRecurringDefinitionCreateReadListUpdateCancelBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "RecurringCRUD")

	created := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringCRUD:Subscriptions:Video", refs, "-10.00000000", "10.00000000", intervalRule(2, "WEEK"), "2024-01-15"))
	assertRecurringDefinition(t, *created.JSON201, "RecurringCRUD:Subscriptions:Video", httpclient.Interval, "2024-01-15", 1, refs, "-10.00000000", "10.00000000")
	assertDatePtr(t, created.JSON201.NextDueDate, "2024-01-15")
	if created.JSON201.ParentFqn == nil || *created.JSON201.ParentFqn != "RecurringCRUD:Subscriptions" || created.JSON201.Name != "Video" || created.JSON201.Level != 2 {
		t.Fatalf("hierarchy = parent:%v name:%q level:%d", created.JSON201.ParentFqn, created.JSON201.Name, created.JSON201.Level)
	}

	read := getRecurringDefinition(t, client, created.JSON201.RecurringDefinitionId)
	assertRecurringDefinition(t, *read.JSON200, "RecurringCRUD:Subscriptions:Video", httpclient.Interval, "2024-01-15", 1, refs, "-10.00000000", "10.00000000")

	list, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list recurring definitions request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list recurring definitions status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	assertRecurringDefinitionIDs(t, list.JSON200.RecurringDefinitions, []int64{created.JSON201.RecurringDefinitionId})

	replaced, err := client.REST().ReplaceRecurringDefinitionWithResponse(
		context.Background(),
		created.JSON201.RecurringDefinitionId,
		recurringDefinitionRequest("RecurringCRUD:Subscriptions:VideoRenamed", refs, "-12.00000000", "12.00000000", dayOfMonthRule(31), "2024-01-30"),
	)
	if err != nil {
		t.Fatalf("replace recurring definition request: %v", err)
	}
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace recurring definition status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	assertRecurringDefinition(t, *replaced.JSON200, "RecurringCRUD:Subscriptions:VideoRenamed", httpclient.DateRule, "2024-01-30", 2, refs, "-12.00000000", "12.00000000")
	assertDatePtr(t, replaced.JSON200.NextDueDate, "2024-01-31")

	deleted, err := client.REST().DeleteRecurringDefinitionWithResponse(context.Background(), created.JSON201.RecurringDefinitionId)
	if err != nil {
		t.Fatalf("delete recurring definition request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete recurring definition status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	missing, err := client.REST().GetRecurringDefinitionWithResponse(context.Background(), created.JSON201.RecurringDefinitionId)
	if err != nil {
		t.Fatalf("get cancelled recurring definition request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get cancelled recurring definition status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}
}

func TestRecurringDefinitionAndOccurrenceListQueryBoundary(t *testing.T) {
	base := time.Date(2024, 4, 15, 12, 0, 0, 0, time.Local)
	clock := apptest.NewFakeClock(base)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringListQuery")

	alpha := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringListQuery:Alpha", refs, "-10.00000000", "10.00000000", intervalRule(1, "WEEK"), "2024-04-01"))
	beta := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringListQuery:Beta", refs, "-11.00000000", "11.00000000", intervalRule(1, "WEEK"), "2024-04-01"))
	createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringListQuery:Gamma", refs, "-12.00000000", "12.00000000", intervalRule(1, "WEEK"), "2024-04-01"))

	definitionSort := httpclient.ListRecurringDefinitionsParamsSortFqn
	definitionSortDir := httpclient.ListRecurringDefinitionsParamsSortDirDesc
	limit := 1
	offset := 1
	definitions, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), &httpclient.ListRecurringDefinitionsParams{
		Sort:    &definitionSort,
		SortDir: &definitionSortDir,
		Limit:   &limit,
		Offset:  &offset,
	})
	requireNoTransportError(t, "list recurring definitions with pagination", err)
	if definitions.StatusCode() != http.StatusOK {
		t.Fatalf("paginated definitions status = %d, want %d; body %s", definitions.StatusCode(), http.StatusOK, definitions.Body)
	}
	assertRecurringDefinitionIDs(t, definitions.JSON200.RecurringDefinitions, []int64{beta.JSON201.RecurringDefinitionId})
	if definitions.JSON200.TotalCount != 3 {
		t.Fatalf("definition total_count = %d, want 3", definitions.JSON200.TotalCount)
	}

	occurrenceSort := httpclient.ListRecurringOccurrencesParamsSortScheduledDate
	occurrenceSortDir := httpclient.ListRecurringOccurrencesParamsSortDirDesc
	occurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &alpha.JSON201.RecurringDefinitionId,
		Sort:                  &occurrenceSort,
		SortDir:               &occurrenceSortDir,
		Limit:                 &limit,
		Offset:                &offset,
	})
	if occurrences.JSON200.TotalCount != 3 {
		t.Fatalf("occurrence total_count = %d, want 3", occurrences.JSON200.TotalCount)
	}
	assertRecurringOccurrences(t, occurrences.JSON200.RecurringOccurrences, alpha.JSON201.RecurringDefinitionId, []string{"2024-04-08"})
}

func TestRecurringDefinitionValidationAndConflicts(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "RecurringValidation")
	base := recurringDefinitionRequest("RecurringValidation:Base", refs, "-10.00000000", "10.00000000", intervalRule(1, "MONTH"), "2024-01-31")

	created := createRecurringDefinition(t, client, base)

	assertRecurringDefinitionCreateStatus(t, client, "duplicate active fqn", base, http.StatusConflict, httpclient.APIErrorCodeConflict)
	prefix := recurringDefinitionRequest("RecurringValidation", refs, "-10.00000000", "10.00000000", intervalRule(1, "MONTH"), "2024-01-31")
	assertRecurringDefinitionCreateStatus(t, client, "prefix fqn conflict", prefix, http.StatusConflict, httpclient.APIErrorCodeConflict)

	unbalanced := recurringDefinitionRequest("RecurringValidation:Unbalanced", refs, "-10.00000000", "9.00000000", intervalRule(1, "MONTH"), "2024-01-31")
	assertRecurringDefinitionCreateStatus(t, client, "unbalanced records", unbalanced, http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	unbalancedReplace := recurringDefinitionRequest("RecurringValidation:Replaced", refs, "-10.00000000", "9.00000000", intervalRule(1, "WEEK"), "2024-02-01")
	rejectedReplace, err := client.REST().ReplaceRecurringDefinitionWithResponse(context.Background(), created.JSON201.RecurringDefinitionId, unbalancedReplace)
	requireNoTransportError(t, "replace recurring definition with unbalanced records", err)
	if rejectedReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unbalanced replace status = %d, want %d; body %s", rejectedReplace.StatusCode(), http.StatusBadRequest, rejectedReplace.Body)
	}
	if rejectedReplace.JSON400 == nil || rejectedReplace.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("unbalanced replace error = %+v, want %q; body %s", rejectedReplace.JSON400, httpclient.APIErrorCodeInvalidRequest, rejectedReplace.Body)
	}
	readAfterRejectedReplace := getRecurringDefinition(t, client, created.JSON201.RecurringDefinitionId)
	assertRecurringDefinition(t, *readAfterRejectedReplace.JSON200, "RecurringValidation:Base", httpclient.Interval, "2024-01-31", 1, refs, "-10.00000000", "10.00000000")
	assertRecurringDefinitionRecordIDs(t, readAfterRejectedReplace.JSON200.Records, recurringDefinitionRecordIDs(created.JSON201.Records))

	createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringValidation:Occupied", refs, "-11.00000000", "11.00000000", intervalRule(1, "MONTH"), "2024-01-31"))
	conflictingReplace, err := client.REST().ReplaceRecurringDefinitionWithResponse(
		context.Background(),
		created.JSON201.RecurringDefinitionId,
		recurringDefinitionRequest("RecurringValidation:Occupied", refs, "-12.00000000", "12.00000000", intervalRule(1, "WEEK"), "2024-02-01"),
	)
	requireNoTransportError(t, "replace recurring definition onto active fqn", err)
	if conflictingReplace.StatusCode() != http.StatusConflict {
		t.Fatalf("conflicting fqn replace status = %d, want %d; body %s", conflictingReplace.StatusCode(), http.StatusConflict, conflictingReplace.Body)
	}
	if conflictingReplace.JSON409 == nil || conflictingReplace.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("conflicting fqn replace error = %+v, want conflict; body %s", conflictingReplace.JSON409, conflictingReplace.Body)
	}

	createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringValidation:Tree:Child", refs, "-11.00000000", "11.00000000", intervalRule(1, "MONTH"), "2024-01-31"))
	prefixReplace, err := client.REST().ReplaceRecurringDefinitionWithResponse(
		context.Background(),
		created.JSON201.RecurringDefinitionId,
		recurringDefinitionRequest("RecurringValidation:Tree", refs, "-12.00000000", "12.00000000", intervalRule(1, "WEEK"), "2024-02-01"),
	)
	requireNoTransportError(t, "replace recurring definition onto hierarchy prefix", err)
	if prefixReplace.StatusCode() != http.StatusConflict {
		t.Fatalf("prefix fqn replace status = %d, want %d; body %s", prefixReplace.StatusCode(), http.StatusConflict, prefixReplace.Body)
	}
	if prefixReplace.JSON409 == nil || prefixReplace.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("prefix fqn replace error = %+v, want conflict; body %s", prefixReplace.JSON409, prefixReplace.Body)
	}
	readAfterConflictReplaces := getRecurringDefinition(t, client, created.JSON201.RecurringDefinitionId)
	assertRecurringDefinition(t, *readAfterConflictReplaces.JSON200, "RecurringValidation:Base", httpclient.Interval, "2024-01-31", 1, refs, "-10.00000000", "10.00000000")
	assertRecurringDefinitionRecordIDs(t, readAfterConflictReplaces.JSON200.Records, recurringDefinitionRecordIDs(created.JSON201.Records))

	assertRecurringDefinitionCreateStatus(t, client, "bad version", withRule(base, httpclient.RecurringScheduleRule{"version": 2, "kind": "interval", "every": 1, "unit": "MONTH"}), http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRecurringDefinitionCreateStatus(t, client, "bad kind", withRule(base, httpclient.RecurringScheduleRule{"version": 1, "kind": "weekday"}), http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRecurringDefinitionCreateStatus(t, client, "bad every", withRule(base, httpclient.RecurringScheduleRule{"version": 1, "kind": "interval", "every": 0, "unit": "MONTH"}), http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRecurringDefinitionCreateStatus(t, client, "bad unit", withRule(base, httpclient.RecurringScheduleRule{"version": 1, "kind": "interval", "every": 1, "unit": "HOUR"}), http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRecurringDefinitionCreateStatus(t, client, "bad day", withRule(base, httpclient.RecurringScheduleRule{"version": 1, "kind": "day_of_month", "day": 32}), http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
}

func TestRecurringDefinitionTemplateSeedAndDeleteGuards(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "RecurringSeed")
	template := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "RecurringSeed:Template",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				AccountId:  &refs.CheckingAccountID,
				MemberId:   &refs.MemberID,
				Currency:   recurringStringPtr("USD"),
				Amount:     recurringStringPtr("-20.00000000"),
				CategoryId: refs.CategoryID,
				TagIds:     &[]int64{refs.TagID},
				Memo:       recurringStringPtr("seed debit"),
			},
			{
				AccountId:  &refs.MerchantAccountID,
				MemberId:   &refs.MemberID,
				Currency:   recurringStringPtr("USD"),
				Amount:     recurringStringPtr("20.00000000"),
				CategoryId: refs.CategoryID,
				TagIds:     &[]int64{refs.TagID},
				Memo:       recurringStringPtr("seed credit"),
			},
		},
	})

	request := httpclient.RecurringDefinitionWriteRequest{
		Fqn:          "RecurringSeed:FromTemplate",
		ScheduleRule: lastDayOfMonthRule(),
		AnchorDate:   apptest.Date("2024-02-15"),
		TemplateId:   &template.JSON201.TransactionTemplateId,
	}
	created := createRecurringDefinition(t, client, request)
	assertRecurringDefinition(t, *created.JSON201, "RecurringSeed:FromTemplate", httpclient.DateRule, "2024-02-15", 1, refs, "-20.00000000", "20.00000000")
	assertDatePtr(t, created.JSON201.NextDueDate, "2024-02-29")

	clearRequest := httpclient.RecurringDefinitionWriteRequest{
		Fqn:          "RecurringSeed:ClearedNullableDefaults",
		ScheduleRule: intervalRule(1, "MONTH"),
		AnchorDate:   apptest.Date("2024-02-15"),
		TemplateId:   &template.JSON201.TransactionTemplateId,
		Records: &[]httpclient.RecurringDefinitionRecordRequest{
			{MemberId: nullable.NewNullNullable[int64](), Memo: nullable.NewNullNullable[string]()},
			{MemberId: nullable.NewNullNullable[int64](), Memo: nullable.NewNullNullable[string]()},
		},
	}
	cleared := createRecurringDefinition(t, client, clearRequest)
	for _, record := range cleared.JSON201.Records {
		if record.MemberId != nil || record.Memo != nil {
			t.Fatalf("template nullable override record = %+v, want cleared member_id and memo", record)
		}
	}

	assertDeleteAccountStatus(t, client, refs.CheckingAccountID, http.StatusConflict)
	assertDeleteCategoryStatus(t, client, refs.CategoryID, http.StatusConflict)
	assertDeleteTagStatus(t, client, refs.TagID, http.StatusConflict)
	assertDeleteMemberStatus(t, client, refs.MemberID, http.StatusConflict)

	releaseRefs := createRecurringDefinitionRefs(t, client, "RecurringSeedRelease")
	release := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringSeedRelease:Definition",
		releaseRefs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "MONTH"),
		"2024-01-31",
	))
	assertDeleteAccountStatus(t, client, releaseRefs.CheckingAccountID, http.StatusConflict)
	deleted, err := client.REST().DeleteRecurringDefinitionWithResponse(context.Background(), release.JSON201.RecurringDefinitionId)
	requireNoTransportError(t, "delete recurring definition before dictionary cleanup", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete recurring definition status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	assertDeleteAccountStatus(t, client, releaseRefs.CheckingAccountID, http.StatusNoContent)
	assertDeleteCategoryStatus(t, client, releaseRefs.CategoryID, http.StatusNoContent)
	assertDeleteTagStatus(t, client, releaseRefs.TagID, http.StatusNoContent)
	assertDeleteMemberStatus(t, client, releaseRefs.MemberID, http.StatusNoContent)
}

func TestRecurringOccurrenceMaterializationReviewQueueBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringMaterialize")
	today := civilDateOnly(now)
	anchor := today.AddDate(0, 0, -21)

	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringMaterialize:Weekly",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "WEEK"),
		formatDate(anchor),
	))

	first := listRecurringOccurrences(t, client, nil)
	expectedDates := []string{
		formatDate(anchor),
		formatDate(anchor.AddDate(0, 0, 7)),
		formatDate(anchor.AddDate(0, 0, 14)),
		formatDate(today),
	}
	assertRecurringOccurrences(t, first.JSON200.RecurringOccurrences, definition.JSON201.RecurringDefinitionId, expectedDates)
	generatedIDs := generatedTransactionIDs(t, first.JSON200.RecurringOccurrences)

	readDefinition := getRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId)
	assertDatePtr(t, readDefinition.JSON200.NextDueDate, formatDate(today.AddDate(0, 0, 7)))

	second := listRecurringOccurrences(t, client, nil)
	assertRecurringOccurrenceIDs(t, second.JSON200.RecurringOccurrences, recurringOccurrenceIDs(first.JSON200.RecurringOccurrences))

	defaultTransactions, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "default transaction list", err)
	assertTransactionListResponse(t, "default recurring generated transaction list", defaultTransactions, nil, 0)

	expectedStatuses := []httpclient.PostingStatus{httpclient.PostingStatusExpected}
	expectedTransactions, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{PostingStatus: &expectedStatuses})
	requireNoTransportError(t, "expected transaction list", err)
	if expectedTransactions.StatusCode() != http.StatusOK {
		t.Fatalf("expected transaction list status = %d, want %d; body %s", expectedTransactions.StatusCode(), http.StatusOK, expectedTransactions.Body)
	}
	assertSameInt64Set(t, transactionIDs(expectedTransactions.JSON200.Transactions), generatedIDs)
	for _, transaction := range expectedTransactions.JSON200.Transactions {
		if transaction.RecurringOccurrenceId == nil {
			t.Fatalf("transaction %d recurring_occurrence_id = nil", transaction.TransactionId)
		}
		for _, record := range transaction.Records {
			if record.PostingStatus != httpclient.PostingStatusExpected || record.Source != httpclient.RecurringTemplate {
				t.Fatalf("generated record status/source = %q/%q, want expected/recurring_template", record.PostingStatus, record.Source)
			}
		}
	}

	accountIDs := []int64{refs.CheckingAccountID}
	balances, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &accountIDs})
	requireNoTransportError(t, "account balances", err)
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("account balances status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}
	assertAccountBalances(t, balances.JSON200.Balances, []wantAccountBalance{
		{accountID: refs.CheckingAccountID, currency: "USD", current: "0.00000000", currentUSD: "0.00000000", posted: "0.00000000", unconvertedCount: 0},
	})

	totals, err := client.REST().GetTransactionMonthTotalsWithResponse(context.Background(), &httpclient.GetTransactionMonthTotalsParams{Month: today.Format("2006-01")})
	requireNoTransportError(t, "month totals", err)
	if totals.StatusCode() != http.StatusOK {
		t.Fatalf("month totals status = %d, want %d; body %s", totals.StatusCode(), http.StatusOK, totals.Body)
	}
	assertMonthTotal(t, "expected recurring spend excluded", totals.JSON200.Spend, "0.00000000", 0)
	assertMonthTotal(t, "expected recurring income excluded", totals.JSON200.Income, "0.00000000", 0)
}

func TestRecurringExpectedTransactionsRejectGenericMutationsBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringGenericGuard")
	today := civilDateOnly(now)

	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringGenericGuard:Weekly",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	occurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId})
	if len(occurrences.JSON200.RecurringOccurrences) != 1 || occurrences.JSON200.RecurringOccurrences[0].GeneratedTransactionId == nil {
		t.Fatalf("generated occurrences = %+v, want one expected occurrence with generated transaction", occurrences.JSON200.RecurringOccurrences)
	}
	occurrence := occurrences.JSON200.RecurringOccurrences[0]
	transactionID := *occurrence.GeneratedTransactionId
	transaction := getTransaction(t, client, transactionID)
	selectedRecordIDs := recordIDs(transaction.JSON200.Records)

	replaced, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		transactionID,
		recurringExpectedReplacementRequest(refs, "Recurring guard replace"),
	)
	requireNoTransportError(t, "replace generated expected transaction", err)
	assertInvalidRequestStatus(t, "replace generated expected transaction", replaced.StatusCode(), replaced.JSON400, replaced.Body)

	cancelled, err := client.REST().CancelTransactionWithResponse(context.Background(), transactionID)
	requireNoTransportError(t, "cancel generated expected transaction", err)
	assertInvalidRequestStatus(t, "cancel generated expected transaction", cancelled.StatusCode(), cancelled.JSON400, cancelled.Body)

	deleted, err := client.REST().DeleteTransactionWithResponse(context.Background(), transactionID)
	requireNoTransportError(t, "delete generated expected transaction", err)
	assertInvalidRequestStatus(t, "delete generated expected transaction", deleted.StatusCode(), deleted.JSON400, deleted.Body)

	pending := httpclient.NonExpectedPostingStatusPending
	statused, err := client.REST().BulkUpdateJournalRecordStatusesWithResponse(context.Background(), httpclient.BulkUpdateRecordStatusRequest{
		RecordIds:     selectedRecordIDs,
		PostingStatus: &pending,
	})
	requireNoTransportError(t, "bulk posting status generated expected transaction", err)
	assertInvalidRequestStatus(t, "bulk posting status generated expected transaction", statused.StatusCode(), statused.JSON400, statused.Body)

	unreconciled := httpclient.Unreconciled
	reconciled, err := client.REST().BulkUpdateJournalRecordStatusesWithResponse(context.Background(), httpclient.BulkUpdateRecordStatusRequest{
		RecordIds:            selectedRecordIDs,
		ReconciliationStatus: &unreconciled,
	})
	requireNoTransportError(t, "bulk reconciliation generated expected transaction", err)
	assertInvalidRequestStatus(t, "bulk reconciliation generated expected transaction", reconciled.StatusCode(), reconciled.JSON400, reconciled.Body)

	categorized, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  selectedRecordIDs,
		CategoryId: refs.CategoryID,
	})
	requireNoTransportError(t, "bulk categorize generated expected transaction", err)
	assertInvalidRequestStatus(t, "bulk categorize generated expected transaction", categorized.StatusCode(), categorized.JSON400, categorized.Body)

	extraTag := client.Scenario().Tag("RecurringGenericGuard:ExtraTag")
	tagged, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{
		RecordIds: selectedRecordIDs,
		AddTagIds: &[]int64{extraTag.TagId},
	})
	requireNoTransportError(t, "bulk tag generated expected transaction", err)
	assertInvalidRequestStatus(t, "bulk tag generated expected transaction", tagged.StatusCode(), tagged.JSON400, tagged.Body)

	reassigned, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: selectedRecordIDs,
		AccountId: refs.CheckingAccountID,
	})
	requireNoTransportError(t, "bulk account generated expected transaction", err)
	assertInvalidRequestStatus(t, "bulk account generated expected transaction", reassigned.StatusCode(), reassigned.JSON400, reassigned.Body)

	afterOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId})
	assertRecurringOccurrenceIDs(t, afterOccurrences.JSON200.RecurringOccurrences, []int64{occurrence.RecurringOccurrenceId})
	afterOccurrence := afterOccurrences.JSON200.RecurringOccurrences[0]
	if afterOccurrence.Status != httpclient.Expected ||
		afterOccurrence.GeneratedTransactionId == nil ||
		*afterOccurrence.GeneratedTransactionId != transactionID ||
		afterOccurrence.ReviewedAt != nil {
		t.Fatalf("occurrence after rejected generic mutations = %+v, want expected with same generated transaction", afterOccurrence)
	}
	afterTransaction := getTransaction(t, client, transactionID)
	assertTransactionRecordPostingStatuses(t, afterTransaction.JSON200.Records, httpclient.PostingStatusExpected)
	assertRecordIDs(t, afterTransaction.JSON200.Records, selectedRecordIDs)
}

func TestRecurringOccurrenceDateRuleMaterializationBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringDateRules")
	today := civilDateOnly(now)
	anchor := firstDayOfMonth(today.AddDate(0, -2, 0))

	dayOfMonth := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDateRules:DayOfMonth",
		refs,
		"-11.00000000",
		"11.00000000",
		dayOfMonthRule(31),
		formatDate(anchor),
	))
	lastDay := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDateRules:LastDay",
		refs,
		"-12.00000000",
		"12.00000000",
		lastDayOfMonthRule(),
		formatDate(anchor),
	))

	dayParams := &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &dayOfMonth.JSON201.RecurringDefinitionId}
	dayOccurrences := listRecurringOccurrences(t, client, dayParams)
	assertRecurringOccurrences(t, dayOccurrences.JSON200.RecurringOccurrences, dayOfMonth.JSON201.RecurringDefinitionId, expectedDayOfMonthSlots(anchor, today, 31))

	lastParams := &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &lastDay.JSON201.RecurringDefinitionId}
	lastOccurrences := listRecurringOccurrences(t, client, lastParams)
	assertRecurringOccurrences(t, lastOccurrences.JSON200.RecurringOccurrences, lastDay.JSON201.RecurringDefinitionId, expectedLastDaySlots(anchor, today))
}

func TestRecurringDateRuleResumeOnDueDateMaterializesBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringResumeDueDate")
	today := civilDateOnly(now)

	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringResumeDueDate:Monthly",
		refs,
		"-10.00000000",
		"10.00000000",
		dayOfMonthRule(today.Day()),
		formatDate(today),
	))
	pauseRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId)
	resumeRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId)

	occurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId})
	if len(occurrences.JSON200.RecurringOccurrences) != 1 {
		t.Fatalf("resume due-date occurrences = %+v, want one expected occurrence", occurrences.JSON200.RecurringOccurrences)
	}
	occurrence := occurrences.JSON200.RecurringOccurrences[0]
	if occurrence.Status != httpclient.Expected || occurrence.GeneratedTransactionId == nil || occurrence.ScheduledDate.Format("2006-01-02") != formatDate(today) {
		t.Fatalf("resume due-date occurrence = %+v, want expected generated occurrence for today", occurrence)
	}
}

func TestRecurringOccurrenceStatusFilterBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringStatusFilter")
	today := civilDateOnly(now)

	expectedDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringStatusFilter:Expected",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	expectedOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &expectedDefinition.JSON201.RecurringDefinitionId})
	expectedID := expectedOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId

	confirmedDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringStatusFilter:Confirmed",
		refs,
		"-11.00000000",
		"11.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	confirmedOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &confirmedDefinition.JSON201.RecurringDefinitionId})
	confirmedID := confirmRecurringOccurrence(t, client, confirmedOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId).JSON200.RecurringOccurrenceId

	dismissedDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringStatusFilter:Dismissed",
		refs,
		"-12.00000000",
		"12.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	dismissedOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &dismissedDefinition.JSON201.RecurringDefinitionId})
	dismissedID := dismissRecurringOccurrence(t, client, dismissedOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId).JSON200.RecurringOccurrenceId

	deferredDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringStatusFilter:Deferred",
		refs,
		"-13.00000000",
		"13.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today.AddDate(0, 0, 7)),
	))
	deferredID := deferRecurringDefinition(t, client, deferredDefinition.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{}).JSON200.RecurringOccurrenceId

	assertRecurringOccurrenceStatusFilter(t, client, httpclient.Expected, []int64{expectedID})
	assertRecurringOccurrenceStatusFilter(t, client, httpclient.Confirmed, []int64{confirmedID})
	assertRecurringOccurrenceStatusFilter(t, client, httpclient.Dismissed, []int64{dismissedID})
	assertRecurringOccurrenceStatusFilter(t, client, httpclient.Deferred, []int64{deferredID})
}

func TestRecurringOccurrenceConfirmAndDismissBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringReview")
	today := civilDateOnly(now)

	confirmDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringReview:Confirm",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	confirmOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &confirmDefinition.JSON201.RecurringDefinitionId})
	confirmed := confirmRecurringOccurrence(t, client, confirmOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId)
	assertReviewedOccurrence(t, *confirmed.JSON200, httpclient.Confirmed)
	assertRecurringActionStatus(t, "double confirm", confirmAgain(t, client, confirmed.JSON200.RecurringOccurrenceId), http.StatusBadRequest)
	assertRecurringActionStatus(t, "dismiss after confirm", dismissAgain(t, client, confirmed.JSON200.RecurringOccurrenceId), http.StatusBadRequest)

	defaultTransactions, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "default confirmed transaction list", err)
	assertTransactionListResponse(t, "default confirmed transaction list", defaultTransactions, []int64{*confirmed.JSON200.GeneratedTransactionId}, 1)
	for _, record := range defaultTransactions.JSON200.Transactions[0].Records {
		if record.PostingStatus != httpclient.PostingStatusPosted || record.Source != httpclient.RecurringTemplate || record.PostedDate == nil {
			t.Fatalf("confirmed record status/source/posted_date = %q/%q/%v", record.PostingStatus, record.Source, record.PostedDate)
		}
	}

	accountIDs := []int64{refs.CheckingAccountID}
	balances, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &accountIDs})
	requireNoTransportError(t, "confirmed account balances", err)
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("confirmed account balances status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}
	assertAccountBalances(t, balances.JSON200.Balances, []wantAccountBalance{
		{accountID: refs.CheckingAccountID, currency: "USD", current: "-10.00000000", currentUSD: "-10.00000000", posted: "-10.00000000", unconvertedCount: 0},
	})
	totals, err := client.REST().GetTransactionMonthTotalsWithResponse(context.Background(), &httpclient.GetTransactionMonthTotalsParams{Month: today.Format("2006-01")})
	requireNoTransportError(t, "confirmed month totals", err)
	if totals.StatusCode() != http.StatusOK {
		t.Fatalf("confirmed month totals status = %d, want %d; body %s", totals.StatusCode(), http.StatusOK, totals.Body)
	}
	assertMonthTotal(t, "confirmed spend", totals.JSON200.Spend, "10.00000000", 0)

	dismissDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringReview:Dismiss",
		refs,
		"-15.00000000",
		"15.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	dismissOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &dismissDefinition.JSON201.RecurringDefinitionId})
	dismissedTransactionID := *dismissOccurrences.JSON200.RecurringOccurrences[0].GeneratedTransactionId
	dismissed := dismissRecurringOccurrence(t, client, dismissOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId)
	assertReviewedOccurrence(t, *dismissed.JSON200, httpclient.Dismissed)
	assertRecurringActionStatus(t, "double dismiss", dismissAgain(t, client, dismissed.JSON200.RecurringOccurrenceId), http.StatusBadRequest)
	assertRecurringActionStatus(t, "confirm after dismiss", confirmAgain(t, client, dismissed.JSON200.RecurringOccurrenceId), http.StatusBadRequest)

	afterDismiss := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &dismissDefinition.JSON201.RecurringDefinitionId})
	assertRecurringOccurrenceIDs(t, afterDismiss.JSON200.RecurringOccurrences, []int64{dismissed.JSON200.RecurringOccurrenceId})
	dismissedTransaction, err := client.REST().GetTransactionWithResponse(context.Background(), dismissedTransactionID)
	requireNoTransportError(t, "get dismissed transaction", err)
	if dismissedTransaction.StatusCode() != http.StatusNotFound {
		t.Fatalf("dismissed transaction status = %d, want %d; body %s", dismissedTransaction.StatusCode(), http.StatusNotFound, dismissedTransaction.Body)
	}
}

func TestRecurringDefinitionConfirmNextBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringConfirmNext")
	today := civilDateOnly(now)
	nextDue := today.AddDate(0, 0, 7)

	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringConfirmNext:Weekly",
		refs,
		"-8.00000000",
		"8.00000000",
		intervalRule(1, "WEEK"),
		formatDate(nextDue),
	))
	confirmed := confirmNextRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId)
	assertReviewedOccurrence(t, *confirmed.JSON200, httpclient.Confirmed)
	if confirmed.JSON200.ScheduledDate.Format("2006-01-02") != formatDate(nextDue) {
		t.Fatalf("confirm-next scheduled_date = %s, want %s", confirmed.JSON200.ScheduledDate.Format("2006-01-02"), formatDate(nextDue))
	}

	transaction := getTransaction(t, client, *confirmed.JSON200.GeneratedTransactionId)
	if transaction.JSON200.InitiatedDate.Format("2006-01-02") != formatDate(today) {
		t.Fatalf("confirm-next initiated_date = %s, want %s", transaction.JSON200.InitiatedDate.Format("2006-01-02"), formatDate(today))
	}
	for _, record := range transaction.JSON200.Records {
		if record.PostingStatus != httpclient.PostingStatusPosted || record.PostedDate == nil {
			t.Fatalf("confirm-next record status/posted_date = %q/%v", record.PostingStatus, record.PostedDate)
		}
	}

	clock.Set(nextDue.AddDate(0, 0, 7))
	afterNextSlot := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId})
	if len(afterNextSlot.JSON200.RecurringOccurrences) != 2 {
		t.Fatalf("confirm-next occurrence count = %d, want 2; occurrences = %+v", len(afterNextSlot.JSON200.RecurringOccurrences), afterNextSlot.JSON200.RecurringOccurrences)
	}
	if afterNextSlot.JSON200.RecurringOccurrences[0].Status != httpclient.Confirmed || afterNextSlot.JSON200.RecurringOccurrences[1].Status != httpclient.Expected {
		t.Fatalf("confirm-next statuses = %q/%q, want confirmed/expected", afterNextSlot.JSON200.RecurringOccurrences[0].Status, afterNextSlot.JSON200.RecurringOccurrences[1].Status)
	}
	if afterNextSlot.JSON200.RecurringOccurrences[1].ScheduledDate.Format("2006-01-02") != formatDate(nextDue.AddDate(0, 0, 7)) {
		t.Fatalf("following slot date = %s, want %s", afterNextSlot.JSON200.RecurringOccurrences[1].ScheduledDate.Format("2006-01-02"), formatDate(nextDue.AddDate(0, 0, 7)))
	}
}

func TestRecurringDefinitionDeferBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringDefer")
	today := civilDateOnly(now)
	nextDue := today.AddDate(0, 0, 7)

	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDefer:Weekly",
		refs,
		"-6.00000000",
		"6.00000000",
		intervalRule(1, "WEEK"),
		formatDate(nextDue),
	))
	deferred := deferRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{})
	assertDeferredOccurrence(t, *deferred.JSON200, formatDate(nextDue))
	assertRecurringActionStatus(t, "confirm after defer", confirmAgain(t, client, deferred.JSON200.RecurringOccurrenceId), http.StatusBadRequest)
	assertRecurringActionStatus(t, "dismiss after defer", dismissAgain(t, client, deferred.JSON200.RecurringOccurrenceId), http.StatusBadRequest)
	shifted := getRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId)
	if shifted.JSON200.AnchorDate.Format("2006-01-02") != formatDate(nextDue.AddDate(0, 0, 7)) {
		t.Fatalf("default defer anchor = %s, want %s", shifted.JSON200.AnchorDate.Format("2006-01-02"), formatDate(nextDue.AddDate(0, 0, 7)))
	}
	assertDatePtr(t, shifted.JSON200.NextDueDate, formatDate(nextDue.AddDate(0, 0, 7)))

	custom := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDefer:Custom",
		refs,
		"-7.00000000",
		"7.00000000",
		intervalRule(1, "DAY"),
		formatDate(today.AddDate(0, 0, 1)),
	))
	every := int64(3)
	unit := httpclient.DAY
	deferRecurringDefinition(t, client, custom.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{Every: &every, Unit: &unit})
	customShifted := getRecurringDefinition(t, client, custom.JSON201.RecurringDefinitionId)
	if customShifted.JSON200.AnchorDate.Format("2006-01-02") != formatDate(today.AddDate(0, 0, 4)) {
		t.Fatalf("custom defer anchor = %s, want %s", customShifted.JSON200.AnchorDate.Format("2006-01-02"), formatDate(today.AddDate(0, 0, 4)))
	}

	dateRule := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDefer:DateRule",
		refs,
		"-8.00000000",
		"8.00000000",
		dayOfMonthRule(today.Day()),
		formatDate(today),
	))
	rejected, err := client.REST().DeferRecurringDefinitionWithResponse(context.Background(), dateRule.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{})
	requireNoTransportError(t, "defer date-rule recurring definition", err)
	if rejected.StatusCode() != http.StatusBadRequest {
		t.Fatalf("defer date-rule status = %d, want %d; body %s", rejected.StatusCode(), http.StatusBadRequest, rejected.Body)
	}
}

func TestRecurringDefinitionReviewActionsCatchUpOverdueSlots(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringActionCatchUp")
	today := civilDateOnly(now)
	anchor := today.AddDate(0, 0, -14)
	nextDue := today.AddDate(0, 0, 7)
	catchUpDates := []string{
		formatDate(anchor),
		formatDate(anchor.AddDate(0, 0, 7)),
		formatDate(today),
		formatDate(nextDue),
	}

	confirmDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringActionCatchUp:ConfirmNext",
		refs,
		"-6.00000000",
		"6.00000000",
		intervalRule(1, "WEEK"),
		formatDate(anchor),
	))
	confirmed := confirmNextRecurringDefinition(t, client, confirmDefinition.JSON201.RecurringDefinitionId)
	assertReviewedOccurrence(t, *confirmed.JSON200, httpclient.Confirmed)
	if confirmed.JSON200.ScheduledDate.Format("2006-01-02") != formatDate(nextDue) {
		t.Fatalf("catch-up confirm-next scheduled_date = %s, want %s", confirmed.JSON200.ScheduledDate.Format("2006-01-02"), formatDate(nextDue))
	}
	confirmOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &confirmDefinition.JSON201.RecurringDefinitionId})
	assertRecurringOccurrenceTimeline(t, confirmOccurrences.JSON200.RecurringOccurrences, confirmDefinition.JSON201.RecurringDefinitionId, catchUpDates, []httpclient.RecurringOccurrenceStatus{
		httpclient.Expected,
		httpclient.Expected,
		httpclient.Expected,
		httpclient.Confirmed,
	})

	deferDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringActionCatchUp:Defer",
		refs,
		"-7.00000000",
		"7.00000000",
		intervalRule(1, "WEEK"),
		formatDate(anchor),
	))
	deferred := deferRecurringDefinition(t, client, deferDefinition.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{})
	assertDeferredOccurrence(t, *deferred.JSON200, formatDate(nextDue))
	deferOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &deferDefinition.JSON201.RecurringDefinitionId})
	assertRecurringOccurrenceTimeline(t, deferOccurrences.JSON200.RecurringOccurrences, deferDefinition.JSON201.RecurringDefinitionId, catchUpDates, []httpclient.RecurringOccurrenceStatus{
		httpclient.Expected,
		httpclient.Expected,
		httpclient.Expected,
		httpclient.Deferred,
	})
}

func TestRecurringDefinitionPauseResumeBoundary(t *testing.T) {
	base := firstDayOfMonth(civilDateOnly(time.Now()))
	clock := apptest.NewFakeClock(base)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringPause")

	interval := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringPause:Interval",
		refs,
		"-9.00000000",
		"9.00000000",
		intervalRule(1, "WEEK"),
		formatDate(base),
	))
	paused := pauseRecurringDefinition(t, client, interval.JSON201.RecurringDefinitionId)
	if paused.JSON200.PausedAt == nil || paused.JSON200.NextDueDate != nil {
		t.Fatalf("paused interval paused_at/next_due_date = %v/%v", paused.JSON200.PausedAt, paused.JSON200.NextDueDate)
	}
	assertRecurringOccurrenceCount(t, listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &interval.JSON201.RecurringDefinitionId}), 0)
	resumeDate := base.AddDate(0, 0, 14)
	clock.Set(resumeDate)
	assertRecurringOccurrenceCount(t, listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &interval.JSON201.RecurringDefinitionId}), 0)
	resumed := resumeRecurringDefinition(t, client, interval.JSON201.RecurringDefinitionId)
	if resumed.JSON200.PausedAt != nil || resumed.JSON200.AnchorDate.Format("2006-01-02") != formatDate(resumeDate) {
		t.Fatalf("resumed interval paused_at/anchor = %v/%s", resumed.JSON200.PausedAt, resumed.JSON200.AnchorDate.Format("2006-01-02"))
	}
	intervalOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &interval.JSON201.RecurringDefinitionId})
	assertRecurringOccurrences(t, intervalOccurrences.JSON200.RecurringOccurrences, interval.JSON201.RecurringDefinitionId, []string{formatDate(resumeDate)})

	dateRule := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringPause:DateRule",
		refs,
		"-10.00000000",
		"10.00000000",
		dayOfMonthRule(15),
		formatDate(base),
	))
	pauseRecurringDefinition(t, client, dateRule.JSON201.RecurringDefinitionId)
	dateResume := base.AddDate(0, 2, 0)
	clock.Set(dateResume)
	resumeRecurringDefinition(t, client, dateRule.JSON201.RecurringDefinitionId)
	dateOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &dateRule.JSON201.RecurringDefinitionId})
	if len(dateOccurrences.JSON200.RecurringOccurrences) != 2 ||
		dateOccurrences.JSON200.RecurringOccurrences[0].Status != httpclient.Deferred ||
		dateOccurrences.JSON200.RecurringOccurrences[1].Status != httpclient.Deferred {
		t.Fatalf("date-rule resumed occurrences = %+v, want two deferred skipped slots", dateOccurrences.JSON200.RecurringOccurrences)
	}
	clock.Set(time.Date(dateResume.Year(), dateResume.Month(), 15, 12, 0, 0, 0, dateResume.Location()))
	dateDue := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &dateRule.JSON201.RecurringDefinitionId})
	if len(dateDue.JSON200.RecurringOccurrences) != 3 || dateDue.JSON200.RecurringOccurrences[2].Status != httpclient.Expected {
		t.Fatalf("date-rule post-resume occurrences = %+v, want deferred/deferred/expected", dateDue.JSON200.RecurringOccurrences)
	}
}

func TestRecurringDefinitionQueueSurvivesPauseAndCancelBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringQueue")
	today := civilDateOnly(now)

	pausedDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringQueue:Pause",
		refs,
		"-11.00000000",
		"11.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	pausedOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &pausedDefinition.JSON201.RecurringDefinitionId})
	pauseRecurringDefinition(t, client, pausedDefinition.JSON201.RecurringDefinitionId)
	confirmRecurringOccurrence(t, client, pausedOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId)

	cancelledDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringQueue:Cancel",
		refs,
		"-12.00000000",
		"12.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	cancelledOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &cancelledDefinition.JSON201.RecurringDefinitionId})
	deleted, err := client.REST().DeleteRecurringDefinitionWithResponse(context.Background(), cancelledDefinition.JSON201.RecurringDefinitionId)
	requireNoTransportError(t, "cancel recurring definition with queue", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("cancel recurring definition status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	dismissRecurringOccurrence(t, client, cancelledOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId)
	clock.Set(today.AddDate(0, 0, 7))
	afterCancel := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &cancelledDefinition.JSON201.RecurringDefinitionId})
	assertRecurringOccurrenceIDs(t, afterCancel.JSON200.RecurringOccurrences, []int64{cancelledOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId})
}

func TestRecurringDefinitionEditFutureOnlyBoundary(t *testing.T) {
	now := time.Now()
	clock := apptest.NewFakeClock(now)
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringEditFuture")
	today := civilDateOnly(now)

	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringEditFuture:Weekly",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	firstOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId})
	firstTransaction := getTransaction(t, client, *firstOccurrences.JSON200.RecurringOccurrences[0].GeneratedTransactionId)

	replaced, err := client.REST().ReplaceRecurringDefinitionWithResponse(
		context.Background(),
		definition.JSON201.RecurringDefinitionId,
		recurringDefinitionRequest("RecurringEditFuture:Weekly", refs, "-20.00000000", "20.00000000", intervalRule(1, "WEEK"), formatDate(today)),
	)
	requireNoTransportError(t, "replace recurring definition for future-only test", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace recurring definition status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	clock.Set(today.AddDate(0, 0, 7))
	secondOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId})
	if len(secondOccurrences.JSON200.RecurringOccurrences) != 2 ||
		secondOccurrences.JSON200.RecurringOccurrences[0].MaterializedDefinitionVersion != 1 ||
		secondOccurrences.JSON200.RecurringOccurrences[1].MaterializedDefinitionVersion != 2 {
		t.Fatalf("future-only occurrences = %+v, want second version 2", secondOccurrences.JSON200.RecurringOccurrences)
	}
	firstTransactionAfterEdit := getTransaction(t, client, *secondOccurrences.JSON200.RecurringOccurrences[0].GeneratedTransactionId)
	secondTransaction := getTransaction(t, client, *secondOccurrences.JSON200.RecurringOccurrences[1].GeneratedTransactionId)
	assertTransactionCheckingAmount(t, firstTransaction.JSON200.Records, refs.CheckingAccountID, "-10.00000000")
	assertTransactionCheckingAmount(t, firstTransactionAfterEdit.JSON200.Records, refs.CheckingAccountID, "-10.00000000")
	assertTransactionCheckingAmount(t, secondTransaction.JSON200.Records, refs.CheckingAccountID, "-20.00000000")
}

func createRecurringDefinitionRefs(t *testing.T, client *apptest.Client, prefix string) recurringDefinitionRefs {
	t.Helper()

	checking := client.Scenario().AccountWithCurrency("checking:"+prefix+":Primary", "USD")
	merchant := client.Scenario().Account("expense:" + prefix + ":Merchant")
	category := client.Scenario().Category(prefix + ":Category")
	tag := client.Scenario().Tag(prefix + ":Tag")
	member := client.Scenario().Member(prefix + " Member")

	return recurringDefinitionRefs{
		CheckingAccountID: checking.AccountId,
		MerchantAccountID: merchant.AccountId,
		CategoryID:        category.CategoryId,
		TagID:             tag.TagId,
		MemberID:          member.MemberId,
	}
}

func recurringDefinitionRequest(
	fqn string,
	refs recurringDefinitionRefs,
	debit string,
	credit string,
	rule httpclient.RecurringScheduleRule,
	anchor string,
) httpclient.RecurringDefinitionWriteRequest {
	return httpclient.RecurringDefinitionWriteRequest{
		Fqn:          fqn,
		ScheduleRule: rule,
		AnchorDate:   apptest.Date(anchor),
		Records: &[]httpclient.RecurringDefinitionRecordRequest{
			{
				AccountId:  &refs.CheckingAccountID,
				MemberId:   nullable.NewNullableWithValue(refs.MemberID),
				Currency:   recurringStringPtr("USD"),
				Amount:     recurringStringPtr(debit),
				CategoryId: &refs.CategoryID,
				TagIds:     &[]int64{refs.TagID},
				Memo:       nullable.NewNullableWithValue("debit"),
			},
			{
				AccountId:  &refs.MerchantAccountID,
				MemberId:   nullable.NewNullableWithValue(refs.MemberID),
				Currency:   recurringStringPtr("USD"),
				Amount:     recurringStringPtr(credit),
				CategoryId: &refs.CategoryID,
				TagIds:     &[]int64{refs.TagID},
				Memo:       nullable.NewNullableWithValue("credit"),
			},
		},
	}
}

func recurringExpectedReplacementRequest(refs recurringDefinitionRefs, memo string) httpclient.UpdateTransactionRequest {
	pendingDate := apptest.Timestamp("2024-03-12T00:00:00Z")
	postedDate := apptest.Timestamp("2024-03-13T00:00:00Z")
	return httpclient.UpdateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-12"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountID,
				MemberId:             &refs.MemberID,
				Currency:             "USD",
				Amount:               "-20.00",
				AmountUsd:            apptest.StringPtr("-20.00"),
				CategoryId:           refs.CategoryID,
				TagIds:               apptest.Int64SlicePtr(refs.TagID),
				Memo:                 &memo,
				PendingDate:          &pendingDate,
				PostedDate:           &postedDate,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountID,
				Currency:             "USD",
				Amount:               "20.00",
				AmountUsd:            apptest.StringPtr("20.00"),
				CategoryId:           refs.CategoryID,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
		},
	}
}

func createRecurringDefinition(t *testing.T, client *apptest.Client, request httpclient.RecurringDefinitionWriteRequest) *httpclient.CreateRecurringDefinitionResponse {
	t.Helper()

	response, err := client.REST().CreateRecurringDefinitionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create recurring definition request: %v", err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create recurring definition status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return response
}

func getRecurringDefinition(t *testing.T, client *apptest.Client, id int64) *httpclient.GetRecurringDefinitionResponse {
	t.Helper()

	response, err := client.REST().GetRecurringDefinitionWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("get recurring definition request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get recurring definition status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func assertRecurringDefinitionCreateStatus(
	t *testing.T,
	client *apptest.Client,
	label string,
	request httpclient.RecurringDefinitionWriteRequest,
	status int,
	code httpclient.APIErrorCode,
) {
	t.Helper()

	response, err := client.REST().CreateRecurringDefinitionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("%s request: %v", label, err)
	}
	if response.StatusCode() != status {
		t.Fatalf("%s status = %d, want %d; body %s", label, response.StatusCode(), status, response.Body)
	}
	switch status {
	case http.StatusBadRequest:
		if response.JSON400.Error.Code != code {
			t.Fatalf("%s code = %q, want %q", label, response.JSON400.Error.Code, code)
		}
	case http.StatusConflict:
		if response.JSON409.Error.Code != code {
			t.Fatalf("%s code = %q, want %q", label, response.JSON409.Error.Code, code)
		}
	}
}

func assertRecurringDefinition(
	t *testing.T,
	definition httpclient.RecurringDefinition,
	fqn string,
	class httpclient.RecurringScheduleClass,
	anchor string,
	version int64,
	refs recurringDefinitionRefs,
	debit string,
	credit string,
) {
	t.Helper()

	if definition.Fqn != fqn || definition.ScheduleClass != class || definition.AnchorDate.Format("2006-01-02") != anchor || definition.DefinitionVersion != version {
		t.Fatalf("definition = fqn:%q class:%q anchor:%s version:%d", definition.Fqn, definition.ScheduleClass, definition.AnchorDate.Format("2006-01-02"), definition.DefinitionVersion)
	}
	if len(definition.Records) != 2 {
		t.Fatalf("record count = %d, want 2", len(definition.Records))
	}
	assertRecurringRecord(t, definition.Records[0], refs.CheckingAccountID, refs.CategoryID, refs.TagID, refs.MemberID, debit)
	assertRecurringRecord(t, definition.Records[1], refs.MerchantAccountID, refs.CategoryID, refs.TagID, refs.MemberID, credit)
}

func assertRecurringRecord(t *testing.T, record httpclient.RecurringDefinitionRecord, accountID int64, categoryID int64, tagID int64, memberID int64, amount string) {
	t.Helper()

	if record.AccountId != accountID || record.CategoryId != categoryID || record.Currency != "USD" || record.Amount != amount {
		t.Fatalf("record = account:%d category:%d currency:%q amount:%q", record.AccountId, record.CategoryId, record.Currency, record.Amount)
	}
	if record.MemberId == nil || *record.MemberId != memberID {
		t.Fatalf("member_id = %v, want %d", record.MemberId, memberID)
	}
	if len(record.TagIds) != 1 || record.TagIds[0] != tagID {
		t.Fatalf("tag_ids = %v, want [%d]", record.TagIds, tagID)
	}
	if record.RecurringDefinitionRecordId <= 0 || record.RecurringDefinitionId <= 0 || record.CreatedAt.IsZero() || record.UpdatedAt.IsZero() {
		t.Fatalf("record ids/timestamps not populated: %+v", record)
	}
}

func recurringDefinitionRecordIDs(records []httpclient.RecurringDefinitionRecord) []int64 {
	ids := make([]int64, 0, len(records))
	for _, record := range records {
		ids = append(ids, record.RecurringDefinitionRecordId)
	}

	return ids
}

func assertRecurringDefinitionRecordIDs(t *testing.T, records []httpclient.RecurringDefinitionRecord, want []int64) {
	t.Helper()

	assertInt64Slice(t, recurringDefinitionRecordIDs(records), want)
}

func assertRecurringDefinitionIDs(t *testing.T, definitions []httpclient.RecurringDefinition, want []int64) {
	t.Helper()

	got := make([]int64, 0, len(definitions))
	for _, definition := range definitions {
		got = append(got, definition.RecurringDefinitionId)
	}
	assertInt64Slice(t, got, want)
}

func listRecurringOccurrences(t *testing.T, client *apptest.Client, params *httpclient.ListRecurringOccurrencesParams) *httpclient.ListRecurringOccurrencesResponse {
	t.Helper()

	response, err := client.REST().ListRecurringOccurrencesWithResponse(context.Background(), params)
	requireNoTransportError(t, "list recurring occurrences", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list recurring occurrences status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func confirmRecurringOccurrence(t *testing.T, client *apptest.Client, id int64) *httpclient.ConfirmRecurringOccurrenceResponse {
	t.Helper()

	response, err := client.REST().ConfirmRecurringOccurrenceWithResponse(context.Background(), id)
	requireNoTransportError(t, "confirm recurring occurrence", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("confirm recurring occurrence status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func dismissRecurringOccurrence(t *testing.T, client *apptest.Client, id int64) *httpclient.DismissRecurringOccurrenceResponse {
	t.Helper()

	response, err := client.REST().DismissRecurringOccurrenceWithResponse(context.Background(), id)
	requireNoTransportError(t, "dismiss recurring occurrence", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("dismiss recurring occurrence status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func confirmNextRecurringDefinition(t *testing.T, client *apptest.Client, id int64) *httpclient.ConfirmNextRecurringDefinitionResponse {
	t.Helper()

	response, err := client.REST().ConfirmNextRecurringDefinitionWithResponse(context.Background(), id)
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

func confirmAgain(t *testing.T, client *apptest.Client, id int64) int {
	t.Helper()

	response, err := client.REST().ConfirmRecurringOccurrenceWithResponse(context.Background(), id)
	requireNoTransportError(t, "confirm recurring occurrence again", err)

	return response.StatusCode()
}

func dismissAgain(t *testing.T, client *apptest.Client, id int64) int {
	t.Helper()

	response, err := client.REST().DismissRecurringOccurrenceWithResponse(context.Background(), id)
	requireNoTransportError(t, "dismiss recurring occurrence again", err)

	return response.StatusCode()
}

func getTransaction(t *testing.T, client *apptest.Client, id int64) *httpclient.GetTransactionResponse {
	t.Helper()

	response, err := client.REST().GetTransactionWithResponse(context.Background(), id)
	requireNoTransportError(t, "get transaction", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func assertReviewedOccurrence(t *testing.T, occurrence httpclient.RecurringOccurrence, status httpclient.RecurringOccurrenceStatus) {
	t.Helper()

	if occurrence.Status != status || occurrence.ReviewedAt == nil || occurrence.MaterializedAt.IsZero() || occurrence.GeneratedTransactionId == nil {
		t.Fatalf("reviewed occurrence = %+v, want status %q with reviewed_at and generated transaction", occurrence, status)
	}
}

func assertRecurringActionStatus(t *testing.T, label string, got int, want int) {
	t.Helper()

	if got != want {
		t.Fatalf("%s status = %d, want %d", label, got, want)
	}
}

func assertInvalidRequestStatus(t *testing.T, label string, gotStatus int, gotBody *httpclient.InvalidRequest, rawBody []byte) {
	t.Helper()

	if gotStatus != http.StatusBadRequest {
		t.Fatalf("%s status = %d, want %d; body %s", label, gotStatus, http.StatusBadRequest, rawBody)
	}
	if gotBody == nil || gotBody.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("%s error = %+v, want invalid_request; body %s", label, gotBody, rawBody)
	}
}

func assertDeferredOccurrence(t *testing.T, occurrence httpclient.RecurringOccurrence, scheduledDate string) {
	t.Helper()

	if occurrence.Status != httpclient.Deferred ||
		occurrence.ScheduledDate.Format("2006-01-02") != scheduledDate ||
		occurrence.GeneratedTransactionId != nil ||
		occurrence.ReviewedAt == nil {
		t.Fatalf("deferred occurrence = %+v, want deferred date %s with no generated transaction", occurrence, scheduledDate)
	}
}

func assertRecurringOccurrenceCount(t *testing.T, response *httpclient.ListRecurringOccurrencesResponse, want int) {
	t.Helper()

	if len(response.JSON200.RecurringOccurrences) != want {
		t.Fatalf("occurrence count = %d, want %d; occurrences = %+v", len(response.JSON200.RecurringOccurrences), want, response.JSON200.RecurringOccurrences)
	}
}

func assertTransactionCheckingAmount(t *testing.T, records []httpclient.JournalRecord, accountID int64, want string) {
	t.Helper()

	for _, record := range records {
		if record.AccountId == accountID {
			if record.Amount != want {
				t.Fatalf("checking record amount = %q, want %q; records = %+v", record.Amount, want, records)
			}
			return
		}
	}
	t.Fatalf("checking account %d not found in records %+v", accountID, records)
}

func assertRecurringOccurrences(t *testing.T, occurrences []httpclient.RecurringOccurrence, definitionID int64, wantDates []string) {
	t.Helper()

	if len(occurrences) != len(wantDates) {
		t.Fatalf("occurrence count = %d, want %d; occurrences = %+v", len(occurrences), len(wantDates), occurrences)
	}
	for index, occurrence := range occurrences {
		if occurrence.RecurringDefinitionId != definitionID ||
			occurrence.ScheduledDate.Format("2006-01-02") != wantDates[index] ||
			occurrence.Status != httpclient.Expected ||
			occurrence.MaterializedDefinitionVersion != 1 ||
			occurrence.GeneratedTransactionId == nil ||
			occurrence.MaterializedAt.IsZero() ||
			occurrence.CreatedAt.IsZero() ||
			occurrence.UpdatedAt.IsZero() ||
			occurrence.ReviewedAt != nil {
			t.Fatalf("occurrence at %d = %+v, want definition %d date %s expected materialized", index, occurrence, definitionID, wantDates[index])
		}
	}
}

func assertRecurringOccurrenceTimeline(
	t *testing.T,
	occurrences []httpclient.RecurringOccurrence,
	definitionID int64,
	wantDates []string,
	wantStatuses []httpclient.RecurringOccurrenceStatus,
) {
	t.Helper()

	if len(wantDates) != len(wantStatuses) {
		t.Fatalf("test bug: %d dates for %d statuses", len(wantDates), len(wantStatuses))
	}
	if len(occurrences) != len(wantDates) {
		t.Fatalf("occurrence count = %d, want %d; occurrences = %+v", len(occurrences), len(wantDates), occurrences)
	}
	for index, occurrence := range occurrences {
		if occurrence.RecurringDefinitionId != definitionID ||
			occurrence.ScheduledDate.Format("2006-01-02") != wantDates[index] ||
			occurrence.Status != wantStatuses[index] {
			t.Fatalf("occurrence at %d = %+v, want definition %d date %s status %q", index, occurrence, definitionID, wantDates[index], wantStatuses[index])
		}
	}
}

func recurringOccurrenceIDs(occurrences []httpclient.RecurringOccurrence) []int64 {
	ids := make([]int64, 0, len(occurrences))
	for _, occurrence := range occurrences {
		ids = append(ids, occurrence.RecurringOccurrenceId)
	}

	return ids
}

func assertRecurringOccurrenceIDs(t *testing.T, occurrences []httpclient.RecurringOccurrence, want []int64) {
	t.Helper()

	assertInt64Slice(t, recurringOccurrenceIDs(occurrences), want)
}

func assertRecurringOccurrenceStatusFilter(t *testing.T, client *apptest.Client, status httpclient.RecurringOccurrenceStatus, wantIDs []int64) {
	t.Helper()

	statuses := []httpclient.RecurringOccurrenceStatus{status}
	response := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{Status: &statuses})
	for _, occurrence := range response.JSON200.RecurringOccurrences {
		if occurrence.Status != status {
			t.Fatalf("status filter %q returned occurrence %+v", status, occurrence)
		}
	}
	assertSameInt64Set(t, recurringOccurrenceIDs(response.JSON200.RecurringOccurrences), wantIDs)
}

func generatedTransactionIDs(t *testing.T, occurrences []httpclient.RecurringOccurrence) []int64 {
	t.Helper()

	ids := make([]int64, 0, len(occurrences))
	for _, occurrence := range occurrences {
		if occurrence.GeneratedTransactionId == nil {
			t.Fatalf("occurrence %d generated_transaction_id = nil", occurrence.RecurringOccurrenceId)
		}
		ids = append(ids, *occurrence.GeneratedTransactionId)
	}

	return ids
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

func firstDayOfMonth(value time.Time) time.Time {
	year, month, _ := value.Date()

	return time.Date(year, month, 1, 0, 0, 0, 0, value.Location())
}

func formatDate(value time.Time) string {
	return value.Format("2006-01-02")
}

func expectedDayOfMonthSlots(anchor time.Time, today time.Time, day int) []string {
	slots := []string{}
	for cursor := firstDayOfMonth(anchor); !cursor.After(today); cursor = cursor.AddDate(0, 1, 0) {
		candidate := dateWithClampedDayForTest(cursor, day)
		if !candidate.Before(anchor) && !candidate.After(today) {
			slots = append(slots, formatDate(candidate))
		}
	}

	return slots
}

func expectedLastDaySlots(anchor time.Time, today time.Time) []string {
	slots := []string{}
	for cursor := firstDayOfMonth(anchor); !cursor.After(today); cursor = cursor.AddDate(0, 1, 0) {
		candidate := lastDayOfMonthForTest(cursor)
		if !candidate.Before(anchor) && !candidate.After(today) {
			slots = append(slots, formatDate(candidate))
		}
	}

	return slots
}

func dateWithClampedDayForTest(month time.Time, day int) time.Time {
	lastDay := lastDayOfMonthForTest(month).Day()
	if day > lastDay {
		day = lastDay
	}

	return time.Date(month.Year(), month.Month(), day, 0, 0, 0, 0, month.Location())
}

func lastDayOfMonthForTest(month time.Time) time.Time {
	return time.Date(month.Year(), month.Month()+1, 0, 0, 0, 0, 0, month.Location())
}

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

func assertDeleteAccountStatus(t *testing.T, client *apptest.Client, accountID int64, status int) {
	t.Helper()

	response, err := client.REST().DeleteAccountWithResponse(context.Background(), accountID)
	if err != nil {
		t.Fatalf("delete account request: %v", err)
	}
	if response.StatusCode() != status {
		t.Fatalf("delete account status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
}

func assertDeleteCategoryStatus(t *testing.T, client *apptest.Client, categoryID int64, status int) {
	t.Helper()

	response, err := client.REST().DeleteCategoryWithResponse(context.Background(), categoryID)
	if err != nil {
		t.Fatalf("delete category request: %v", err)
	}
	if response.StatusCode() != status {
		t.Fatalf("delete category status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
}

func assertDeleteTagStatus(t *testing.T, client *apptest.Client, tagID int64, status int) {
	t.Helper()

	response, err := client.REST().DeleteTagWithResponse(context.Background(), tagID)
	if err != nil {
		t.Fatalf("delete tag request: %v", err)
	}
	if response.StatusCode() != status {
		t.Fatalf("delete tag status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
}

func assertDeleteMemberStatus(t *testing.T, client *apptest.Client, memberID int64, status int) {
	t.Helper()

	response, err := client.REST().DeleteMemberWithResponse(context.Background(), memberID)
	if err != nil {
		t.Fatalf("delete member request: %v", err)
	}
	if response.StatusCode() != status {
		t.Fatalf("delete member status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
}

func withRule(request httpclient.RecurringDefinitionWriteRequest, rule httpclient.RecurringScheduleRule) httpclient.RecurringDefinitionWriteRequest {
	request.Fqn += ":Invalid"
	request.ScheduleRule = rule
	return request
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

func recurringStringPtr(value string) *string {
	return &value
}
