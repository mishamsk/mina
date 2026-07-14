package runtime_test

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestDatabaseBackupOperationExpectedBehavior(t *testing.T) {
	t.Run("operation list links to concrete operation APIs", func(t *testing.T) {
		client := newSharedClient(t)

		response, err := client.REST().ListBackgroundOperationsWithResponse(context.Background())
		requireClientResponse(t, "list background operations", err, response.StatusCode(), http.StatusOK, response.Body)

		expected := map[httpclient.BackgroundOperationId]struct {
			statusURL string
			startRun  string
			run       string
			runs      string
			follow    func()
		}{
			httpclient.BackgroundOperationIdExchangeRateLoading: {
				statusURL: "/api/background-operations/exchange-rate-loading/status",
				startRun:  "/api/background-operations/exchange-rate-loading/runs",
				run:       "/api/background-operations/exchange-rate-loading/runs/{operation_run_id}",
				runs:      "/api/background-operations/runs?operation_id=exchange-rate-loading",
				follow: func() {
					status, err := client.REST().GetExchangeRateLoadingStatusWithResponse(context.Background())
					requireClientResponse(t, "follow exchange-rate loading status link", err, status.StatusCode(), http.StatusOK, status.Body)
				},
			},
			httpclient.BackgroundOperationIdDatabaseBackup: {
				statusURL: "/api/background-operations/database-backup/status",
				startRun:  "/api/background-operations/database-backup/runs",
				run:       "/api/background-operations/database-backup/runs/{operation_run_id}",
				runs:      "/api/background-operations/runs?operation_id=database-backup",
				follow: func() {
					status, err := client.REST().GetDatabaseBackupStatusWithResponse(context.Background())
					requireClientResponse(t, "follow database backup status link", err, status.StatusCode(), http.StatusOK, status.Body)
				},
			},
		}
		for _, operation := range response.JSON200.Operations {
			want, ok := expected[operation.OperationId]
			if !ok {
				continue
			}
			if operation.Links.Status != want.statusURL ||
				operation.Links.StartRun != want.startRun ||
				operation.Links.Run != want.run ||
				operation.Links.Runs != want.runs {
				t.Fatalf("%s links = %+v", operation.OperationId, operation.Links)
			}
			want.follow()
			delete(expected, operation.OperationId)
		}
		if len(expected) > 0 {
			t.Fatalf("operations = %+v, missing %v", response.JSON200.Operations, expected)
		}
	})

	t.Run("status is disabled with default config", func(t *testing.T) {
		client := newSharedClient(t)

		status := client.DatabaseBackupStatus()
		if status.Enabled {
			t.Fatal("enabled = true, want false")
		}
		if status.ScheduleUtc != "" {
			t.Fatalf("schedule_utc = %q, want empty", status.ScheduleUtc)
		}
		if status.State != httpclient.DatabaseBackupStatusResponseStateIdle {
			t.Fatalf("state = %q, want idle", status.State)
		}
		if status.LastStartedAt != nil || status.LastCompletedAt != nil || status.LastSuccess != nil || status.LastError != nil {
			t.Fatalf("initial terminal fields = started:%v completed:%v success:%v error:%v, want nils", status.LastStartedAt, status.LastCompletedAt, status.LastSuccess, status.LastError)
		}
		if status.RunCount != 0 || status.CompletedRunRevision != 0 {
			t.Fatalf("run counters = %d/%d, want 0/0", status.RunCount, status.CompletedRunRevision)
		}
	})

	t.Run("manual trigger without destination returns invalid request and creates no run", func(t *testing.T) {
		client := newSharedClient(t)

		response, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start database backup without destination", err, response.StatusCode(), http.StatusBadRequest, response.Body)

		status := client.DatabaseBackupStatus()
		if status.RunCount != 0 || status.CompletedRunRevision != 0 {
			t.Fatalf("status after rejected trigger = %+v, want no runs", status)
		}
	})

	t.Run("manual trigger with file-backed app creates one DuckDB backup file", func(t *testing.T) {
		dbPath := filepath.Join(t.TempDir(), "mina.duckdb")
		backupDir := filepath.Join(t.TempDir(), "backups")
		client := newSharedClient(
			t,
			apptest.WithDatabasePath(dbPath),
			apptest.WithBackupFileDirectory(backupDir),
		)

		started, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start database backup", err, started.StatusCode(), http.StatusAccepted, started.Body)
		run := client.PollDatabaseBackupRun(started.JSON202.OperationRunId)
		if string(run.Outcome) != "succeeded" {
			t.Fatalf("run outcome = %q, want succeeded; error = %v", run.Outcome, run.Error)
		}

		files := backupFiles(t, backupDir)
		if len(files) != 1 {
			t.Fatalf("backup file count = %d, want 1; files = %v", len(files), files)
		}
	})

	t.Run("successful backups are finalized with expected filename shape", func(t *testing.T) {
		dbPath := filepath.Join(t.TempDir(), "mina.duckdb")
		backupDir := filepath.Join(t.TempDir(), "backups")
		client := newSharedClient(
			t,
			apptest.WithDatabasePath(dbPath),
			apptest.WithBackupFileDirectory(backupDir),
		)

		started, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start database backup", err, started.StatusCode(), http.StatusAccepted, started.Body)
		run := client.PollDatabaseBackupRun(started.JSON202.OperationRunId)
		if string(run.Outcome) != "succeeded" {
			t.Fatalf("run outcome = %q, want succeeded; error = %v", run.Outcome, run.Error)
		}

		files := providerBackupFiles(t, backupDir)
		if len(files) != 1 {
			t.Fatalf("provider backup file count = %d, want 1; files = %v", len(files), files)
		}
		if !strings.HasPrefix(files[0], "mina-backup-") || !strings.HasSuffix(files[0], ".duckdb") {
			t.Fatalf("backup file name = %q, want mina-backup-*.duckdb", files[0])
		}
	})

	t.Run("run transitions through operation-run status fields", func(t *testing.T) {
		dbPath := filepath.Join(t.TempDir(), "mina.duckdb")
		backupDir := filepath.Join(t.TempDir(), "backups")
		client := newSharedClient(
			t,
			apptest.WithDatabasePath(dbPath),
			apptest.WithBackupFileDirectory(backupDir),
		)

		started, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start database backup", err, started.StatusCode(), http.StatusAccepted, started.Body)
		if string(started.JSON202.OperationId) != "database-backup" {
			t.Fatalf("operation_id = %q, want database-backup", started.JSON202.OperationId)
		}
		wantStatusURL := fmt.Sprintf("/api/background-operations/database-backup/runs/%d", started.JSON202.OperationRunId)
		if started.JSON202.StatusUrl != wantStatusURL {
			t.Fatalf("status_url = %q, want %q", started.JSON202.StatusUrl, wantStatusURL)
		}

		run := client.PollDatabaseBackupRun(started.JSON202.OperationRunId)
		if string(run.OperationId) != "database-backup" ||
			run.OperationRunId != started.JSON202.OperationRunId ||
			string(run.Outcome) != "succeeded" ||
			run.CompletedAt == nil ||
			run.Error != nil {
			t.Fatalf("completed run = %+v, want successful database-backup run", run)
		}
		status := client.DatabaseBackupStatus()
		if status.RunCount != 1 || status.CompletedRunRevision != 1 || status.LastSuccess == nil || !*status.LastSuccess {
			t.Fatalf("status after trigger = %+v, want one successful completed run", status)
		}
	})

	t.Run("concurrent manual triggers produce one running run and one skipped run", func(t *testing.T) {
		backup := apptest.NewBlockedDatabaseBackup()
		client := newSharedClient(
			t,
			apptest.WithBackupFileDirectory(filepath.Join(t.TempDir(), "backups")),
			apptest.WithBlockedDatabaseBackup(backup),
		)

		started, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start blocking database backup", err, started.StatusCode(), http.StatusAccepted, started.Body)
		backup.WaitUntilStarted(t)

		running, err := client.REST().GetDatabaseBackupRunWithResponse(context.Background(), started.JSON202.OperationRunId)
		requireClientResponse(t, "get running database backup", err, running.StatusCode(), http.StatusOK, running.Body)
		if string(running.JSON200.Outcome) != "running" || running.JSON200.CompletedAt != nil {
			t.Fatalf("running run = %+v, want running with no completed_at", running.JSON200)
		}

		skipped, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start concurrent database backup", err, skipped.StatusCode(), http.StatusAccepted, skipped.Body)
		skippedRun := client.PollDatabaseBackupRun(skipped.JSON202.OperationRunId)
		if string(skippedRun.Outcome) != "skipped" {
			t.Fatalf("concurrent run outcome = %q, want skipped; error = %v", skippedRun.Outcome, skippedRun.Error)
		}

		backup.Release()
		run := client.PollDatabaseBackupRun(started.JSON202.OperationRunId)
		if string(run.Outcome) != "succeeded" {
			t.Fatalf("released run outcome = %q, want succeeded; error = %v", run.Outcome, run.Error)
		}
	})

	t.Run("running backup status shows running without terminal counters", func(t *testing.T) {
		backup := apptest.NewBlockedDatabaseBackup()
		client := newSharedClient(
			t,
			apptest.WithBackupFileDirectory(filepath.Join(t.TempDir(), "backups")),
			apptest.WithBlockedDatabaseBackup(backup),
		)

		started, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start blocking database backup", err, started.StatusCode(), http.StatusAccepted, started.Body)
		backup.WaitUntilStarted(t)

		status := client.DatabaseBackupStatus()
		if status.State != httpclient.DatabaseBackupStatusResponseStateRunning ||
			status.RunCount != 0 ||
			status.CompletedRunRevision != 0 {
			t.Fatalf("running status = %+v, want running with no terminal runs", status)
		}

		backup.Release()
		run := client.PollDatabaseBackupRun(started.JSON202.OperationRunId)
		if string(run.Outcome) != "succeeded" {
			t.Fatalf("released run outcome = %q, want succeeded; error = %v", run.Outcome, run.Error)
		}
	})

	t.Run("in-memory accounting backup fails with stable operation error", func(t *testing.T) {
		backupDir := filepath.Join(t.TempDir(), "backups")
		client := newSharedClient(t, apptest.WithBackupFileDirectory(backupDir))

		started, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start in-memory database backup", err, started.StatusCode(), http.StatusAccepted, started.Body)
		run := client.PollDatabaseBackupRun(started.JSON202.OperationRunId)
		if string(run.Outcome) != "failed" || run.Error == nil || *run.Error != "in-memory accounting database cannot be backed up" {
			t.Fatalf("in-memory failure run = %+v, want stable failed operation error", run)
		}
		if files := providerBackupFiles(t, backupDir); len(files) != 0 {
			t.Fatalf("failed backup files = %v, want no finalized backup files", files)
		}
		if files := providerTempBackupFiles(t, backupDir); len(files) != 0 {
			t.Fatalf("failed backup temp files = %v, want no leftover temp files", files)
		}
	})

	t.Run("retention prunes provider backups and leaves unrelated files untouched", func(t *testing.T) {
		dbPath := filepath.Join(t.TempDir(), "mina.duckdb")
		backupDir := filepath.Join(t.TempDir(), "backups")
		unrelated := filepath.Join(backupDir, "notes.txt")
		manualBackup := filepath.Join(backupDir, "mina-backup-manual.duckdb")
		if err := os.MkdirAll(backupDir, 0o755); err != nil {
			t.Fatalf("create backup dir: %v", err)
		}
		if err := os.WriteFile(unrelated, []byte("keep"), 0o644); err != nil {
			t.Fatalf("write unrelated file: %v", err)
		}
		if err := os.WriteFile(manualBackup, []byte("keep"), 0o644); err != nil {
			t.Fatalf("write manual backup file: %v", err)
		}
		client := newSharedClient(
			t,
			apptest.WithDatabasePath(dbPath),
			apptest.WithBackupFileDirectory(backupDir),
			apptest.WithBackupFileRetentionCount(2),
		)

		for range 3 {
			started, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
			requireClientResponse(t, "start retained database backup", err, started.StatusCode(), http.StatusAccepted, started.Body)
			run := client.PollDatabaseBackupRun(started.JSON202.OperationRunId)
			if string(run.Outcome) != "succeeded" {
				t.Fatalf("run outcome = %q, want succeeded; error = %v", run.Outcome, run.Error)
			}
		}

		if files := providerBackupFiles(t, backupDir); len(files) != 2 {
			t.Fatalf("provider backup files = %v, want 2 retained backups", files)
		}
		if _, err := os.Stat(unrelated); err != nil {
			t.Fatalf("unrelated file was not preserved: %v", err)
		}
		if _, err := os.Stat(manualBackup); err != nil {
			t.Fatalf("manual backup file was not preserved: %v", err)
		}
	})

	t.Run("retention preserves the just finalized backup when clock moves backward", func(t *testing.T) {
		clock := apptest.NewFakeClock(apptest.Timestamp("2026-04-01T12:00:00Z"))
		dbPath := filepath.Join(t.TempDir(), "mina.duckdb")
		backupDir := filepath.Join(t.TempDir(), "backups")
		existing := filepath.Join(backupDir, "mina-backup-20260402T120000000000000Z.duckdb")
		if err := os.MkdirAll(backupDir, 0o755); err != nil {
			t.Fatalf("create backup dir: %v", err)
		}
		if err := os.WriteFile(existing, []byte("older retained backup"), 0o644); err != nil {
			t.Fatalf("write existing backup file: %v", err)
		}
		client := newSharedClient(
			t,
			apptest.WithClock(clock),
			apptest.WithDatabasePath(dbPath),
			apptest.WithBackupFileDirectory(backupDir),
			apptest.WithBackupFileRetentionCount(1),
		)

		started, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start retained database backup", err, started.StatusCode(), http.StatusAccepted, started.Body)
		run := client.PollDatabaseBackupRun(started.JSON202.OperationRunId)
		if string(run.Outcome) != "succeeded" {
			t.Fatalf("run outcome = %q, want succeeded; error = %v", run.Outcome, run.Error)
		}

		current := filepath.Join(backupDir, "mina-backup-20260401T120000000000000Z.duckdb")
		if _, err := os.Stat(current); err != nil {
			t.Fatalf("current backup file was not preserved: %v", err)
		}
		if _, err := os.Stat(existing); !os.IsNotExist(err) {
			t.Fatalf("existing backup stat error = %v, want pruned file", err)
		}
	})

	t.Run("restored backup file can be opened through database runtime config", func(t *testing.T) {
		dbPath := filepath.Join(t.TempDir(), "mina.duckdb")
		backupDir := filepath.Join(t.TempDir(), "backups")
		client := newSharedClient(
			t,
			apptest.WithDatabasePath(dbPath),
			apptest.WithBackupFileDirectory(backupDir),
		)
		refs := client.Scenario().TransactionRefs()
		transaction := client.Scenario().BalancedTransaction(refs)

		started, err := client.REST().StartDatabaseBackupRunWithResponse(context.Background())
		requireClientResponse(t, "start database backup", err, started.StatusCode(), http.StatusAccepted, started.Body)
		run := client.PollDatabaseBackupRun(started.JSON202.OperationRunId)
		if string(run.Outcome) != "succeeded" {
			t.Fatalf("run outcome = %q, want succeeded; error = %v", run.Outcome, run.Error)
		}
		files := providerBackupFiles(t, backupDir)
		if len(files) != 1 {
			t.Fatalf("backup files = %v, want one backup", files)
		}
		client.Close()

		restored := newSharedClient(t, apptest.WithDatabasePath(filepath.Join(backupDir, files[0])))
		health, err := restored.REST().GetHealthWithResponse(context.Background())
		requireClientResponse(t, "get health from restored backup", err, health.StatusCode(), http.StatusOK, health.Body)

		accounts, err := restored.REST().ListAccountsWithResponse(context.Background(), nil)
		requireClientResponse(t, "list restored accounts", err, accounts.StatusCode(), http.StatusOK, accounts.Body)
		if !hasAccountFQN(accounts.JSON200.Accounts, "checking:Chase:Primary") || !hasAccountFQN(accounts.JSON200.Accounts, "expense:Merchant") {
			t.Fatalf("restored accounts = %+v, want fixture accounts", accounts.JSON200.Accounts)
		}

		transactions, err := restored.REST().ListTransactionsWithResponse(context.Background(), nil)
		requireClientResponse(t, "list restored transactions", err, transactions.StatusCode(), http.StatusOK, transactions.Body)
		if len(transactions.JSON200.Transactions) != 1 ||
			transactions.JSON200.Transactions[0].TransactionId != transaction.TransactionId ||
			len(transactions.JSON200.Transactions[0].Records) != 2 {
			t.Fatalf("restored transactions = %+v, want copied transaction %d with two records", transactions.JSON200.Transactions, transaction.TransactionId)
		}

		records, err := restored.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
			MemoContains: apptest.StringPtr("Lunch"),
		})
		requireClientResponse(t, "search restored journal records", err, records.StatusCode(), http.StatusOK, records.Body)
		if len(records.JSON200.Records) != 1 ||
			records.JSON200.Records[0].TransactionId != transaction.TransactionId ||
			records.JSON200.Records[0].AccountId != refs.CheckingAccountID {
			t.Fatalf("restored memo records = %+v, want copied checking record for transaction %d", records.JSON200.Records, transaction.TransactionId)
		}
	})

	t.Run("empty schedule does not create automatic runs when operations are enabled", func(t *testing.T) {
		clock := apptest.NewFakeClock(apptest.Timestamp("2026-04-02T17:59:00Z"))
		client := newSharedClient(
			t,
			apptest.WithClock(clock),
			apptest.WithOperationsEnabled(true),
			apptest.WithBackupFileDirectory(filepath.Join(t.TempDir(), "backups")),
			apptest.WithBackupFileScheduleUTC(""),
		)

		clock.Advance(2 * time.Minute)
		status := client.DatabaseBackupStatus()
		if status.RunCount != 0 || status.CompletedRunRevision != 0 {
			t.Fatalf("empty-schedule status = %+v, want no automatic runs", status)
		}
	})

	t.Run("non-empty schedule creates recurring runs under fake clock", func(t *testing.T) {
		clock := apptest.NewFakeClock(apptest.Timestamp("2026-04-02T17:59:00Z"))
		backupDir := filepath.Join(t.TempDir(), "backups")
		client := newSharedClient(
			t,
			apptest.WithClock(clock),
			apptest.WithOperationsEnabled(true),
			apptest.WithDatabasePath(filepath.Join(t.TempDir(), "mina.duckdb")),
			apptest.WithBackupFileDirectory(backupDir),
			apptest.WithBackupFileScheduleUTC("0 18 * * *"),
		)

		before := client.DatabaseBackupStatus()
		clock.Advance(time.Minute)
		after := client.PollDatabaseBackupStatusRevision(before.CompletedRunRevision + 1)
		if after.LastSuccess == nil || !*after.LastSuccess {
			t.Fatalf("scheduled status = %+v, want successful recurring run", after)
		}
		requireLatestRunEnvelopeTrigger(t, client, httpclient.BackgroundOperationIdDatabaseBackup, httpclient.BackgroundOperationRunTriggerBackgroundOperationRunTriggerScheduled)
		if len(backupFiles(t, backupDir)) != 1 {
			t.Fatalf("scheduled backup files = %v, want one backup", backupFiles(t, backupDir))
		}
	})
}

