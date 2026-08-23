package runtime_test

import (
	"context"
	"fmt"
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
	CategoryFQN       string
	TagID             int64
	MemberID          int64
}

func TestRecurringDefinitionCreateReadListUpdateCancelBoundary(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2024-01-01T12:00:00Z"))))
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
	base := time.Date(2024, 4, 15, 12, 0, 0, 0, time.FixedZone("local", -4*60*60))
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(base)))
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

	provenance := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringListQuery:Provenance", refs, "-13.00000000", "13.00000000", intervalRule(1, "WEEK"), "2024-04-22"))
	confirmed := confirmNextRecurringDefinition(t, client, provenance.JSON201.RecurringDefinitionId)
	occurrenceID := confirmed.JSON200.RecurringOccurrenceId
	client.SetTime(base.AddDate(0, 0, 21))
	assertDatePtr(t, getRecurringDefinition(t, client, provenance.JSON201.RecurringDefinitionId).JSON200.NextDueDate, "2024-04-29")

	occurrence, err := client.REST().GetRecurringOccurrenceWithResponse(context.Background(), occurrenceID)
	requireNoTransportError(t, "get recurring occurrence", err)
	if occurrence.StatusCode() != http.StatusOK {
		t.Fatalf("get recurring occurrence status = %d, want %d; body %s", occurrence.StatusCode(), http.StatusOK, occurrence.Body)
	}
	if occurrence.JSON200.RecurringOccurrenceId != occurrenceID || occurrence.JSON200.RecurringDefinitionId != provenance.JSON201.RecurringDefinitionId || occurrence.JSON200.RecurringDefinitionFqn != provenance.JSON201.Fqn || !occurrence.JSON200.RecurringDefinitionActive {
		t.Fatalf("get recurring occurrence = %+v, want occurrence %d from definition %+v", occurrence.JSON200, occurrenceID, provenance.JSON201)
	}
	assertDatePtr(t, getRecurringDefinition(t, client, provenance.JSON201.RecurringDefinitionId).JSON200.NextDueDate, "2024-04-29")

	pauseRecurringDefinition(t, client, provenance.JSON201.RecurringDefinitionId)
	pausedOccurrence, err := client.REST().GetRecurringOccurrenceWithResponse(context.Background(), occurrenceID)
	requireNoTransportError(t, "get occurrence from paused definition", err)
	if pausedOccurrence.StatusCode() != http.StatusOK || pausedOccurrence.JSON200.RecurringDefinitionId != provenance.JSON201.RecurringDefinitionId || pausedOccurrence.JSON200.RecurringDefinitionFqn != provenance.JSON201.Fqn || !pausedOccurrence.JSON200.RecurringDefinitionActive {
		t.Fatalf("get occurrence from paused definition = %+v, want occurrence %d from available definition %+v", pausedOccurrence.JSON200, occurrenceID, provenance.JSON201)
	}

	deleted, err := client.REST().DeleteRecurringDefinitionWithResponse(context.Background(), provenance.JSON201.RecurringDefinitionId)
	requireNoTransportError(t, "cancel recurring definition", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("cancel recurring definition status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	cancelledOccurrence, err := client.REST().GetRecurringOccurrenceWithResponse(context.Background(), occurrenceID)
	requireNoTransportError(t, "get occurrence from cancelled definition", err)
	if cancelledOccurrence.StatusCode() != http.StatusOK || cancelledOccurrence.JSON200.RecurringDefinitionId != provenance.JSON201.RecurringDefinitionId || cancelledOccurrence.JSON200.RecurringDefinitionFqn != provenance.JSON201.Fqn || cancelledOccurrence.JSON200.RecurringDefinitionActive {
		t.Fatalf("get occurrence from cancelled definition = %+v, want occurrence %d from unavailable definition %+v", cancelledOccurrence.JSON200, occurrenceID, provenance.JSON201)
	}

	missingOccurrence, err := client.REST().GetRecurringOccurrenceWithResponse(context.Background(), 999_999_999)
	requireNoTransportError(t, "get missing recurring occurrence", err)
	if missingOccurrence.StatusCode() != http.StatusNotFound {
		t.Fatalf("get missing recurring occurrence status = %d, want %d; body %s", missingOccurrence.StatusCode(), http.StatusNotFound, missingOccurrence.Body)
	}
}

func TestRecurringDefinitionNextDueDateSortBoundary(t *testing.T) {
	base := time.Date(2024, 4, 15, 12, 0, 0, 0, time.FixedZone("local", -4*60*60))
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(base)))
	refs := createRecurringDefinitionRefs(t, client, "RecurringNextDueSort")

	history := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringNextDueSort:CHistory", refs, "-9.00000000", "9.00000000", intervalRule(1, "MONTH"), "2024-03-01"))
	listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &history.JSON201.RecurringDefinitionId,
	})
	historyAfterCatchUp := getRecurringDefinition(t, client, history.JSON201.RecurringDefinitionId)
	assertDatePtr(t, historyAfterCatchUp.JSON200.NextDueDate, "2024-05-01")

	overdue := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringNextDueSort:ZOverdue", refs, "-10.00000000", "10.00000000", intervalRule(1, "MONTH"), "2024-04-01"))
	nearTerm := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringNextDueSort:YNearTerm", refs, "-11.00000000", "11.00000000", intervalRule(1, "MONTH"), "2024-04-15"))
	tiedSecond := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringNextDueSort:BTied", refs, "-12.00000000", "12.00000000", intervalRule(1, "MONTH"), "2024-04-16"))
	tiedFirst := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringNextDueSort:ATied", refs, "-13.00000000", "13.00000000", intervalRule(1, "MONTH"), "2024-04-16"))
	later := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringNextDueSort:ALater", refs, "-14.00000000", "14.00000000", intervalRule(1, "MONTH"), "2024-04-30"))
	undated := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringNextDueSort:AUndated", refs, "-15.00000000", "15.00000000", intervalRule(1, "MONTH"), "2024-04-10"))
	undatedSecond := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringNextDueSort:ZUndated", refs, "-16.00000000", "16.00000000", intervalRule(1, "MONTH"), "2024-04-11"))
	pauseRecurringDefinition(t, client, undated.JSON201.RecurringDefinitionId)
	pauseRecurringDefinition(t, client, undatedSecond.JSON201.RecurringDefinitionId)

	sort := httpclient.ListRecurringDefinitionsParamsSortNextDueDate
	sortDir := httpclient.ListRecurringDefinitionsParamsSortDirAsc
	definitions, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), &httpclient.ListRecurringDefinitionsParams{
		Sort:    &sort,
		SortDir: &sortDir,
	})
	requireNoTransportError(t, "list recurring definitions by next due date", err)
	if definitions.StatusCode() != http.StatusOK {
		t.Fatalf("next-due sorted definitions status = %d, want %d; body %s", definitions.StatusCode(), http.StatusOK, definitions.Body)
	}
	assertRecurringDefinitionIDs(t, definitions.JSON200.RecurringDefinitions, []int64{
		overdue.JSON201.RecurringDefinitionId,
		nearTerm.JSON201.RecurringDefinitionId,
		tiedFirst.JSON201.RecurringDefinitionId,
		tiedSecond.JSON201.RecurringDefinitionId,
		later.JSON201.RecurringDefinitionId,
		history.JSON201.RecurringDefinitionId,
		undated.JSON201.RecurringDefinitionId,
		undatedSecond.JSON201.RecurringDefinitionId,
	})
	if definitions.JSON200.TotalCount != 8 {
		t.Fatalf("next-due sorted definition total_count = %d, want 8", definitions.JSON200.TotalCount)
	}

	sortDir = httpclient.ListRecurringDefinitionsParamsSortDirDesc
	descending, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), &httpclient.ListRecurringDefinitionsParams{
		Sort:    &sort,
		SortDir: &sortDir,
	})
	requireNoTransportError(t, "list recurring definitions by next due date descending", err)
	if descending.StatusCode() != http.StatusOK {
		t.Fatalf("descending next-due definitions status = %d, want %d; body %s", descending.StatusCode(), http.StatusOK, descending.Body)
	}
	assertRecurringDefinitionIDs(t, descending.JSON200.RecurringDefinitions, []int64{
		history.JSON201.RecurringDefinitionId,
		later.JSON201.RecurringDefinitionId,
		tiedFirst.JSON201.RecurringDefinitionId,
		tiedSecond.JSON201.RecurringDefinitionId,
		nearTerm.JSON201.RecurringDefinitionId,
		overdue.JSON201.RecurringDefinitionId,
		undated.JSON201.RecurringDefinitionId,
		undatedSecond.JSON201.RecurringDefinitionId,
	})

	limit := 2
	offset := 2
	sortDir = httpclient.ListRecurringDefinitionsParamsSortDirAsc
	page, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), &httpclient.ListRecurringDefinitionsParams{
		Sort:    &sort,
		SortDir: &sortDir,
		Limit:   &limit,
		Offset:  &offset,
	})
	requireNoTransportError(t, "list paginated recurring definitions by next due date", err)
	if page.StatusCode() != http.StatusOK {
		t.Fatalf("paginated next-due definitions status = %d, want %d; body %s", page.StatusCode(), http.StatusOK, page.Body)
	}
	assertRecurringDefinitionIDs(t, page.JSON200.RecurringDefinitions, []int64{
		tiedFirst.JSON201.RecurringDefinitionId,
		tiedSecond.JSON201.RecurringDefinitionId,
	})
	if page.JSON200.TotalCount != 8 {
		t.Fatalf("paginated next-due definition total_count = %d, want 8", page.JSON200.TotalCount)
	}
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
	invalidCategory := recurringDefinitionRequest("RecurringValidation:InvalidCategory", refs, "-10.00000000", "10.00000000", intervalRule(1, "MONTH"), "2024-01-31")
	(*invalidCategory.Records)[0].CategoryId = nullable.NewNullableWithValue(refs.CategoryID)
	assertRecurringDefinitionCreateStatus(t, client, "category on owned record", invalidCategory, http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringValidation:InvalidCategory", refs, "-10.00000000", "10.00000000", intervalRule(1, "MONTH"), "2024-01-31"))
	unbalancedReplace := recurringDefinitionRequest("RecurringValidation:Replaced", refs, "-10.00000000", "9.00000000", intervalRule(1, "WEEK"), "2024-01-31")
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
		recurringDefinitionRequest("RecurringValidation:Occupied", refs, "-12.00000000", "12.00000000", intervalRule(1, "WEEK"), "2024-01-31"),
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
		recurringDefinitionRequest("RecurringValidation:Tree", refs, "-12.00000000", "12.00000000", intervalRule(1, "WEEK"), "2024-01-31"),
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

func TestRecurringDefinitionEnforcesAccountCurrencyOnSaveAndMaterialization(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "RecurringCurrency")
	request := recurringDefinitionRequest(
		"RecurringCurrency:Mismatch",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "MONTH"),
		"2024-01-31",
	)
	for index := range *request.Records {
		(*request.Records)[index].Currency = recurringStringPtr("EUR")
	}
	assertRecurringDefinitionCreateStatus(
		t,
		client,
		"single-currency mismatch",
		request,
		http.StatusBadRequest,
		httpclient.APIErrorCodeInvalidRequest,
	)

	client.SetAccountCurrency(refs.CheckingAccountID, nil)
	request.Fqn = "RecurringCurrency:Release"
	created := createRecurringDefinition(t, client, request)
	usd := "USD"
	rejected, err := client.REST().UpdateAccountWithResponse(
		context.Background(),
		refs.CheckingAccountID,
		httpclient.UpdateAccountRequest{Currency: nullable.NewNullableWithValue(usd)},
	)
	requireNoTransportError(t, "reject currency change conflicting with recurring definition", err)
	if rejected.StatusCode() != http.StatusConflict {
		t.Fatalf(
			"currency change conflicting with recurring definition status = %d, want %d; body %s",
			rejected.StatusCode(),
			http.StatusConflict,
			rejected.Body,
		)
	}
	if rejected.JSON409 == nil || rejected.JSON409.Error.Message != "account currency change conflicts with existing journal or recurring-definition records" {
		t.Fatalf(
			"currency change conflicting with recurring definition message = %v, want recurring-definition conflict",
			rejected.JSON409,
		)
	}
	replaced, err := client.REST().ReplaceRecurringDefinitionWithResponse(
		context.Background(),
		created.JSON201.RecurringDefinitionId,
		recurringDefinitionRequest(
			"RecurringCurrency:Release",
			refs,
			"-10.00000000",
			"10.00000000",
			intervalRule(1, "MONTH"),
			"2024-01-31",
		),
	)
	requireNoTransportError(t, "replace currency-constraining recurring definition", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf(
			"replace currency-constraining recurring definition status = %d, want %d; body %s",
			replaced.StatusCode(),
			http.StatusOK,
			replaced.Body,
		)
	}
	updated := client.SetAccountCurrency(refs.CheckingAccountID, &usd)
	if updated.Currency == nil || *updated.Currency != usd {
		t.Fatalf("currency change after recurring replacement = %v, want USD", updated.Currency)
	}
	deleted, err := client.REST().DeleteRecurringDefinitionWithResponse(
		context.Background(),
		created.JSON201.RecurringDefinitionId,
	)
	requireNoTransportError(t, "cancel replaced recurring definition", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf(
			"cancel replaced recurring definition status = %d, want %d; body %s",
			deleted.StatusCode(),
			http.StatusNoContent,
			deleted.Body,
		)
	}

	client.SetAccountCurrency(refs.CheckingAccountID, nil)
	request.Fqn = "RecurringCurrency:Materialization"
	created = createRecurringDefinition(t, client, request)
	eur := "EUR"
	updated = client.SetAccountCurrency(refs.CheckingAccountID, &eur)
	if updated.Currency == nil || *updated.Currency != eur {
		t.Fatalf("currency change matching recurring definition = %v, want EUR", updated.Currency)
	}
	confirmNextRecurringDefinition(t, client, created.JSON201.RecurringDefinitionId)
}

