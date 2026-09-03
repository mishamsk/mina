package runtime_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestRecurringCatchUpOperationIsObservableAndManual(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp("2026-09-02T12:00:00Z"))))
	refs := createRecurringDefinitionRefs(t, client, "RecurringCatchUpOperation")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringCatchUpOperation:Daily", refs, "-10.00000000", "10.00000000", intervalRule(1, "DAY"), "2026-09-01"))

	operations, err := client.REST().ListBackgroundOperationsWithResponse(context.Background())
	requireClientResponse(t, "list operations with recurring catch-up", err, operations.StatusCode(), http.StatusOK, operations.Body)
	catchUp := requireOperationSummary(t, operations.JSON200.Operations, httpclient.BackgroundOperationIdRecurringCatchUp)
	if catchUp.Links.Status != "/api/background-operations/recurring-catch-up/status" ||
		catchUp.Links.StartRun != "/api/background-operations/recurring-catch-up/runs" ||
		catchUp.Links.Run != "/api/background-operations/recurring-catch-up/runs/{operation_run_id}" ||
		catchUp.Links.Runs != "/api/background-operations/runs?operation_id=recurring-catch-up" {
		t.Fatalf("recurring catch-up links = %+v", catchUp.Links)
	}
	status := client.RecurringCatchUpStatus()
	if !status.Enabled || status.ScheduleLocal != "1 0 * * *" || status.State != httpclient.RecurringCatchUpStatusResponseStateIdle || status.RunCount != 0 {
		t.Fatalf("initial recurring catch-up status = %+v", status)
	}

	start, err := client.REST().StartRecurringCatchUpRunWithResponse(context.Background())
	requireClientResponse(t, "start recurring catch-up", err, start.StatusCode(), http.StatusAccepted, start.Body)
	wantURL := fmt.Sprintf("/api/background-operations/recurring-catch-up/runs/%d", start.JSON202.OperationRunId)
	if start.JSON202.OperationId != httpclient.OperationRunReferenceResponseOperationIdRecurringCatchUp || start.JSON202.StatusUrl != wantURL {
		t.Fatalf("recurring catch-up start = %+v, want typed run URL %q", start.JSON202, wantURL)
	}
	run := client.AwaitRecurringCatchUpRun(start.JSON202.OperationRunId)
	if run.Trigger != httpclient.BackgroundOperationRunTriggerManual || run.OperationId != httpclient.RecurringCatchUpRunOperationIdRecurringCatchUp {
		t.Fatalf("manual recurring catch-up run = %+v", run)
	}
	started, err := client.REST().GetRecurringCatchUpRunWithResponse(context.Background(), run.OperationRunId)
	requireClientResponse(t, "get recurring catch-up run", err, started.StatusCode(), http.StatusOK, started.Body)
	if started.JSON200.Outcome != httpclient.BackgroundOperationRunOutcomeSucceeded {
		t.Fatalf("recurring catch-up detail = %+v, want success", started.JSON200)
	}

	expected := listExpectedTransactions(t, client, nil)
	if len(expected) != 2 || expected[0].RecurringDefinitionId == nil || *expected[0].RecurringDefinitionId != definition.JSON201.RecurringDefinitionId {
		t.Fatalf("manual recurring catch-up transactions = %+v, want two due occurrences", expected)
	}
	status = client.RecurringCatchUpStatus()
	if status.RunCount != 1 || status.CompletedRunRevision != 1 || status.LastSuccess == nil || !*status.LastSuccess {
		t.Fatalf("completed recurring catch-up status = %+v", status)
	}
}

func TestRecurringCatchUpRunsDailyAfterServerLocalMidnight(t *testing.T) {
	serverLocation := time.FixedZone("server-local", -4*60*60)
	clock := apptest.NewFakeClock(time.Date(2026, time.September, 2, 0, 0, 0, 0, serverLocation))
	client := newSharedClient(t, apptest.WithClock(clock), apptest.WithOperationsEnabled(true))
	refs := createRecurringDefinitionRefs(t, client, "RecurringScheduledCatchUp")
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest("RecurringScheduledCatchUp:Daily", refs, "-8.00000000", "8.00000000", intervalRule(1, "DAY"), "2026-09-02"))

	if transactions := listExpectedTransactions(t, client, nil); len(transactions) != 0 {
		t.Fatalf("pre-schedule transaction read materialized occurrences: %+v", transactions)
	}
	clock.WaitForDeadline(t, time.Date(2026, time.September, 2, 0, 1, 0, 0, serverLocation))
	clock.Advance(time.Minute)
	status := client.AwaitRecurringCatchUpStatusRevision(1)
	if status.LastSuccess == nil || !*status.LastSuccess {
		t.Fatalf("scheduled recurring catch-up status = %+v", status)
	}
	requireLatestRunEnvelopeTrigger(t, client, httpclient.BackgroundOperationIdRecurringCatchUp, httpclient.BackgroundOperationRunTriggerScheduled)

	expected := listExpectedTransactions(t, client, nil)
	if len(expected) != 1 || expected[0].RecurringDefinitionId == nil || *expected[0].RecurringDefinitionId != definition.JSON201.RecurringDefinitionId {
		t.Fatalf("scheduled recurring catch-up transactions = %+v, want today's occurrence", expected)
	}
}

func TestRecurringCatchUpRunsAtDaytimeServerStartup(t *testing.T) {
	serverLocation := time.FixedZone("server-local", -4*60*60)
	clock := apptest.NewFakeClock(time.Date(2026, time.September, 2, 12, 0, 0, 0, serverLocation))
	schema := apptest.AccountingSchemaName(t, "recurring_startup_catch_up")
	setup := newSharedClient(t, apptest.WithAccountingSchema(schema), apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, setup, "RecurringStartupCatchUp")
	definition := createRecurringDefinition(t, setup, recurringDefinitionRequest("RecurringStartupCatchUp:Daily", refs, "-8.00000000", "8.00000000", intervalRule(1, "DAY"), "2026-09-01"))
	setup.Close()

	client := newSharedClient(t, apptest.WithAccountingSchema(schema), apptest.WithClock(clock), apptest.WithOperationsEnabled(true))
	client.AwaitBackgroundOperationRun(
		httpclient.BackgroundOperationIdRecurringCatchUp,
		httpclient.BackgroundOperationRunTriggerStartup,
		httpclient.BackgroundOperationRunOutcomeSucceeded,
		clock.Now(),
	)

	expected := listExpectedTransactions(t, client, nil)
	if len(expected) != 2 || expected[0].RecurringDefinitionId == nil || *expected[0].RecurringDefinitionId != definition.JSON201.RecurringDefinitionId {
		t.Fatalf("startup recurring catch-up transactions = %+v, want two due occurrences", expected)
	}
}