func backupFiles(t *testing.T, dir string) []string {
	t.Helper()

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read backup dir: %v", err)
	}
	var files []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		files = append(files, entry.Name())
	}

	return files
}

func providerBackupFiles(t *testing.T, dir string) []string {
	t.Helper()

	var files []string
	for _, file := range backupFiles(t, dir) {
		if isProviderBackupFileName(file) {
			files = append(files, file)
		}
	}

	return files
}

func providerTempBackupFiles(t *testing.T, dir string) []string {
	t.Helper()

	var files []string
	for _, file := range backupFiles(t, dir) {
		if isProviderTempBackupFileName(file) {
			files = append(files, file)
		}
	}

	return files
}

func isProviderBackupFileName(file string) bool {
	if !strings.HasPrefix(file, "mina-backup-") || !strings.HasSuffix(file, ".duckdb") {
		return false
	}

	timestamp := strings.TrimSuffix(strings.TrimPrefix(file, "mina-backup-"), ".duckdb")
	if len(timestamp) != len("20060102T150405000000000Z") ||
		timestamp[8] != 'T' ||
		timestamp[24] != 'Z' {
		return false
	}

	for _, char := range timestamp[:8] + timestamp[9:24] {
		if char < '0' || char > '9' {
			return false
		}
	}

	return true
}

func isProviderTempBackupFileName(file string) bool {
	return strings.HasPrefix(file, ".mina-backup-") &&
		strings.Contains(file, ".duckdb.tmp-")
}

func hasAccountFQN(accounts []httpclient.Account, fqn string) bool {
	for _, account := range accounts {
		if account.Fqn == fqn {
			return true
		}
	}

	return false
}