func TestRecurringDefinitionTemplateSeedAndDeleteGuards(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "RecurringSeed")
	template := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "RecurringSeed:Template",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				AccountId: &refs.CheckingAccountID,
				MemberId:  &refs.MemberID,
				Currency:  recurringStringPtr("USD"),
				Amount:    recurringStringPtr("-20.00000000"),
				TagIds:    &[]int64{refs.TagID},
				Memo:      recurringStringPtr("seed debit"),
			},
			{
				AccountId:  &refs.MerchantAccountID,
				MemberId:   &refs.MemberID,
				Currency:   recurringStringPtr("USD"),
				Amount:     recurringStringPtr("20.00000000"),
				CategoryId: apptest.Int64Ptr(refs.CategoryID),
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
			{
				MemberId:   nullable.NewNullNullable[int64](),
				CategoryId: nullable.NewNullNullable[int64](),
				Memo:       nullable.NewNullNullable[string](),
			},
			{
				AccountId:  &refs.CheckingAccountID,
				MemberId:   nullable.NewNullNullable[int64](),
				CategoryId: nullable.NewNullNullable[int64](),
				Memo:       nullable.NewNullNullable[string](),
			},
		},
	}
	cleared := createRecurringDefinition(t, client, clearRequest)
	for _, record := range cleared.JSON201.Records {
		if record.MemberId != nil || record.CategoryId != nil || record.Memo != nil {
			t.Fatalf("template nullable override record = %+v, want cleared member_id, category_id, and memo", record)
		}
	}
	if cleared.JSON201.TransactionClass != httpclient.TransactionClassTransfer {
		t.Fatalf("cleared template transaction_class = %q, want %q", cleared.JSON201.TransactionClass, httpclient.TransactionClassTransfer)
	}
	assertDisplayAmountsEqual(t, "cleared template display amounts", cleared.JSON201.DisplayAmounts, []httpclient.DisplayAmount{
		{Amount: "20.00000000", Currency: "USD"},
	})

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
	client := newSharedClient(t)
	now := client.Now()
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

	expectedFilter := "lifecycle:expected"
	expectedTransactions, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &expectedFilter})
	requireNoTransportError(t, "expected transaction list", err)
	if expectedTransactions.StatusCode() != http.StatusOK {
		t.Fatalf("expected transaction list status = %d, want %d; body %s", expectedTransactions.StatusCode(), http.StatusOK, expectedTransactions.Body)
	}
	assertSameInt64Set(t, transactionIDs(expectedTransactions.JSON200.Transactions), generatedIDs)
	for _, transaction := range expectedTransactions.JSON200.Transactions {
		if transaction.RecurringOccurrenceId == nil {
			t.Fatalf("transaction %d recurring_occurrence_id = nil", transaction.TransactionId)
		}
		if len(transaction.Records) != 2 {
			t.Fatalf("transaction %d record count = %d, want 2", transaction.TransactionId, len(transaction.Records))
		}
		for _, record := range transaction.Records {
			if record.LifecycleStatus != httpclient.TransactionLifecycleStatusExpected || record.Source != httpclient.RecurringTemplate || record.Settlement != nil {
				t.Fatalf("generated record lifecycle/source/settlement = %q/%q/%v, want expected/recurring_template/nil", record.LifecycleStatus, record.Source, record.Settlement)
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

	deleted, err := client.REST().DeleteRecurringDefinitionWithResponse(context.Background(), definition.JSON201.RecurringDefinitionId)
	requireNoTransportError(t, "delete recurring definition with expected occurrences", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete recurring definition status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	afterCancel := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId,
	})
	if len(afterCancel.JSON200.RecurringOccurrences) != len(first.JSON200.RecurringOccurrences) {
		t.Fatalf("cancelled-definition occurrences = %+v, want %d retained occurrences", afterCancel.JSON200.RecurringOccurrences, len(first.JSON200.RecurringOccurrences))
	}
	for _, occurrence := range afterCancel.JSON200.RecurringOccurrences {
		if occurrence.RecurringDefinitionFqn != definition.JSON201.Fqn {
			t.Fatalf("cancelled-definition occurrence fqn = %q, want %q", occurrence.RecurringDefinitionFqn, definition.JSON201.Fqn)
		}
		if occurrence.RecurringDefinitionActive {
			t.Fatalf("cancelled-definition occurrence active = true, want false")
		}
	}
	confirmed := confirmRecurringOccurrence(t, client, afterCancel.JSON200.RecurringOccurrences[0].RecurringOccurrenceId)
	assertReviewedOccurrence(t, *confirmed.JSON200, httpclient.RecurringOccurrenceStatusConfirmed)
	if confirmed.JSON200.RecurringDefinitionFqn != definition.JSON201.Fqn {
		t.Fatalf("confirmed cancelled-definition occurrence fqn = %q, want %q", confirmed.JSON200.RecurringDefinitionFqn, definition.JSON201.Fqn)
	}
}

func TestFutureTransactionPositionProjectsExpectedOccurrencesWithoutMaterializingBoundary(t *testing.T) {
	client := newSharedClient(t)
	today := civilDateOnly(client.Now())
	futureDate := formatDate(today.AddDate(2, 0, 0))
	anchorDate := apptest.Date(futureDate)

	transactionRefs := createTransactionRefs(t, client)
	futureTransaction := createTransactionForDate(t, client, transactionRefs, futureDate, "Future active transaction")
	recurringRefs := createRecurringDefinitionRefs(t, client, "RecurringFuturePosition")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringFuturePosition:Monthly",
		recurringRefs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "MONTH"),
		futureDate,
	))

	beforeFuturePosition := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId,
	})
	assertRecurringOccurrences(t, beforeFuturePosition.JSON200.RecurringOccurrences, definition.JSON201.RecurringDefinitionId, nil)

	limit := 50
	allLifecycles := "(lifecycle:active or lifecycle:expected or lifecycle:cancelled)"
	anchored, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     &allLifecycles,
		Limit:      &limit,
	})
	requireNoTransportError(t, "future-position transaction list", err)
	if anchored.StatusCode() != http.StatusOK {
		t.Fatalf("future-position transaction list status = %d, want %d; body %s", anchored.StatusCode(), http.StatusOK, anchored.Body)
	}
	if len(anchored.JSON200.Transactions) != 2 {
		t.Fatalf("future-position transactions = %+v, want active and projected rows", anchored.JSON200.Transactions)
	}
	if anchored.JSON200.Offset != 0 || anchored.JSON200.TotalCount != 2 {
		t.Fatalf("future-position transaction position = %d/%d, want 0/2", anchored.JSON200.Offset, anchored.JSON200.TotalCount)
	}
	if anchored.JSON200.Transactions[0].TransactionId != futureTransaction.JSON201.TransactionId || anchored.JSON200.Transactions[1].RecurringProjectionDefinitionId == nil {
		t.Fatalf("future-position transaction order = %+v, want persisted row before same-date projection", anchored.JSON200.Transactions)
	}
	var projection *httpclient.Transaction
	var active *httpclient.Transaction
	for index := range anchored.JSON200.Transactions {
		transaction := &anchored.JSON200.Transactions[index]
		if transaction.RecurringProjectionDefinitionId != nil {
			projection = transaction
		} else if transaction.TransactionId == futureTransaction.JSON201.TransactionId {
			active = transaction
		}
	}
	if active == nil || projection == nil {
		t.Fatalf("future-position transactions = %+v, want active transaction %d and recurring projection", anchored.JSON200.Transactions, futureTransaction.JSON201.TransactionId)
	}
	if projection.TransactionId >= 0 || projection.RecurringOccurrenceId != nil || projection.RecurringProjectionDefinitionId == nil || *projection.RecurringProjectionDefinitionId != definition.JSON201.RecurringDefinitionId || projection.LifecycleStatus != httpclient.TransactionLifecycleStatusExpected {
		t.Fatalf("recurring projection = %+v, want read-only expected projection for definition %d", projection, definition.JSON201.RecurringDefinitionId)
	}
	for _, record := range projection.Records {
		if record.AmountUsd != nil {
			t.Fatalf("projected record amount_usd = %v, want nil for unknowable future rate", record.AmountUsd)
		}
	}

	pageLimit := 1
	projectionOffset := 1
	projectionPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     &allLifecycles,
		Limit:      &pageLimit,
		Offset:     &projectionOffset,
	})
	requireNoTransportError(t, "future-position projection page", err)
	if projectionPage.StatusCode() != http.StatusOK {
		t.Fatalf("future-position projection page status = %d, want %d; body %s", projectionPage.StatusCode(), http.StatusOK, projectionPage.Body)
	}
	if projectionPage.JSON200.Offset != projectionOffset || projectionPage.JSON200.TotalCount != 2 || len(projectionPage.JSON200.Transactions) != 1 || projectionPage.JSON200.Transactions[0].RecurringProjectionDefinitionId == nil {
		t.Fatalf("future-position projection page = %+v, want offset 1 of 2 with projection", projectionPage.JSON200)
	}

	expectedLifecycle := "lifecycle:expected"
	expectedOnly, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     &expectedLifecycle,
		Limit:      &limit,
	})
	requireNoTransportError(t, "future-position expected transaction list", err)
	if expectedOnly.StatusCode() != http.StatusOK {
		t.Fatalf("future-position expected transaction list status = %d, want %d; body %s", expectedOnly.StatusCode(), http.StatusOK, expectedOnly.Body)
	}
	if len(expectedOnly.JSON200.Transactions) != 1 || expectedOnly.JSON200.Transactions[0].RecurringProjectionDefinitionId == nil {
		t.Fatalf("future-position expected transactions = %+v, want only recurring projection", expectedOnly.JSON200.Transactions)
	}

	spendClasses := []httpclient.TransactionClass{httpclient.TransactionClassSpend}
	matchingClassFilter := "class:spend and lifecycle:expected"
	matchingClass, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate:       &anchorDate,
		Filter:           &matchingClassFilter,
		Limit:            &limit,
		TransactionClass: &spendClasses,
	})
	requireNoTransportError(t, "future-position matching transaction classes", err)
	if matchingClass.StatusCode() != http.StatusOK || matchingClass.JSON200 == nil || matchingClass.JSON200.TotalCount != 1 || len(matchingClass.JSON200.Transactions) != 1 || matchingClass.JSON200.Transactions[0].RecurringProjectionDefinitionId == nil {
		t.Fatalf("future-position matching transaction classes = %d/%+v, want only recurring projection", matchingClass.StatusCode(), matchingClass.JSON200)
	}

	dslAllUSD, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     apptest.StringPtr("currency:USD"),
		Limit:      &limit,
	})
	requireNoTransportError(t, "future-position USD DSL transaction list", err)
	if dslAllUSD.StatusCode() != http.StatusOK || len(dslAllUSD.JSON200.Transactions) != 2 {
		t.Fatalf("future-position USD DSL transactions = %d/%+v, want active and projected rows", dslAllUSD.StatusCode(), dslAllUSD.JSON200)
	}

	for _, tc := range []struct {
		name       string
		expression string
		want       bool
	}{
		{name: "tag negation", expression: `lifecycle:expected and not tag:"RecurringFuturePosition:Tag"`},
		{name: "member", expression: `lifecycle:expected and member:"RecurringFuturePosition Member"`, want: true},
		{name: "account", expression: `lifecycle:expected and account:"checking:RecurringFuturePosition:Primary"`, want: true},
		{name: "account scope", expression: `lifecycle:expected and account:"checking:RecurringFuturePosition:*"`, want: true},
		{name: "category scope", expression: `lifecycle:expected and category:"RecurringFuturePosition:*"`, want: true},
		{name: "tag scope", expression: `lifecycle:expected and tag:"RecurringFuturePosition:*"`, want: true},
		{name: "all accounts scope", expression: `lifecycle:expected and account:*`, want: true},
		{name: "all categories scope", expression: `lifecycle:expected and category:*`, want: true},
		{name: "all tags scope", expression: `lifecycle:expected and tag:*`, want: true},
		{name: "amount", expression: `lifecycle:expected and amount < -9`, want: true},
		{name: "initiated date", expression: fmt.Sprintf("lifecycle:expected and initiated=%s", futureDate), want: true},
		{name: "initiated date exclusion", expression: fmt.Sprintf("lifecycle:expected and initiated<%s", futureDate)},
		{name: "record role", expression: `lifecycle:expected and role:expense`, want: true},
		{name: "transaction shape", expression: `lifecycle:expected and shape:spend`, want: true},
	} {
		t.Run("projected filter "+tc.name, func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
				AnchorDate: &anchorDate,
				Filter:     &tc.expression,
				Limit:      &limit,
			})
			requireNoTransportError(t, "future-position projected filter", err)
			if response.StatusCode() != http.StatusOK || response.JSON200 == nil {
				t.Fatalf("future-position projected filter = %d/%+v, want successful response", response.StatusCode(), response.JSON200)
			}
			if !tc.want {
				if response.JSON200.TotalCount != 0 || len(response.JSON200.Transactions) != 0 {
					t.Fatalf("future-position projected filter = %+v, want no rows", response.JSON200)
				}
				return
			}
			if response.JSON200.TotalCount != 1 || len(response.JSON200.Transactions) != 1 || response.JSON200.Transactions[0].RecurringProjectionDefinitionId == nil {
				t.Fatalf("future-position projected filter = %+v, want only recurring projection", response.JSON200)
			}
		})
	}

	dslWithoutExpected, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     apptest.StringPtr("not lifecycle:expected"),
		Limit:      &limit,
	})
	requireNoTransportError(t, "future-position non-expected DSL transaction list", err)
	if dslWithoutExpected.StatusCode() != http.StatusOK || len(dslWithoutExpected.JSON200.Transactions) != 1 || dslWithoutExpected.JSON200.Transactions[0].TransactionId != futureTransaction.JSON201.TransactionId {
		t.Fatalf("future-position non-expected DSL transactions = %d/%+v, want active transaction %d", dslWithoutExpected.StatusCode(), dslWithoutExpected.JSON200, futureTransaction.JSON201.TransactionId)
	}

	withoutLifecycle, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Limit:      &limit,
	})
	requireNoTransportError(t, "future-position transaction list without lifecycle", err)
	if withoutLifecycle.StatusCode() != http.StatusOK || len(withoutLifecycle.JSON200.Transactions) != 1 || withoutLifecycle.JSON200.Transactions[0].TransactionId != futureTransaction.JSON201.TransactionId || withoutLifecycle.JSON200.Transactions[0].RecurringProjectionDefinitionId != nil {
		t.Fatalf("future-position transactions without lifecycle = %d/%+v, want only active transaction %d", withoutLifecycle.StatusCode(), withoutLifecycle.JSON200, futureTransaction.JSON201.TransactionId)
	}

	activeLifecycle := "lifecycle:active"
	activeOnly, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     &activeLifecycle,
		Limit:      &limit,
	})
	requireNoTransportError(t, "future-position active transaction list", err)
	if activeOnly.StatusCode() != http.StatusOK || len(activeOnly.JSON200.Transactions) != 1 || activeOnly.JSON200.Transactions[0].TransactionId != futureTransaction.JSON201.TransactionId || activeOnly.JSON200.Transactions[0].RecurringProjectionDefinitionId != nil {
		t.Fatalf("future-position active transactions = %d/%+v, want only active transaction %d", activeOnly.StatusCode(), activeOnly.JSON200, futureTransaction.JSON201.TransactionId)
	}

	afterFuturePosition := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId,
	})
	assertRecurringOccurrences(t, afterFuturePosition.JSON200.RecurringOccurrences, definition.JSON201.RecurringDefinitionId, nil)

	posted := "settlement:posted"
	postedOnly, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     &posted,
		Limit:      &limit,
	})
	requireNoTransportError(t, "future-position posted transaction list", err)
	if postedOnly.StatusCode() != http.StatusOK || len(postedOnly.JSON200.Transactions) != 1 || postedOnly.JSON200.Transactions[0].TransactionId != futureTransaction.JSON201.TransactionId {
		t.Fatalf("future-position posted transactions = %d/%+v, want only active transaction %d", postedOnly.StatusCode(), postedOnly.JSON200, futureTransaction.JSON201.TransactionId)
	}

	dedupRefs := createRecurringDefinitionRefs(t, client, "RecurringProjectionDedup")
	dedupDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringProjectionDedup:Daily",
		dedupRefs,
		"-12.00000000",
		"12.00000000",
		intervalRule(1, "DAY"),
		formatDate(today.AddDate(0, 0, -2)),
	))
	dueOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &dedupDefinition.JSON201.RecurringDefinitionId,
	})
	if len(dueOccurrences.JSON200.RecurringOccurrences) != 3 {
		t.Fatalf("past-anchored due occurrences = %+v, want three slots through today", dueOccurrences.JSON200.RecurringOccurrences)
	}
	confirmedFuture := confirmNextRecurringDefinition(t, client, dedupDefinition.JSON201.RecurringDefinitionId)
	tomorrow := today.AddDate(0, 0, 1)
	if got := confirmedFuture.JSON200.ScheduledDate.Time; !got.Equal(tomorrow) {
		t.Fatalf("confirmed future occurrence date = %s, want %s", formatDate(got), formatDate(tomorrow))
	}

	through := apptest.Date(formatDate(today.AddDate(0, 0, 2)))
	dedupFilter := `category:"` + dedupRefs.CategoryFQN + `" and ` + allLifecycles
	deduplicated, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &through,
		Filter:     &dedupFilter,
		Limit:      &limit,
	})
	requireNoTransportError(t, "past-anchored deduplicated projection list", err)
	if deduplicated.StatusCode() != http.StatusOK {
		t.Fatalf("past-anchored deduplicated projection list status = %d, want %d; body %s", deduplicated.StatusCode(), http.StatusOK, deduplicated.Body)
	}
	projectionCount := 0
	confirmedCount := 0
	for _, transaction := range deduplicated.JSON200.Transactions {
		if transaction.TransactionId == *confirmedFuture.JSON200.GeneratedTransactionId {
			confirmedCount++
		}
		if transaction.RecurringProjectionDefinitionId == nil {
			continue
		}
		projectionCount++
		if got := transaction.InitiatedDate.Time; !got.Equal(today.AddDate(0, 0, 2)) {
			t.Fatalf("projected initiated date = %s, want only unoccupied day after confirmed future slot", formatDate(got))
		}
	}
	if projectionCount != 1 || confirmedCount != 1 {
		t.Fatalf("past-anchored projection counts = projection:%d confirmed:%d, want 1/1; transactions = %+v", projectionCount, confirmedCount, deduplicated.JSON200.Transactions)
	}
	afterDeduplicatedRead := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &dedupDefinition.JSON201.RecurringDefinitionId,
	})
	if len(afterDeduplicatedRead.JSON200.RecurringOccurrences) != 4 {
		t.Fatalf("occurrences after deduplicated projection read = %+v, want three due and one confirmed future slot", afterDeduplicatedRead.JSON200.RecurringOccurrences)
	}
}

