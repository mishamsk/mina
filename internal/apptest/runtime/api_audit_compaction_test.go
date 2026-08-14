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

func TestAPIAuditCompactionPreservesCutoffAndIsIdempotent(t *testing.T) {
	clock := apptest.NewFakeClock(apptest.Timestamp("2026-08-13T12:00:00Z"))
	client := newSharedClient(t, apptest.WithClock(clock), apptest.WithAuditLogRetentionMonths(3))

	for _, fixture := range []struct {
		at  string
		fqn string
	}{
		{at: "2026-04-30T23:59:59.999999Z", fqn: "Compaction:Expired"},
		{at: "2026-05-01T00:00:00Z", fqn: "Compaction:Boundary"},
		{at: "2026-07-01T00:00:00Z", fqn: "Compaction:Retained"},
	} {
		clock.Set(apptest.Timestamp(fixture.at))
		created, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: fixture.fqn})
		requireClientResponse(t, "create audit compaction fixture", err, created.StatusCode(), http.StatusCreated, created.Body)
	}
	clock.Set(apptest.Timestamp("2026-08-13T12:00:00Z"))

	operations, err := client.REST().ListBackgroundOperationsWithResponse(context.Background())
	requireClientResponse(t, "list operations with audit compaction", err, operations.StatusCode(), http.StatusOK, operations.Body)
	compaction := requireOperationSummary(t, operations.JSON200.Operations, httpclient.BackgroundOperationIdAuditLogCompaction)
	if compaction.Links.Status != "/api/background-operations/audit-log-compaction/status" ||
		compaction.Links.StartRun != "/api/background-operations/audit-log-compaction/runs" ||
		compaction.Links.Run != "/api/background-operations/audit-log-compaction/runs/{operation_run_id}" ||
		compaction.Links.Runs != "/api/background-operations/runs?operation_id=audit-log-compaction" {
		t.Fatalf("audit compaction links = %+v", compaction.Links)
	}
	status := client.AuditLogCompactionStatus()
	if !status.Enabled || status.ScheduleUtc != "0 0 1 * *" || status.State != httpclient.AuditLogCompactionStatusResponseStateIdle {
		t.Fatalf("initial audit compaction status = %+v", status)
	}

	first := startAuditLogCompaction(t, client)
	if first.Trigger != httpclient.BackgroundOperationRunTriggerManual || first.Outcome != httpclient.BackgroundOperationRunOutcomeSucceeded {
		t.Fatalf("first audit compaction run = %+v, want successful manual run", first)
	}
	assertCompactionTagEntries(t, client, []string{"Compaction:Retained", "Compaction:Boundary"})

	second := startAuditLogCompaction(t, client)
	if second.Outcome != httpclient.BackgroundOperationRunOutcomeSucceeded {
		t.Fatalf("second audit compaction run = %+v, want idempotent success", second)
	}
	assertCompactionTagEntries(t, client, []string{"Compaction:Retained", "Compaction:Boundary"})

	operationID := httpclient.BackgroundOperationIdAuditLogCompaction
	runs, err := client.REST().ListBackgroundOperationRunEnvelopesWithResponse(
		context.Background(),
		&httpclient.ListBackgroundOperationRunEnvelopesParams{OperationId: &operationID},
	)
	requireClientResponse(t, "list audit compaction envelopes", err, runs.StatusCode(), http.StatusOK, runs.Body)
	if runs.JSON200.TotalCount != 2 || len(runs.JSON200.Runs) != 2 {
		t.Fatalf("audit compaction run envelopes = %+v, want two", runs.JSON200)
	}
	for _, run := range runs.JSON200.Runs {
		if run.OperationId != operationID || run.Trigger != httpclient.BackgroundOperationRunTriggerManual || run.Outcome != httpclient.BackgroundOperationRunOutcomeSucceeded {
			t.Fatalf("audit compaction envelope = %+v", run)
		}
	}
}

