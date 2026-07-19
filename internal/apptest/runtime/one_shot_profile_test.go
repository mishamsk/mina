package runtime_test

import (
	"context"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestOneShotExecutionProfilePolicy(t *testing.T) {
	provider := apptest.NewFakeExchangeRateProvider()
	tempDir := t.TempDir()
	client := newSharedClient(
		t,
		apptest.WithOneShotExecutionProfile(),
		apptest.WithOperationsEnabled(true),
		apptest.WithExchangeRateLoading(true),
		apptest.WithExchangeRateProviderFactory(provider),
		apptest.WithDatabasePath(filepath.Join(tempDir, "mina.duckdb")),
		apptest.WithBackupFileDirectory(filepath.Join(tempDir, "backups")),
		apptest.WithBackupFileScheduleUTC("0 18 * * *"),
	)

	status := client.ExchangeRateLoadingStatus()
	if !status.Enabled || status.RunCount != 0 || status.CompletedRunRevision != 0 {
		t.Fatalf("initial one-shot status = %+v, want enabled operation with no automatic runs", status)
	}
	backupStatus := client.DatabaseBackupStatus()
	if !backupStatus.Enabled || backupStatus.RunCount != 0 || backupStatus.CompletedRunRevision != 0 {
		t.Fatalf("initial one-shot backup status = %+v, want enabled operation with no automatic runs", backupStatus)
	}
	runs, err := client.REST().ListBackgroundOperationRunEnvelopesWithResponse(context.Background(), nil)
	requireClientResponse(t, "list one-shot operation runs", err, runs.StatusCode(), http.StatusOK, runs.Body)
	if runs.JSON200.TotalCount != 0 || len(runs.JSON200.Runs) != 0 {
		t.Fatalf("initial one-shot runs = %+v, want none", runs.JSON200)
	}

	started, err := client.REST().StartExchangeRateLoadingRunWithResponse(context.Background())
	requireClientResponse(t, "start manual one-shot operation", err, started.StatusCode(), http.StatusAccepted, started.Body)
	run := client.PollExchangeRateLoadingRun(started.JSON202.OperationRunId)
	if run.Outcome != httpclient.BackgroundOperationRunOutcomeSucceeded {
		t.Fatalf("manual one-shot run outcome = %q, want succeeded; error = %v", run.Outcome, run.Error)
	}

	backupStarted, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
	requireClientResponse(t, "start manual one-shot database backup", err, backupStarted.StatusCode(), http.StatusAccepted, backupStarted.Body)
	backupRun := client.PollDatabaseBackupRun(backupStarted.JSON202.OperationRunId)
	if backupRun.Outcome != httpclient.BackgroundOperationRunOutcomeSucceeded {
		t.Fatalf("manual one-shot backup outcome = %q, want succeeded; error = %v", backupRun.Outcome, backupRun.Error)
	}

	created, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{Name: "Alex"})
	requireClientResponse(t, "create member through one-shot app", err, created.StatusCode(), http.StatusCreated, created.Body)
	listed, err := client.REST().ListMembersWithResponse(context.Background(), nil)
	requireClientResponse(t, "list members through one-shot app", err, listed.StatusCode(), http.StatusOK, listed.Body)
	if len(listed.JSON200.Members) != 1 || listed.JSON200.Members[0].MemberId != created.JSON201.MemberId {
		t.Fatalf("one-shot members = %+v, want created member %d", listed.JSON200.Members, created.JSON201.MemberId)
	}
}