func TestFutureTransactionPositionPagesPersistedRowsWithoutMatchingProjectionsBoundary(t *testing.T) {
	client := newSharedClient(t)
	futureDate := formatDate(civilDateOnly(client.Now()).AddDate(2, 0, 0))
	anchorDate := apptest.Date(futureDate)
	refs := createTransactionRefs(t, client)
	transactionIDs := make([]int64, 0, 26)
	for index := range 26 {
		created := createTransactionForDate(t, client, refs, futureDate, fmt.Sprintf("Future persisted page %d", index))
		transactionIDs = append(transactionIDs, created.JSON201.TransactionId)
	}

	limit := 25
	offset := 25
	filter := `category:"Food:Restaurants" and (lifecycle:active or lifecycle:expected or lifecycle:cancelled)`
	secondPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     &filter,
		Limit:      &limit,
		Offset:     &offset,
	})
	requireNoTransportError(t, "second future persisted page", err)
	if secondPage.StatusCode() != http.StatusOK {
		t.Fatalf("second future persisted page status = %d, want %d; body %s", secondPage.StatusCode(), http.StatusOK, secondPage.Body)
	}
	if secondPage.JSON200.Offset != offset || secondPage.JSON200.TotalCount != int64(len(transactionIDs)) {
		t.Fatalf("second future persisted page position = %d/%d, want %d/%d", secondPage.JSON200.Offset, secondPage.JSON200.TotalCount, offset, len(transactionIDs))
	}
	if len(secondPage.JSON200.Transactions) != 1 || secondPage.JSON200.Transactions[0].TransactionId != transactionIDs[0] {
		t.Fatalf("second future persisted page = %+v, want oldest transaction %d", secondPage.JSON200.Transactions, transactionIDs[0])
	}
}