func TestAuditCompactionScheduleUsesCancelableClockDeadline(t *testing.T) {
	clock := apptest.NewFakeClock(apptest.Timestamp("2026-08-15T02:04:00Z"))
	client := newSharedClient(
		t,
		apptest.WithClock(clock),
		apptest.WithOperationsEnabled(true),
		apptest.WithAuditLogCompactionScheduleUTC("5 2 15 * *"),
	)
	clock.WaitForPendingDeadlineWaits(t, 1)
	if calls := clock.DeadlineWaitCalls(); calls != 1 {
		t.Fatalf("deadline wait calls = %d, want one idle wait", calls)
	}
	for range 5 {
		if status := client.AuditLogCompactionStatus(); status.RunCount != 0 {
			t.Fatalf("audit compaction status before deadline = %+v, want no runs", status)
		}
	}
	if calls := clock.DeadlineWaitCalls(); calls != 1 {
		t.Fatalf("deadline wait calls after idle requests = %d, want no periodic wakeups", calls)
	}

	clock.Advance(time.Minute)
	status := client.AwaitAuditLogCompactionStatusRevision(1)
	if status.LastSuccess == nil || !*status.LastSuccess {
		t.Fatalf("scheduled audit compaction status = %+v, want success", status)
	}
	requireLatestRunEnvelopeTrigger(t, client, httpclient.BackgroundOperationIdAuditLogCompaction, httpclient.BackgroundOperationRunTriggerScheduled)
	clock.WaitForPendingDeadlineWaits(t, 1)
	if calls := clock.DeadlineWaitCalls(); calls != 2 {
		t.Fatalf("deadline wait calls after scheduled run = %d, want next monthly deadline only", calls)
	}

	closed := make(chan struct{})
	go func() {
		defer close(closed)
		client.Close()
	}()
	apptest.AwaitSignal(t, closed, "runtime close with far-future deadline")
	if pending := clock.PendingDeadlineWaits(); pending != 0 {
		t.Fatalf("pending deadline waits after close = %d, want zero", pending)
	}
}

func TestAPIAuditCompactionExtremeRetentionKeepsCurrentHistory(t *testing.T) {
	clock := apptest.NewFakeClock(apptest.Timestamp("2026-08-13T12:00:00Z"))
	client := newSharedClient(
		t,
		apptest.WithClock(clock),
		apptest.WithAuditLogRetentionMonths(int(^uint(0)>>1)),
	)

	created, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: "Compaction:ExtremeRetention"})
	requireClientResponse(t, "create extreme-retention audit fixture", err, created.StatusCode(), http.StatusCreated, created.Body)

	run := startAuditLogCompaction(t, client)
	if run.Outcome != httpclient.BackgroundOperationRunOutcomeSucceeded {
		t.Fatalf("extreme-retention compaction run = %+v, want success", run)
	}
	assertCompactionTagEntries(t, client, []string{"Compaction:ExtremeRetention"})
}

func startAuditLogCompaction(t *testing.T, client *apptest.Client) *httpclient.AuditLogCompactionRun {
	t.Helper()
	started, err := client.REST().StartAuditLogCompactionRunWithResponse(context.Background())
	requireClientResponse(t, "start API audit-log compaction", err, started.StatusCode(), http.StatusAccepted, started.Body)
	wantURL := fmt.Sprintf("/api/background-operations/audit-log-compaction/runs/%d", started.JSON202.OperationRunId)
	if started.JSON202.OperationId != httpclient.AuditLogCompaction || started.JSON202.StatusUrl != wantURL {
		t.Fatalf("audit compaction start response = %+v, want operation identity and typed run URL %q", started.JSON202, wantURL)
	}

	return client.AwaitAuditLogCompactionRun(started.JSON202.OperationRunId)
}

func assertCompactionTagEntries(t *testing.T, client *apptest.Client, wantNewestFirst []string) {
	t.Helper()
	operationID := "createTag"
	entries := listAPIAuditEntries(t, client, &httpclient.ListAPIAuditEntriesParams{OperationId: &operationID})
	if entries.TotalCount != int64(len(wantNewestFirst)) || len(entries.Entries) != len(wantNewestFirst) {
		t.Fatalf("retained create-tag audit entries = %+v, want %d", entries, len(wantNewestFirst))
	}
	for index, want := range wantNewestFirst {
		assertAuditJSONField(t, entries.Entries[index].RequestJson, "fqn", want)
	}
}

func requireOperationSummary(t *testing.T, operations []httpclient.BackgroundOperationSummary, operationID httpclient.BackgroundOperationId) httpclient.BackgroundOperationSummary {
	t.Helper()
	for _, operation := range operations {
		if operation.OperationId == operationID {
			return operation
		}
	}
	t.Fatalf("operations = %+v, want %q", operations, operationID)
	return httpclient.BackgroundOperationSummary{}
}