func TestFutureTransactionPositionAcceptsEarlierAbsoluteOffsetsBoundary(t *testing.T) {
	client := newSharedClient(t)
	today := civilDateOnly(client.Now())
	anchor := today.AddDate(2, 0, 0)
	anchorDate := apptest.Date(formatDate(anchor))
	refs := createRecurringDefinitionRefs(t, client, "RecurringProjectionPreviousPage")
	createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringProjectionPreviousPage:Yearly",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "YEAR"),
		formatDate(anchor),
	))
	transactionRefs := transactionRefs{
		CheckingAccountId: refs.CheckingAccountID,
		MerchantAccountId: refs.MerchantAccountID,
		CategoryId:        refs.CategoryID,
		TagId:             refs.TagID,
		MemberId:          refs.MemberID,
	}
	newerDate := formatDate(anchor.AddDate(0, 0, 1))
	newerTransactionIDs := make([]int64, 0, 26)
	for index := range 26 {
		created := createTransactionForDate(t, client, transactionRefs, newerDate, fmt.Sprintf("Future newer transaction %d", index))
		newerTransactionIDs = append(newerTransactionIDs, created.JSON201.TransactionId)
	}

	limit := 25
	filter := `category:"` + refs.CategoryFQN + `" and (lifecycle:active or lifecycle:expected or lifecycle:cancelled)`
	landingPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     &filter,
		Limit:      &limit,
	})
	requireNoTransportError(t, "future projection landing page", err)
	if landingPage.StatusCode() != http.StatusOK || landingPage.JSON200.Offset != 25 {
		t.Fatalf("future projection landing page = %d/%+v, want offset 25", landingPage.StatusCode(), landingPage.JSON200)
	}

	offset := 0
	previousPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     &filter,
		Limit:      &limit,
		Offset:     &offset,
	})
	requireNoTransportError(t, "future projection previous page", err)
	if previousPage.StatusCode() != http.StatusOK {
		t.Fatalf("future projection previous page status = %d, want %d; body %s", previousPage.StatusCode(), http.StatusOK, previousPage.Body)
	}
	if previousPage.JSON200.Offset != 0 || len(previousPage.JSON200.Transactions) != limit {
		t.Fatalf("future projection previous page = %+v, want offset 0 with %d rows", previousPage.JSON200, limit)
	}
	if previousPage.JSON200.Transactions[0].TransactionId != newerTransactionIDs[len(newerTransactionIDs)-1] {
		t.Fatalf("future projection previous page first transaction = %d, want %d", previousPage.JSON200.Transactions[0].TransactionId, newerTransactionIDs[len(newerTransactionIDs)-1])
	}
}

func TestFutureTransactionPositionRejectsMoreThanTenThousandProjectionsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "RecurringProjectionLimit")
	today := formatDate(civilDateOnly(client.Now()))
	createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringProjectionLimit:Daily",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "DAY"),
		today,
	))
	farFuture := apptest.Date("9999-12-31")
	active := "lifecycle:active"
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &farFuture,
		Filter:     &active,
	})
	requireNoTransportError(t, "future transaction projection over request limit", err)
	if response.StatusCode() != http.StatusBadRequest || response.JSON400 == nil || response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("future transaction projection over request limit = %d/%+v, want invalid-request response", response.StatusCode(), response.JSON400)
	}
}

func TestRecurringCatchUpPreservesDefinitionRecordOrderBoundary(t *testing.T) {
	client := newSharedClient(t)
	now := client.Now()
	firstRefs := createRecurringDefinitionRefs(t, client, "RecurringRecordOrderFirst")
	secondRefs := createRecurringDefinitionRefs(t, client, "RecurringRecordOrderSecond")
	const occurrencesPerDefinition = 1000
	anchor := formatDate(civilDateOnly(now).AddDate(0, 0, -(occurrencesPerDefinition - 1)))
	firstRequest := recurringDefinitionRequest(
		"RecurringRecordOrder:First",
		firstRefs,
		"-10.00000000",
		"6.00000000",
		intervalRule(1, "DAY"),
		anchor,
	)
	firstRecords := append([]httpclient.RecurringDefinitionRecordRequest{}, (*firstRequest.Records)...)
	firstRecords[0].Memo = nullable.NewNullableWithValue("first debit")
	firstRecords[1].Memo = nullable.NewNullableWithValue("first credit")
	third := firstRecords[1]
	third.Amount = recurringStringPtr("4.00000000")
	third.Memo = nullable.NewNullableWithValue("first split")
	firstRecords = append(firstRecords, third)
	firstRequest.Records = &firstRecords
	firstDefinition := createRecurringDefinition(t, client, firstRequest)

	secondRequest := recurringDefinitionRequest(
		"RecurringRecordOrder:Second",
		secondRefs,
		"-20.00000000",
		"20.00000000",
		intervalRule(1, "DAY"),
		anchor,
	)
	secondRecords := append([]httpclient.RecurringDefinitionRecordRequest{}, (*secondRequest.Records)...)
	secondRecords[0].Memo = nullable.NewNullableWithValue("second debit")
	secondRecords[1].Memo = nullable.NewNullableWithValue("second credit")
	secondRequest.Records = &secondRecords
	secondDefinition := createRecurringDefinition(t, client, secondRequest)

	listRecurringOccurrences(t, client, nil)
	type recordShape struct {
		accountID int64
		amount    string
		memo      string
	}
	definitions := []struct {
		id      int64
		records []recordShape
	}{
		{
			id: firstDefinition.JSON201.RecurringDefinitionId,
			records: []recordShape{
				{accountID: firstRefs.CheckingAccountID, amount: "-10.00000000", memo: "first debit"},
				{accountID: firstRefs.MerchantAccountID, amount: "6.00000000", memo: "first credit"},
				{accountID: firstRefs.MerchantAccountID, amount: "4.00000000", memo: "first split"},
			},
		},
		{
			id: secondDefinition.JSON201.RecurringDefinitionId,
			records: []recordShape{
				{accountID: secondRefs.CheckingAccountID, amount: "-20.00000000", memo: "second debit"},
				{accountID: secondRefs.MerchantAccountID, amount: "20.00000000", memo: "second credit"},
			},
		},
	}

	const pageSize = 500
	wantRecordsByTransactionID := make(map[int64][]recordShape, occurrencesPerDefinition*len(definitions))
	for _, definition := range definitions {
		for offset := 0; offset < occurrencesPerDefinition; offset += pageSize {
			response := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
				RecurringDefinitionId: &definition.id,
				Limit:                 ptrTo(pageSize),
				Offset:                ptrTo(offset),
			})
			if response.JSON200.TotalCount != occurrencesPerDefinition {
				t.Fatalf("recurring definition %d occurrence count = %d, want %d", definition.id, response.JSON200.TotalCount, occurrencesPerDefinition)
			}
			for _, occurrence := range response.JSON200.RecurringOccurrences {
				if occurrence.GeneratedTransactionId == nil {
					t.Fatalf("occurrence %d generated_transaction_id = nil", occurrence.RecurringOccurrenceId)
				}
				wantRecordsByTransactionID[*occurrence.GeneratedTransactionId] = definition.records
			}
		}
	}

	expectedStatuses := "lifecycle:expected"
	for offset := 0; offset < len(wantRecordsByTransactionID); offset += pageSize {
		response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
			Filter: &expectedStatuses,
			Limit:  ptrTo(pageSize),
			Offset: ptrTo(offset),
		})
		requireNoTransportError(t, "list ordered recurring transactions", err)
		if response.StatusCode() != http.StatusOK {
			t.Fatalf("list ordered recurring transactions status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
		}
		if response.JSON200.TotalCount != int64(len(wantRecordsByTransactionID)) {
			t.Fatalf("ordered recurring transaction count = %d, want %d", response.JSON200.TotalCount, len(wantRecordsByTransactionID))
		}
		for _, transaction := range response.JSON200.Transactions {
			wantRecords, ok := wantRecordsByTransactionID[transaction.TransactionId]
			if !ok {
				t.Fatalf("unexpected recurring transaction %d", transaction.TransactionId)
			}
			if len(transaction.Records) != len(wantRecords) {
				t.Fatalf("transaction %d record count = %d, want %d", transaction.TransactionId, len(transaction.Records), len(wantRecords))
			}
			for index, wantRecord := range wantRecords {
				got := transaction.Records[index]
				if got.AccountId != wantRecord.accountID || got.Amount != wantRecord.amount || got.Memo == nil || *got.Memo != wantRecord.memo {
					t.Fatalf("transaction %d record at %d = %+v, want account %d amount %q memo %q in definition order", transaction.TransactionId, index, got, wantRecord.accountID, wantRecord.amount, wantRecord.memo)
				}
			}
		}
	}
}

func TestRecurringExpectedTransactionsRejectGenericMutationsBoundary(t *testing.T) {
	client := newSharedClient(t)
	now := client.Now()
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

	replaced, err := client.ReplaceTransactionRetainingRecords(
		context.Background(),
		transaction.JSON200,
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

	settled, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds:  selectedRecordIDs,
		Settlement: httpclient.SettlementStatusPending,
	})
	requireNoTransportError(t, "bulk settle generated expected transaction", err)
	assertInvalidRequestStatus(t, "bulk settle generated expected transaction", settled.StatusCode(), settled.JSON400, settled.Body)

	unreconciled := httpclient.Unreconciled
	reconciled, err := client.REST().BulkSetJournalRecordReconciliationWithResponse(context.Background(), httpclient.BulkSetRecordReconciliationRequest{
		RecordIds:            selectedRecordIDs,
		ReconciliationStatus: unreconciled,
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

	member := client.Scenario().Member("Recurring Generic Guard Member")
	memberSet, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{
		RecordIds: selectedRecordIDs,
		MemberId:  &member.MemberId,
	})
	requireNoTransportError(t, "bulk member generated expected transaction", err)
	assertInvalidRequestStatus(t, "bulk member generated expected transaction", memberSet.StatusCode(), memberSet.JSON400, memberSet.Body)

	reassigned, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: selectedRecordIDs,
		AccountId: refs.CheckingAccountID,
	})
	requireNoTransportError(t, "bulk account generated expected transaction", err)
	assertInvalidRequestStatus(t, "bulk account generated expected transaction", reassigned.StatusCode(), reassigned.JSON400, reassigned.Body)

	replacement := client.Scenario().AccountWithType("people:RecurringGenericGuard:Replacement", httpclient.WritableAccountTypeParty)
	accountReplaced, err := client.REST().BulkReplaceTransactionAccountWithResponse(context.Background(), httpclient.BulkReplaceTransactionAccountRequest{
		TransactionIds:       []int64{transactionID},
		SourceAccountId:      refs.CheckingAccountID,
		ReplacementAccountId: replacement.AccountId,
	})
	requireNoTransportError(t, "replace account on generated expected transaction", err)
	assertInvalidRequestStatus(t, "replace account on generated expected transaction", accountReplaced.StatusCode(), accountReplaced.JSON400, accountReplaced.Body)

	afterOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId})
	assertRecurringOccurrenceIDs(t, afterOccurrences.JSON200.RecurringOccurrences, []int64{occurrence.RecurringOccurrenceId})
	afterOccurrence := afterOccurrences.JSON200.RecurringOccurrences[0]
	if afterOccurrence.Status != httpclient.RecurringOccurrenceStatusExpected ||
		afterOccurrence.GeneratedTransactionId == nil ||
		*afterOccurrence.GeneratedTransactionId != transactionID ||
		afterOccurrence.ReviewedAt != nil {
		t.Fatalf("occurrence after rejected generic mutations = %+v, want expected with same generated transaction", afterOccurrence)
	}
	afterTransaction := getTransaction(t, client, transactionID)
	apptest.AssertTransactionLifecycle(t, afterTransaction.JSON200, httpclient.TransactionLifecycleStatusExpected)
	assertRecordIDs(t, afterTransaction.JSON200.Records, selectedRecordIDs)
	for _, record := range afterTransaction.JSON200.Records {
		if record.MemberId == nil || *record.MemberId != refs.MemberID {
			t.Fatalf("record %d member_id after rejected update = %v, want %d", record.RecordId, record.MemberId, refs.MemberID)
		}
	}
}

func TestRecurringOccurrenceDateRuleMaterializationBoundary(t *testing.T) {
	client := newSharedClient(t)
	now := client.Now()
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
	client := newSharedClient(t)
	now := client.Now()
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
	if occurrence.Status != httpclient.RecurringOccurrenceStatusExpected || occurrence.GeneratedTransactionId == nil || occurrence.ScheduledDate.Format("2006-01-02") != formatDate(today) {
		t.Fatalf("resume due-date occurrence = %+v, want expected generated occurrence for today", occurrence)
	}
}

func TestRecurringOccurrenceStatusFilterBoundary(t *testing.T) {
	client := newSharedClient(t)
	now := client.Now()
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

	assertRecurringOccurrenceStatusFilter(t, client, httpclient.RecurringOccurrenceStatusExpected, []int64{expectedID})
	assertRecurringOccurrenceStatusFilter(t, client, httpclient.RecurringOccurrenceStatusConfirmed, []int64{confirmedID})
	assertRecurringOccurrenceStatusFilter(t, client, httpclient.RecurringOccurrenceStatusDismissed, []int64{dismissedID})
	assertRecurringOccurrenceStatusFilter(t, client, httpclient.RecurringOccurrenceStatusDeferred, []int64{deferredID})
}

func TestRecurringOccurrenceConfirmAndDismissBoundary(t *testing.T) {
	client := newSharedClient(t)
	now := client.Now()
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
	expectedTransaction := getTransaction(t, client, *confirmOccurrences.JSON200.RecurringOccurrences[0].GeneratedTransactionId)
	assertRecordLifecycleDates(t, "expected recurring transaction", expectedTransaction.JSON200.Records, nil, nil)
	baseline := createTransaction(t, client, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date(formatDate(today)),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountID,
				Currency:             "USD",
				Amount:               "-1.00",
				Settlement:           apptest.PendingSettlement(),
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountID,
				Currency:             "USD",
				Amount:               "1.00",
				CategoryId:           apptest.Int64Ptr(refs.CategoryID),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	})
	baselineCancelled, err := client.REST().CancelTransactionWithResponse(context.Background(), baseline.JSON201.TransactionId)
	requireNoTransportError(t, "cancel recurring confirmation ordering baseline", err)
	if baselineCancelled.StatusCode() != http.StatusOK {
		t.Fatalf("cancel recurring confirmation ordering baseline status = %d, want %d; body %s", baselineCancelled.StatusCode(), http.StatusOK, baselineCancelled.Body)
	}
	confirmed := confirmRecurringOccurrence(t, client, confirmOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId)
	assertReviewedOccurrence(t, *confirmed.JSON200, httpclient.RecurringOccurrenceStatusConfirmed)
	assertRecurringActionStatus(t, "double confirm", confirmAgain(t, client, confirmed.JSON200.RecurringOccurrenceId), http.StatusBadRequest)
	assertRecurringActionStatus(t, "dismiss after confirm", dismissAgain(t, client, confirmed.JSON200.RecurringOccurrenceId), http.StatusBadRequest)

	confirmedTransaction := getTransaction(t, client, *confirmed.JSON200.GeneratedTransactionId)
	if !expectedTransaction.JSON200.UpdatedAt.Before(confirmedTransaction.JSON200.UpdatedAt) ||
		!baselineCancelled.JSON200.UpdatedAt.Before(confirmedTransaction.JSON200.UpdatedAt) {
		t.Fatalf("confirmed transaction updated_at = %s, want after materialization %s and baseline %s", confirmedTransaction.JSON200.UpdatedAt, expectedTransaction.JSON200.UpdatedAt, baselineCancelled.JSON200.UpdatedAt)
	}
	sortUpdated := httpclient.ListTransactionsParamsSortUpdatedAt
	sortDescending := httpclient.ListTransactionsParamsSortDirDesc
	lifecycleStatuses := "(lifecycle:active or lifecycle:cancelled)"
	defaultTransactions, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Filter:  &lifecycleStatuses,
		Sort:    &sortUpdated,
		SortDir: &sortDescending,
	})
	requireNoTransportError(t, "default confirmed transaction list", err)
	assertTransactionListResponse(t, "default confirmed transaction list", defaultTransactions, []int64{*confirmed.JSON200.GeneratedTransactionId, baseline.JSON201.TransactionId}, 2)
	for _, record := range defaultTransactions.JSON200.Transactions[0].Records {
		if record.LifecycleStatus != httpclient.TransactionLifecycleStatusActive || record.Source != httpclient.RecurringTemplate {
			t.Fatalf("confirmed record lifecycle/source = %q/%q, want active/recurring_template", record.LifecycleStatus, record.Source)
		}
		if record.Settlement != nil {
			if *record.Settlement != httpclient.SettlementStatusPosted || record.PendingDate != nil || record.PostedDate == nil {
				t.Fatalf("confirmed balance record settlement/pending_date/posted_date = %v/%v/%v", record.Settlement, record.PendingDate, record.PostedDate)
			}
			if !record.PostedDate.Equal(client.Now()) {
				t.Fatalf("confirmed recurring posted_date = %v, want %s", record.PostedDate, client.Now())
			}
		}
	}

	replacementRequest := httpclient.CreateTransactionRequest{
		InitiatedDate: confirmedTransaction.JSON200.InitiatedDate,
		Records:       make([]httpclient.CreateJournalRecordRequest, 0, len(confirmedTransaction.JSON200.Records)),
	}
	replacementMemo := "confirmed recurring replacement"
	for _, record := range confirmedTransaction.JSON200.Records {
		var settlement *httpclient.SettlementIntent
		if record.Settlement != nil {
			settlement = &httpclient.SettlementIntent{
				Status:      *record.Settlement,
				PendingDate: record.PendingDate,
				PostedDate:  record.PostedDate,
			}
		}
		tagIDs := append([]int64{}, record.TagIds...)
		replacementRequest.Records = append(replacementRequest.Records, httpclient.CreateJournalRecordRequest{
			AccountId:            record.AccountId,
			Amount:               record.Amount,
			AmountUsd:            record.AmountUsd,
			CategoryId:           record.CategoryId,
			Currency:             record.Currency,
			MemberId:             record.MemberId,
			Memo:                 &replacementMemo,
			ReconciliationStatus: record.ReconciliationStatus,
			Settlement:           settlement,
			Source:               httpclient.WritableSourceManual,
			TagIds:               &tagIDs,
		})
	}
	replacedConfirmed, err := client.ReplaceTransactionRetainingRecords(context.Background(), confirmedTransaction.JSON200, replacementRequest)
	requireNoTransportError(t, "replace confirmed recurring transaction", err)
	if replacedConfirmed.StatusCode() != http.StatusOK {
		t.Fatalf("replace confirmed recurring transaction status = %d, want %d; body %s", replacedConfirmed.StatusCode(), http.StatusOK, replacedConfirmed.Body)
	}
	for index, record := range replacedConfirmed.JSON200.Records {
		if record.RecordId != confirmedTransaction.JSON200.Records[index].RecordId || record.Source != httpclient.RecurringTemplate {
			t.Fatalf("replaced confirmed record identity/source = %d/%q, want %d/recurring_template", record.RecordId, record.Source, confirmedTransaction.JSON200.Records[index].RecordId)
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
	assertReviewedOccurrence(t, *dismissed.JSON200, httpclient.RecurringOccurrenceStatusDismissed)
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

func TestRecurringPendingConfirmationBoundary(t *testing.T) {
	now := apptest.Timestamp("2026-08-02T07:01:51Z")
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(now)))
	refs := createRecurringDefinitionRefs(t, client, "RecurringPending")
	today := civilDateOnly(now)

	due := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringPending:Due",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	occurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &due.JSON201.RecurringDefinitionId})
	confirmed, err := client.REST().ConfirmRecurringOccurrenceWithResponse(
		context.Background(),
		occurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId,
		recurringOccurrenceConfirmRequest(*apptest.PendingSettlement(), nil),
	)
	requireNoTransportError(t, "confirm recurring occurrence pending", err)
	if confirmed.StatusCode() != http.StatusOK {
		t.Fatalf("confirm pending occurrence status = %d, want %d; body %s", confirmed.StatusCode(), http.StatusOK, confirmed.Body)
	}
	assertPendingRecurringTransaction(t, getTransaction(t, client, *confirmed.JSON200.GeneratedTransactionId), now)

	next := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringPending:Next",
		refs,
		"-8.00000000",
		"8.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today.AddDate(0, 0, 7)),
	))
	confirmedNext, err := client.REST().ConfirmNextRecurringDefinitionWithResponse(
		context.Background(),
		next.JSON201.RecurringDefinitionId,
		*apptest.PendingSettlement(),
	)
	requireNoTransportError(t, "confirm next recurring definition pending", err)
	if confirmedNext.StatusCode() != http.StatusOK {
		t.Fatalf("confirm next pending status = %d, want %d; body %s", confirmedNext.StatusCode(), http.StatusOK, confirmedNext.Body)
	}
	assertPendingRecurringTransaction(t, getTransaction(t, client, *confirmedNext.JSON200.GeneratedTransactionId), now)
}

func TestRecurringOccurrenceActualDateConfirmationBoundary(t *testing.T) {
	now := apptest.Timestamp("2026-08-14T12:00:00Z")
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(now)))
	today := civilDateOnly(now)
	refs := createRecurringDefinitionRefs(t, client, "RecurringActualDate")
	eur := "EUR"
	client.SetAccountCurrency(refs.CheckingAccountID, &eur)
	var actualDateRateID int64
	for _, rate := range []struct {
		value string
		date  string
	}{
		{value: "1.00000000", date: "2026-08-01T00:00:00Z"},
		{value: "2.00000000", date: "2026-08-10T00:00:00Z"},
	} {
		created, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
			FromCurrency:  "USD",
			ToCurrency:    "EUR",
			Rate:          rate.value,
			EffectiveDate: apptest.Timestamp(rate.date),
		})
		requireNoTransportError(t, "create actual-date exchange rate", err)
		if created.StatusCode() != http.StatusCreated {
			t.Fatalf("create actual-date exchange rate status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
		}
		if rate.date == "2026-08-10T00:00:00Z" {
			actualDateRateID = created.JSON201.ExchangeRateId
		}
	}

	actualDefinitionRequest := recurringDefinitionRequest(
		"RecurringActualDate:Dated",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "MONTH"),
		"2026-08-01",
	)
	for index := range *actualDefinitionRequest.Records {
		(*actualDefinitionRequest.Records)[index].Currency = recurringStringPtr("EUR")
	}
	actualDefinition := createRecurringDefinition(t, client, actualDefinitionRequest)
	actualOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &actualDefinition.JSON201.RecurringDefinitionId})
	actualDate := apptest.Date("2026-08-10")
	confirmed, err := client.REST().ConfirmRecurringOccurrenceWithResponse(
		context.Background(),
		actualOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId,
		recurringOccurrenceConfirmRequest(*apptest.PostedSettlement(), &actualDate),
	)
	requireNoTransportError(t, "confirm recurring occurrence with actual date", err)
	if confirmed.StatusCode() != http.StatusOK {
		t.Fatalf("actual-date confirmation status = %d, want %d; body %s", confirmed.StatusCode(), http.StatusOK, confirmed.Body)
	}
	actualTransaction := getTransaction(t, client, *confirmed.JSON200.GeneratedTransactionId)
	if got := actualTransaction.JSON200.InitiatedDate.Format("2006-01-02"); got != "2026-08-10" {
		t.Fatalf("actual-date confirmed initiated_date = %s, want 2026-08-10", got)
	}
	assertRecordLifecycleDates(t, "actual-date confirmed transaction", actualTransaction.JSON200.Records, nil, apptest.TimestampPtr("2026-08-10T23:59:59Z"))
	assertTransactionCheckingAmountUSD(t, actualTransaction.JSON200.Records, refs.CheckingAccountID, "-5.00000000")
	actualDefinitionAfter := getRecurringDefinition(t, client, actualDefinition.JSON201.RecurringDefinitionId)
	assertDatePtr(t, actualDefinitionAfter.JSON200.NextDueDate, "2026-09-01")

	preservedRequest := recurringDefinitionRequest(
		"RecurringActualDate:DefaultValuation",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "MONTH"),
		"2026-08-10",
	)
	for index := range *preservedRequest.Records {
		(*preservedRequest.Records)[index].Currency = recurringStringPtr("EUR")
	}
	preservedDefinition := createRecurringDefinition(t, client, preservedRequest)
	preservedOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &preservedDefinition.JSON201.RecurringDefinitionId})
	preservedTransactionID := *preservedOccurrences.JSON200.RecurringOccurrences[0].GeneratedTransactionId
	assertTransactionCheckingAmountUSD(t, getTransaction(t, client, preservedTransactionID).JSON200.Records, refs.CheckingAccountID, "-5.00000000")
	deletedRate, err := client.REST().DeleteExchangeRateWithResponse(context.Background(), actualDateRateID)
	requireNoTransportError(t, "delete materialization exchange rate", err)
	if deletedRate.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete materialization exchange rate status = %d, want %d; body %s", deletedRate.StatusCode(), http.StatusNoContent, deletedRate.Body)
	}
	confirmRecurringOccurrence(t, client, preservedOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId)
	assertTransactionCheckingAmountUSD(t, getTransaction(t, client, preservedTransactionID).JSON200.Records, refs.CheckingAccountID, "-5.00000000")

	defaultRefs := createRecurringDefinitionRefs(t, client, "RecurringActualDateDefaults")
	defaultDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringActualDate:Default",
		defaultRefs,
		"-11.00000000",
		"11.00000000",
		intervalRule(1, "MONTH"),
		"2026-08-02",
	))
	defaultOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &defaultDefinition.JSON201.RecurringDefinitionId})
	defaultConfirmed := confirmRecurringOccurrence(t, client, defaultOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId)
	defaultTransaction := getTransaction(t, client, *defaultConfirmed.JSON200.GeneratedTransactionId)
	if got := defaultTransaction.JSON200.InitiatedDate.Format("2006-01-02"); got != "2026-08-02" {
		t.Fatalf("default confirmed initiated_date = %s, want scheduled date 2026-08-02", got)
	}

	futureDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringActualDate:FutureRejected",
		defaultRefs,
		"-12.00000000",
		"12.00000000",
		intervalRule(1, "MONTH"),
		formatDate(today),
	))
	futureOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &futureDefinition.JSON201.RecurringDefinitionId})
	futureDate := apptest.Date(formatDate(today.AddDate(0, 0, 1)))
	rejected, err := client.REST().ConfirmRecurringOccurrenceWithResponse(
		context.Background(),
		futureOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId,
		recurringOccurrenceConfirmRequest(*apptest.PostedSettlement(), &futureDate),
	)
	requireNoTransportError(t, "confirm recurring occurrence with future actual date", err)
	if rejected.StatusCode() != http.StatusBadRequest || rejected.JSON400 == nil || rejected.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("future actual-date confirmation = status:%d error:%+v, want 400 invalid_request; body %s", rejected.StatusCode(), rejected.JSON400, rejected.Body)
	}
}

func assertPendingRecurringTransaction(t *testing.T, transaction *httpclient.GetTransactionResponse, wantPendingDate time.Time) {
	t.Helper()
	settledRecords := 0
	for _, record := range transaction.JSON200.Records {
		if record.Settlement == nil {
			if record.PendingDate != nil || record.PostedDate != nil {
				t.Fatalf("date-free recurring record dates = %v/%v, want nil/nil", record.PendingDate, record.PostedDate)
			}
			continue
		}
		settledRecords++
		if *record.Settlement != httpclient.SettlementStatusPending || record.PendingDate == nil || !record.PendingDate.Equal(wantPendingDate) || record.PostedDate != nil {
			t.Fatalf("pending recurring record settlement/dates = %v/%v/%v, want pending/%v/nil", record.Settlement, record.PendingDate, record.PostedDate, wantPendingDate)
		}
	}
	if settledRecords != 1 {
		t.Fatalf("settled recurring record count = %d, want 1", settledRecords)
	}
}

func TestRecurringDefinitionConfirmNextBoundary(t *testing.T) {
	now := apptest.Timestamp("2026-08-02T07:01:51Z")
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
	assertReviewedOccurrence(t, *confirmed.JSON200, httpclient.RecurringOccurrenceStatusConfirmed)
	if confirmed.JSON200.ScheduledDate.Format("2006-01-02") != formatDate(nextDue) {
		t.Fatalf("confirm-next scheduled_date = %s, want %s", confirmed.JSON200.ScheduledDate.Format("2006-01-02"), formatDate(nextDue))
	}

	transaction := getTransaction(t, client, *confirmed.JSON200.GeneratedTransactionId)
	if transaction.JSON200.InitiatedDate.Format("2006-01-02") != formatDate(today) {
		t.Fatalf("confirm-next initiated_date = %s, want %s", transaction.JSON200.InitiatedDate.Format("2006-01-02"), formatDate(today))
	}
	wantPostedDate := now.UTC()
	for _, record := range transaction.JSON200.Records {
		if record.Settlement == nil {
			continue
		}
		if *record.Settlement != httpclient.SettlementStatusPosted || record.PendingDate != nil || record.PostedDate == nil {
			t.Fatalf("confirm-next balance record settlement/pending_date/posted_date = %v/%v/%v", record.Settlement, record.PendingDate, record.PostedDate)
		}
		if !record.PostedDate.Equal(wantPostedDate) {
			t.Fatalf("confirm-next record posted_date = %v, want initiated date %v", record.PostedDate, wantPostedDate)
		}
	}

	client.SetTime(nextDue.AddDate(0, 0, 7))
	afterNextSlot := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId})
	if len(afterNextSlot.JSON200.RecurringOccurrences) != 2 {
		t.Fatalf("confirm-next occurrence count = %d, want 2; occurrences = %+v", len(afterNextSlot.JSON200.RecurringOccurrences), afterNextSlot.JSON200.RecurringOccurrences)
	}
	if afterNextSlot.JSON200.RecurringOccurrences[0].Status != httpclient.RecurringOccurrenceStatusConfirmed || afterNextSlot.JSON200.RecurringOccurrences[1].Status != httpclient.RecurringOccurrenceStatusExpected {
		t.Fatalf("confirm-next statuses = %q/%q, want confirmed/expected", afterNextSlot.JSON200.RecurringOccurrences[0].Status, afterNextSlot.JSON200.RecurringOccurrences[1].Status)
	}
	if afterNextSlot.JSON200.RecurringOccurrences[1].ScheduledDate.Format("2006-01-02") != formatDate(nextDue.AddDate(0, 0, 7)) {
		t.Fatalf("following slot date = %s, want %s", afterNextSlot.JSON200.RecurringOccurrences[1].ScheduledDate.Format("2006-01-02"), formatDate(nextDue.AddDate(0, 0, 7)))
	}
}

func TestRecurringDefinitionDeferBoundary(t *testing.T) {
	client := newSharedClient(t)
	now := client.Now()
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

}

func TestRecurringDefinitionDateRuleDeferBoundary(t *testing.T) {
	clock := apptest.NewFakeClock(apptest.Timestamp("2026-01-15T12:00:00Z"))
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "RecurringDateRuleDefer")

	dayOfMonth := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDateRuleDefer:DayOfMonth",
		refs,
		"-8.00000000",
		"8.00000000",
		dayOfMonthRule(31),
		"2026-01-31",
	))
	deferredDay := deferRecurringDefinition(t, client, dayOfMonth.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{})
	assertDeferredOccurrence(t, *deferredDay.JSON200, "2026-01-31")
	shiftedDay := getRecurringDefinition(t, client, dayOfMonth.JSON201.RecurringDefinitionId)
	if shiftedDay.JSON200.AnchorDate.Format("2006-01-02") != "2026-02-28" {
		t.Fatalf("day-of-month default defer anchor = %s, want 2026-02-28", shiftedDay.JSON200.AnchorDate.Format("2006-01-02"))
	}
	assertDatePtr(t, shiftedDay.JSON200.NextDueDate, "2026-02-28")

	dayOfMonthN := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDateRuleDefer:DayOfMonthN",
		refs,
		"-9.00000000",
		"9.00000000",
		dayOfMonthRule(31),
		"2026-01-31",
	))
	periods := int64(2)
	deferRecurringDefinition(t, client, dayOfMonthN.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{Every: &periods})
	shiftedDayN := getRecurringDefinition(t, client, dayOfMonthN.JSON201.RecurringDefinitionId)
	if shiftedDayN.JSON200.AnchorDate.Format("2006-01-02") != "2026-03-31" {
		t.Fatalf("day-of-month two-period defer anchor = %s, want 2026-03-31", shiftedDayN.JSON200.AnchorDate.Format("2006-01-02"))
	}
	assertDatePtr(t, shiftedDayN.JSON200.NextDueDate, "2026-03-31")

	lastDay := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDateRuleDefer:LastDay",
		refs,
		"-10.00000000",
		"10.00000000",
		lastDayOfMonthRule(),
		"2026-01-31",
	))
	deferRecurringDefinition(t, client, lastDay.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{})
	shiftedLastDay := getRecurringDefinition(t, client, lastDay.JSON201.RecurringDefinitionId)
	if shiftedLastDay.JSON200.AnchorDate.Format("2006-01-02") != "2026-02-28" {
		t.Fatalf("last-day default defer anchor = %s, want 2026-02-28", shiftedLastDay.JSON200.AnchorDate.Format("2006-01-02"))
	}

	unit := httpclient.MONTH
	rejectedUnit, err := client.REST().DeferRecurringDefinitionWithResponse(context.Background(), shiftedLastDay.JSON200.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{Unit: &unit})
	requireNoTransportError(t, "defer date-rule recurring definition with unit", err)
	if rejectedUnit.StatusCode() != http.StatusBadRequest || rejectedUnit.JSON400 == nil || rejectedUnit.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("date-rule defer with unit = status:%d error:%+v, want 400 invalid_request; body %s", rejectedUnit.StatusCode(), rejectedUnit.JSON400, rejectedUnit.Body)
	}

	tooManyPeriods := int64(100_000_000)
	rejectedRange, err := client.REST().DeferRecurringDefinitionWithResponse(context.Background(), shiftedLastDay.JSON200.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{Every: &tooManyPeriods})
	requireNoTransportError(t, "defer date-rule recurring definition outside supported date range", err)
	if rejectedRange.StatusCode() != http.StatusBadRequest || rejectedRange.JSON400 == nil || rejectedRange.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("out-of-range date-rule defer = status:%d error:%+v, want 400 invalid_request; body %s", rejectedRange.StatusCode(), rejectedRange.JSON400, rejectedRange.Body)
	}
	readableAfterRejectedRange := getRecurringDefinition(t, client, shiftedLastDay.JSON200.RecurringDefinitionId)
	if readableAfterRejectedRange.JSON200.AnchorDate.Format("2006-01-02") != "2026-02-28" {
		t.Fatalf("anchor after rejected out-of-range defer = %s, want 2026-02-28", readableAfterRejectedRange.JSON200.AnchorDate.Format("2006-01-02"))
	}
	listAfterRejectedRange, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "list recurring definitions after rejected out-of-range defer", err)
	if listAfterRejectedRange.StatusCode() != http.StatusOK || listAfterRejectedRange.JSON200 == nil {
		t.Fatalf("list after rejected out-of-range defer = status:%d, want 200; body %s", listAfterRejectedRange.StatusCode(), listAfterRejectedRange.Body)
	}

	overdue := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDateRuleDefer:Overdue",
		refs,
		"-12.00000000",
		"12.00000000",
		dayOfMonthRule(31),
		"2025-12-31",
	))
	materializedOverdue := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &overdue.JSON201.RecurringDefinitionId,
	})
	assertRecurringOccurrences(t, materializedOverdue.JSON200.RecurringOccurrences, overdue.JSON201.RecurringDefinitionId, []string{"2025-12-31"})
	deferredOverdue := deferRecurringDefinition(t, client, overdue.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{})
	assertDeferredOccurrence(t, *deferredOverdue.JSON200, "2026-01-31")
	shiftedOverdue := getRecurringDefinition(t, client, overdue.JSON201.RecurringDefinitionId)
	if shiftedOverdue.JSON200.AnchorDate.Format("2006-01-02") != "2026-02-28" {
		t.Fatalf("overdue date-rule defer anchor = %s, want 2026-02-28", shiftedOverdue.JSON200.AnchorDate.Format("2006-01-02"))
	}
	assertDatePtr(t, shiftedOverdue.JSON200.NextDueDate, "2026-02-28")

	paused := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDateRuleDefer:Paused",
		refs,
		"-11.00000000",
		"11.00000000",
		lastDayOfMonthRule(),
		"2026-01-31",
	))
	pauseRecurringDefinition(t, client, paused.JSON201.RecurringDefinitionId)
	rejectedPaused, err := client.REST().DeferRecurringDefinitionWithResponse(context.Background(), paused.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{})
	requireNoTransportError(t, "defer paused date-rule recurring definition", err)
	if rejectedPaused.StatusCode() != http.StatusBadRequest || rejectedPaused.JSON400 == nil || rejectedPaused.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("paused date-rule defer = status:%d error:%+v, want 400 invalid_request; body %s", rejectedPaused.StatusCode(), rejectedPaused.JSON400, rejectedPaused.Body)
	}
}

func TestFutureTransactionProjectionMarksNextOccurrenceBoundary(t *testing.T) {
	client := newSharedClient(t)
	today := civilDateOnly(client.Now())
	refs := createRecurringDefinitionRefs(t, client, "RecurringProjectionNext")
	firstSlot := today.AddDate(0, 0, 1)
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringProjectionNext:Daily",
		refs,
		"-12.00000000",
		"12.00000000",
		intervalRule(1, "DAY"),
		formatDate(firstSlot),
	))
	secondDefinition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringProjectionNext:SecondDaily",
		refs,
		"-13.00000000",
		"13.00000000",
		intervalRule(1, "DAY"),
		formatDate(firstSlot),
	))
	through := firstSlot.AddDate(0, 0, 2)

	assertNextProjectionDates := func(label string, wants map[int64]string) {
		t.Helper()
		anchorDate := apptest.Date(formatDate(through))
		filter := "lifecycle:expected"
		limit := 50
		response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
			AnchorDate: &anchorDate,
			Filter:     &filter,
			Limit:      &limit,
		})
		requireNoTransportError(t, label, err)
		if response.StatusCode() != http.StatusOK {
			t.Fatalf("%s status = %d, want %d; body %s", label, response.StatusCode(), http.StatusOK, response.Body)
		}
		markedByDefinitionID := map[int64][]string{}
		projectionCountByDefinitionID := map[int64]int{}
		for _, transaction := range response.JSON200.Transactions {
			if transaction.RecurringProjectionDefinitionId == nil {
				continue
			}
			definitionID := *transaction.RecurringProjectionDefinitionId
			if _, ok := wants[definitionID]; !ok {
				continue
			}
			projectionCountByDefinitionID[definitionID]++
			if transaction.RecurringProjectionIsNext != nil && *transaction.RecurringProjectionIsNext {
				markedByDefinitionID[definitionID] = append(markedByDefinitionID[definitionID], transaction.InitiatedDate.Format("2006-01-02"))
			}
		}
		for definitionID, want := range wants {
			marked := markedByDefinitionID[definitionID]
			if projectionCountByDefinitionID[definitionID] < 2 || len(marked) != 1 || marked[0] != want {
				t.Fatalf("%s definition %d projections = count:%d marked:%v, want multiple projections with only %s marked next", label, definitionID, projectionCountByDefinitionID[definitionID], marked, want)
			}
		}
	}

	assertNextProjectionDates("list initial next recurring projections", map[int64]string{
		definition.JSON201.RecurringDefinitionId:       formatDate(firstSlot),
		secondDefinition.JSON201.RecurringDefinitionId: formatDate(firstSlot),
	})
	deferRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId, httpclient.RecurringDefinitionDeferRequest{})
	assertNextProjectionDates("list next recurring projections after defer", map[int64]string{
		definition.JSON201.RecurringDefinitionId:       formatDate(firstSlot.AddDate(0, 0, 1)),
		secondDefinition.JSON201.RecurringDefinitionId: formatDate(firstSlot),
	})
}

func TestRecurringDefinitionReviewActionsCatchUpOverdueSlots(t *testing.T) {
	client := newSharedClient(t)
	now := client.Now()
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
	assertReviewedOccurrence(t, *confirmed.JSON200, httpclient.RecurringOccurrenceStatusConfirmed)
	if confirmed.JSON200.ScheduledDate.Format("2006-01-02") != formatDate(nextDue) {
		t.Fatalf("catch-up confirm-next scheduled_date = %s, want %s", confirmed.JSON200.ScheduledDate.Format("2006-01-02"), formatDate(nextDue))
	}
	confirmOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &confirmDefinition.JSON201.RecurringDefinitionId})
	assertRecurringOccurrenceTimeline(t, confirmOccurrences.JSON200.RecurringOccurrences, confirmDefinition.JSON201.RecurringDefinitionId, catchUpDates, []httpclient.RecurringOccurrenceStatus{
		httpclient.RecurringOccurrenceStatusExpected,
		httpclient.RecurringOccurrenceStatusExpected,
		httpclient.RecurringOccurrenceStatusExpected,
		httpclient.RecurringOccurrenceStatusConfirmed,
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
		httpclient.RecurringOccurrenceStatusExpected,
		httpclient.RecurringOccurrenceStatusExpected,
		httpclient.RecurringOccurrenceStatusExpected,
		httpclient.RecurringOccurrenceStatusDeferred,
	})
}

func TestRecurringDefinitionPauseResumeBoundary(t *testing.T) {
	client := newSharedClient(t)
	base := firstDayOfMonth(civilDateOnly(client.Now()))
	client.SetTime(base)
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
	client.SetTime(resumeDate)
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
	client.SetTime(dateResume)
	resumeRecurringDefinition(t, client, dateRule.JSON201.RecurringDefinitionId)
	dateOccurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &dateRule.JSON201.RecurringDefinitionId})
	if len(dateOccurrences.JSON200.RecurringOccurrences) != 2 ||
		dateOccurrences.JSON200.RecurringOccurrences[0].Status != httpclient.RecurringOccurrenceStatusDeferred ||
		dateOccurrences.JSON200.RecurringOccurrences[1].Status != httpclient.RecurringOccurrenceStatusDeferred {
		t.Fatalf("date-rule resumed occurrences = %+v, want two deferred skipped slots", dateOccurrences.JSON200.RecurringOccurrences)
	}
	client.SetTime(time.Date(dateResume.Year(), dateResume.Month(), 15, 12, 0, 0, 0, dateResume.Location()))
	dateDue := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &dateRule.JSON201.RecurringDefinitionId})
	if len(dateDue.JSON200.RecurringOccurrences) != 3 || dateDue.JSON200.RecurringOccurrences[2].Status != httpclient.RecurringOccurrenceStatusExpected {
		t.Fatalf("date-rule post-resume occurrences = %+v, want deferred/deferred/expected", dateDue.JSON200.RecurringOccurrences)
	}
}

func TestRecurringDefinitionQueueSurvivesPauseAndCancelBoundary(t *testing.T) {
	client := newSharedClient(t)
	now := client.Now()
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
	client.SetTime(today.AddDate(0, 0, 7))
	afterCancel := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &cancelledDefinition.JSON201.RecurringDefinitionId})
	assertRecurringOccurrenceIDs(t, afterCancel.JSON200.RecurringOccurrences, []int64{cancelledOccurrences.JSON200.RecurringOccurrences[0].RecurringOccurrenceId})
}

func TestRecurringDefinitionEditFutureOnlyBoundary(t *testing.T) {
	client := newSharedClient(t)
	now := client.Now()
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
	client.SetTime(today.AddDate(0, 0, 7))
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

func TestRecurringDefinitionEditedAnchorBecomesScheduleFloorBoundary(t *testing.T) {
	client := newSharedClient(t)
	today := civilDateOnly(client.Now())
	refs := createRecurringDefinitionRefs(t, client, "RecurringReanchor")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringReanchor:Monthly",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "MONTH"),
		formatDate(today),
	))

	materialized := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId,
	})
	confirmedFuture := confirmNextRecurringDefinition(t, client, definition.JSON201.RecurringDefinitionId)
	before := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId,
	})
	wantOccurrenceIDs := recurringOccurrenceIDs(before.JSON200.RecurringOccurrences)
	wantTransactionIDs := generatedTransactionIDs(t, before.JSON200.RecurringOccurrences)
	if len(materialized.JSON200.RecurringOccurrences) != 1 || len(before.JSON200.RecurringOccurrences) != 2 {
		t.Fatalf("pre-reanchor occurrences = materialized:%+v all:%+v, want one due and one early-confirmed future occurrence", materialized.JSON200.RecurringOccurrences, before.JSON200.RecurringOccurrences)
	}

	newAnchor := time.Date(today.Year(), today.Month()+1, 1, 0, 0, 0, 0, today.Location())
	replaced, err := client.REST().ReplaceRecurringDefinitionWithResponse(
		context.Background(),
		definition.JSON201.RecurringDefinitionId,
		recurringDefinitionRequest(
			"RecurringReanchor:Monthly",
			refs,
			"-20.00000000",
			"20.00000000",
			intervalRule(1, "MONTH"),
			formatDate(newAnchor),
		),
	)
	requireNoTransportError(t, "replace recurring definition anchor", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace recurring definition anchor status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	assertDatePtr(t, replaced.JSON200.NextDueDate, formatDate(newAnchor))
	listed, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "list re-anchored recurring definitions", err)
	if listed.StatusCode() != http.StatusOK {
		t.Fatalf("list re-anchored recurring definitions status = %d, want %d; body %s", listed.StatusCode(), http.StatusOK, listed.Body)
	}
	if len(listed.JSON200.RecurringDefinitions) != 1 || listed.JSON200.RecurringDefinitions[0].RecurringDefinitionId != definition.JSON201.RecurringDefinitionId {
		t.Fatalf("listed re-anchored definitions = %+v, want definition %d", listed.JSON200.RecurringDefinitions, definition.JSON201.RecurringDefinitionId)
	}
	assertDatePtr(t, listed.JSON200.RecurringDefinitions[0].NextDueDate, formatDate(newAnchor))

	after := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId,
	})
	assertRecurringOccurrenceIDs(t, after.JSON200.RecurringOccurrences, wantOccurrenceIDs)
	assertSameInt64Set(t, generatedTransactionIDs(t, after.JSON200.RecurringOccurrences), wantTransactionIDs)
	for _, transactionID := range wantTransactionIDs {
		transaction := getTransaction(t, client, transactionID)
		assertTransactionCheckingAmount(t, transaction.JSON200.Records, refs.CheckingAccountID, "-10.00000000")
	}
	if confirmedFuture.JSON200.ScheduledDate.Format("2006-01-02") == formatDate(newAnchor) {
		t.Fatalf("future recorded slot unexpectedly equals edited anchor %s; test requires an off-grid future slot", formatDate(newAnchor))
	}

	through := newAnchor.AddDate(0, 1, 0)
	anchorDate := apptest.Date(formatDate(through))
	filter := "lifecycle:expected"
	limit := 50
	projected, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AnchorDate: &anchorDate,
		Filter:     &filter,
		Limit:      &limit,
	})
	requireNoTransportError(t, "list re-anchored recurring projections", err)
	if projected.StatusCode() != http.StatusOK {
		t.Fatalf("re-anchored projection status = %d, want %d; body %s", projected.StatusCode(), http.StatusOK, projected.Body)
	}
	projectionDates := []string{}
	for _, transaction := range projected.JSON200.Transactions {
		if transaction.RecurringProjectionDefinitionId != nil && *transaction.RecurringProjectionDefinitionId == definition.JSON201.RecurringDefinitionId {
			projectionDates = append(projectionDates, transaction.InitiatedDate.Format("2006-01-02"))
		}
	}
	if len(projectionDates) != 2 || projectionDates[0] != formatDate(through) || projectionDates[1] != formatDate(newAnchor) {
		t.Fatalf("re-anchored projection dates = %v, want [%s %s]", projectionDates, formatDate(through), formatDate(newAnchor))
	}
}

func TestRecurringDefinitionEditedAnchorValidationBoundary(t *testing.T) {
	client := newSharedClient(t)
	today := civilDateOnly(client.Now())
	refs := createRecurringDefinitionRefs(t, client, "RecurringAnchorValidation")
	pastAnchor := today.AddDate(0, -1, 0)
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringAnchorValidation:Monthly",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "MONTH"),
		formatDate(pastAnchor),
	))

	unchanged, err := client.REST().ReplaceRecurringDefinitionWithResponse(
		context.Background(),
		definition.JSON201.RecurringDefinitionId,
		recurringDefinitionRequest(
			"RecurringAnchorValidation:Renamed",
			refs,
			"-11.00000000",
			"11.00000000",
			intervalRule(1, "MONTH"),
			formatDate(pastAnchor),
		),
	)
	requireNoTransportError(t, "replace recurring definition with unchanged past anchor", err)
	if unchanged.StatusCode() != http.StatusOK {
		t.Fatalf("unchanged past anchor replace status = %d, want %d; body %s", unchanged.StatusCode(), http.StatusOK, unchanged.Body)
	}

	changedPastAnchor := today.AddDate(0, 0, -1)
	rejected, err := client.REST().ReplaceRecurringDefinitionWithResponse(
		context.Background(),
		definition.JSON201.RecurringDefinitionId,
		recurringDefinitionRequest(
			"RecurringAnchorValidation:Renamed",
			refs,
			"-11.00000000",
			"11.00000000",
			intervalRule(1, "MONTH"),
			formatDate(changedPastAnchor),
		),
	)
	requireNoTransportError(t, "replace recurring definition with changed past anchor", err)
	if rejected.StatusCode() != http.StatusBadRequest || rejected.JSON400 == nil || rejected.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("changed past anchor replace = status:%d error:%+v, want 400 invalid_request; body %s", rejected.StatusCode(), rejected.JSON400, rejected.Body)
	}
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
		CategoryFQN:       category.Fqn,
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
				AccountId: &refs.CheckingAccountID,
				MemberId:  nullable.NewNullableWithValue(refs.MemberID),
				Currency:  recurringStringPtr("USD"),
				Amount:    recurringStringPtr(debit),
				TagIds:    &[]int64{refs.TagID},
				Memo:      nullable.NewNullableWithValue("debit"),
			},
			{
				AccountId:  &refs.MerchantAccountID,
				MemberId:   nullable.NewNullableWithValue(refs.MemberID),
				Currency:   recurringStringPtr("USD"),
				Amount:     recurringStringPtr(credit),
				CategoryId: nullable.NewNullableWithValue(refs.CategoryID),
				TagIds:     &[]int64{refs.TagID},
				Memo:       nullable.NewNullableWithValue("credit"),
			},
		},
	}
}

func recurringExpectedReplacementRequest(refs recurringDefinitionRefs, memo string) httpclient.CreateTransactionRequest {
	pendingDate := apptest.Timestamp("2024-03-12T00:00:00Z")
	postedDate := apptest.Timestamp("2024-03-13T00:00:00Z")
	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-12"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountID,
				MemberId:             &refs.MemberID,
				Currency:             "USD",
				Amount:               "-20.00",
				AmountUsd:            apptest.StringPtr("-20.00"),
				TagIds:               apptest.Int64SlicePtr(refs.TagID),
				Memo:                 &memo,
				Settlement:           &httpclient.SettlementIntent{Status: httpclient.SettlementStatusPosted, PendingDate: &pendingDate, PostedDate: &postedDate},
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountID,
				Currency:             "USD",
				Amount:               "20.00",
				AmountUsd:            apptest.StringPtr("20.00"),
				CategoryId:           apptest.Int64Ptr(refs.CategoryID),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
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
	assertRecurringRecord(t, definition.Records[0], refs.CheckingAccountID, nil, refs.TagID, refs.MemberID, debit)
	assertRecurringRecord(t, definition.Records[1], refs.MerchantAccountID, &refs.CategoryID, refs.TagID, refs.MemberID, credit)
}

func assertRecurringRecord(t *testing.T, record httpclient.RecurringDefinitionRecord, accountID int64, categoryID *int64, tagID int64, memberID int64, amount string) {
	t.Helper()

	if record.AccountId != accountID || !optionalInt64Equal(record.CategoryId, categoryID) || record.Currency != "USD" || record.Amount != amount {
		t.Fatalf("record = account:%d category:%v currency:%q amount:%q", record.AccountId, record.CategoryId, record.Currency, record.Amount)
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

func optionalInt64Equal(left, right *int64) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
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

	response, err := client.REST().ConfirmRecurringOccurrenceWithResponse(context.Background(), id, recurringOccurrenceConfirmRequest(*apptest.PostedSettlement(), nil))
	requireNoTransportError(t, "confirm recurring occurrence", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("confirm recurring occurrence status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func recurringOccurrenceConfirmRequest(settlement httpclient.SettlementIntent, actualDate *openapi_types.Date) httpclient.RecurringOccurrenceConfirmRequest {
	return httpclient.RecurringOccurrenceConfirmRequest{
		ActualDate:  actualDate,
		Status:      settlement.Status,
		PendingDate: settlement.PendingDate,
		PostedDate:  settlement.PostedDate,
	}
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

func confirmAgain(t *testing.T, client *apptest.Client, id int64) int {
	t.Helper()

	response, err := client.REST().ConfirmRecurringOccurrenceWithResponse(context.Background(), id, recurringOccurrenceConfirmRequest(*apptest.PostedSettlement(), nil))
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

	if occurrence.Status != httpclient.RecurringOccurrenceStatusDeferred ||
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

func assertTransactionCheckingAmountUSD(t *testing.T, records []httpclient.JournalRecord, accountID int64, want string) {
	t.Helper()

	for _, record := range records {
		if record.AccountId == accountID {
			if record.AmountUsd == nil || *record.AmountUsd != want {
				t.Fatalf("checking record amount_usd = %v, want %q; records = %+v", record.AmountUsd, want, records)
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
			occurrence.Status != httpclient.RecurringOccurrenceStatusExpected ||
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
