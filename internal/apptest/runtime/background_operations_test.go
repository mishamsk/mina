package runtime_test

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	goruntime "runtime"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestBackgroundOperationExpectedBehavior(t *testing.T) {
	t.Run("status exposes process state fields", func(t *testing.T) {
		client := newSharedClient(t, apptest.WithExchangeRateLoading(true), apptest.WithExchangeRateLoadScheduleUTC("5 18 * * *"))

		response, err := client.REST().GetExchangeRateLoadingStatusWithResponse(context.Background())
		requireClientResponse(t, "get exchange-rate loading status", err, response.StatusCode(), http.StatusOK, response.Body)

		status := response.JSON200
		if !status.Enabled {
			t.Fatal("enabled = false, want true")
		}
		if status.ScheduleUtc != "5 18 * * *" {
			t.Fatalf("schedule_utc = %q, want %q", status.ScheduleUtc, "5 18 * * *")
		}
		if status.State != httpclient.ExchangeRateLoadingStatusResponseStateIdle {
			t.Fatalf("state = %q, want idle", status.State)
		}
		if status.LastStartedAt != nil || status.LastCompletedAt != nil || status.LastSuccess != nil || status.LastError != nil {
			t.Fatalf("initial terminal fields = started:%v completed:%v success:%v error:%v, want nils", status.LastStartedAt, status.LastCompletedAt, status.LastSuccess, status.LastError)
		}
		if status.RunCount != 0 || status.CompletedRunRevision != 0 {
			t.Fatalf("run counters = %d/%d, want 0/0", status.RunCount, status.CompletedRunRevision)
		}
	})

	t.Run("manual trigger records asynchronous invocation", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-03-31", "1.09000000")
		client := newSharedClient(
			t,
			apptest.WithExchangeRateLoading(false),
			apptest.WithExchangeRateProviderFactory(provider),
		)
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-04-01T12:00:00Z"),
		})

		started, err := client.REST().StartExchangeRateLoadingRunWithResponse(context.Background())
		requireClientResponse(t, "start exchange-rate loading run", err, started.StatusCode(), http.StatusAccepted, started.Body)
		if started.JSON202.OperationRunId <= 0 {
			t.Fatalf("operation_run_id = %d, want positive generated id", started.JSON202.OperationRunId)
		}
		wantStatusURL := fmt.Sprintf("/background-operations/exchange-rate-loading/runs/%d", started.JSON202.OperationRunId)
		if started.JSON202.StatusUrl != wantStatusURL {
			t.Fatalf("status_url = %q, want %q", started.JSON202.StatusUrl, wantStatusURL)
		}

		run := client.PollExchangeRateLoadingRun(started.JSON202.OperationRunId)
		if run.Status != httpclient.OperationRunResponseStatusSucceeded {
			t.Fatalf("run status = %q, want succeeded; error = %v", run.Status, run.Error)
		}
		status := client.ExchangeRateLoadingStatus()
		if status.RunCount != 1 || status.CompletedRunRevision != 1 || status.LastSuccess == nil || !*status.LastSuccess {
			t.Fatalf("status after trigger = %+v, want one successful completed run", status)
		}
	})

	t.Run("manual trigger exposes running state until provider completes", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-03-31", "1.09000000")
		provider.BlockUntilReleased()
		client := newSharedClient(
			t,
			apptest.WithExchangeRateLoading(false),
			apptest.WithExchangeRateProviderFactory(provider),
		)
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-03-31T12:00:00Z"),
		})

		started, err := client.REST().StartExchangeRateLoadingRunWithResponse(context.Background())
		requireClientResponse(t, "start exchange-rate loading run", err, started.StatusCode(), http.StatusAccepted, started.Body)
		provider.WaitUntilBlocked(t)

		runResponse, err := client.REST().GetExchangeRateLoadingRunWithResponse(
			context.Background(),
			started.JSON202.OperationRunId,
		)
		requireClientResponse(t, "get running exchange-rate loading run", err, runResponse.StatusCode(), http.StatusOK, runResponse.Body)
		if runResponse.JSON200.Status != httpclient.OperationRunResponseStatusRunning || runResponse.JSON200.CompletedAt != nil {
			t.Fatalf("running run = %+v, want running with no completed_at", runResponse.JSON200)
		}

		status := client.ExchangeRateLoadingStatus()
		if status.State != httpclient.ExchangeRateLoadingStatusResponseStateRunning ||
			status.RunCount != 0 ||
			status.CompletedRunRevision != 0 {
			t.Fatalf("running status = %+v, want running with no terminal runs", status)
		}

		skipped, err := client.REST().StartExchangeRateLoadingRunWithResponse(context.Background())
		requireClientResponse(t, "start concurrent exchange-rate loading run", err, skipped.StatusCode(), http.StatusAccepted, skipped.Body)
		skippedRun := client.PollExchangeRateLoadingRun(skipped.JSON202.OperationRunId)
		if skippedRun.Status != httpclient.OperationRunResponseStatusSkipped {
			t.Fatalf("concurrent run status = %q, want skipped; error = %v", skippedRun.Status, skippedRun.Error)
		}

		provider.Release()
		run := client.PollExchangeRateLoadingRun(started.JSON202.OperationRunId)
		if run.Status != httpclient.OperationRunResponseStatusSucceeded {
			t.Fatalf("released run status = %q, want succeeded; error = %v", run.Status, run.Error)
		}
	})

	t.Run("startup load completes when enabled", func(t *testing.T) {
		schema := fmt.Sprintf("startup_exchange_rate_loading_fixture_%d", time.Now().UnixNano())
		cacheDir := filepath.Join(t.TempDir(), "mina")
		installFrankfurterCacheFixture(t, cacheDir)
		clock := apptest.NewFakeClock(apptest.Timestamp("2026-04-01T12:00:00Z"))
		setup := newSharedClient(
			t,
			apptest.WithAccountingSchema(schema),
			apptest.WithClock(clock),
			apptest.WithExchangeRateLoading(false),
		)
		createForeignCurrencyTransaction(t, setup, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-04-01T12:00:00Z"),
		})
		setup.Close()

		client := newSharedClient(
			t,
			apptest.WithAccountingSchema(schema),
			apptest.WithCacheDir(cacheDir),
			apptest.WithClock(clock),
			apptest.WithOperationsEnabled(true),
			apptest.WithExchangeRateLoading(true),
		)
		status := client.PollExchangeRateLoadingStatusRevision(1)
		if status.LastSuccess == nil || !*status.LastSuccess {
			t.Fatalf("startup status = %+v, want successful startup run", status)
		}
		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-04-01")
	})

	t.Run("startup provider failure is observable and REST remains usable", func(t *testing.T) {
		schema := fmt.Sprintf("startup_exchange_rate_loading_failure_fixture_%d", time.Now().UnixNano())
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Fail("provider unavailable")
		setup := newSharedClient(
			t,
			apptest.WithAccountingSchema(schema),
			apptest.WithExchangeRateLoading(false),
			apptest.WithExchangeRateProviderFactory(provider),
		)
		createForeignCurrencyTransaction(t, setup, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-04-01T12:00:00Z"),
		})
		setup.Close()

		client := newSharedClient(
			t,
			apptest.WithAccountingSchema(schema),
			apptest.WithOperationsEnabled(true),
			apptest.WithExchangeRateLoading(true),
			apptest.WithExchangeRateProviderFactory(provider),
		)
		status := client.PollExchangeRateLoadingStatusRevision(1)
		if status.LastSuccess == nil || *status.LastSuccess || status.LastError == nil {
			t.Fatalf("startup failure status = %+v, want failed startup run", status)
		}

		created, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
			FromCurrency:  "USD",
			ToCurrency:    "EUR",
			Rate:          "1.09000000",
			EffectiveDate: apptest.Timestamp("2026-03-31T00:00:00Z"),
		})
		requireClientResponse(t, "create exchange rate after startup loader failure", err, created.StatusCode(), http.StatusCreated, created.Body)
	})

	t.Run("recurring load follows fake-clock cron schedule", func(t *testing.T) {
		clock := apptest.NewFakeClock(apptest.Timestamp("2026-04-02T17:59:00Z"))
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-04-01", "1.09000000")
		client := newSharedClient(
			t,
			apptest.WithClock(clock),
			apptest.WithOperationsEnabled(true),
			apptest.WithExchangeRateLoading(true),
			apptest.WithExchangeRateLoadScheduleUTC("0 18 * * *"),
			apptest.WithExchangeRateProviderFactory(provider),
		)
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-04-01",
			PostedAt:      apptest.TimestampPtr("2026-04-01T12:00:00Z"),
		})

		before := client.ExchangeRateLoadingStatus()
		clock.Advance(time.Minute)
		after := client.PollExchangeRateLoadingStatusRevision(before.CompletedRunRevision + 1)
		if after.LastStartedAt == nil || after.LastStartedAt.Before(apptest.Timestamp("2026-04-02T18:00:00Z")) {
			t.Fatalf("last_started_at = %v, want scheduled fake-clock time", after.LastStartedAt)
		}
		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-04-01")
	})

	t.Run("disabled automatic loading skips startup and recurring runs", func(t *testing.T) {
		clock := apptest.NewFakeClock(apptest.Timestamp("2026-04-02T17:59:00Z"))
		provider := apptest.NewFakeExchangeRateProvider()
		client := newSharedClient(
			t,
			apptest.WithClock(clock),
			apptest.WithOperationsEnabled(true),
			apptest.WithExchangeRateLoading(false),
			apptest.WithExchangeRateLoadScheduleUTC("0 18 * * *"),
			apptest.WithExchangeRateProviderFactory(provider),
		)

		clock.Advance(2 * time.Minute)
		status := client.ExchangeRateLoadingStatus()
		if status.RunCount != 0 || status.CompletedRunRevision != 0 {
			t.Fatalf("disabled status = %+v, want no automatic runs", status)
		}
	})

	t.Run("provider failure is observable and regular exchange-rate CRUD still works", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Fail("provider unavailable")
		client := newSharedClient(
			t,
			apptest.WithExchangeRateLoading(false),
			apptest.WithExchangeRateProviderFactory(provider),
		)
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-04-01T12:00:00Z"),
		})

		started, err := client.REST().StartExchangeRateLoadingRunWithResponse(context.Background())
		requireClientResponse(t, "start failing exchange-rate loading run", err, started.StatusCode(), http.StatusAccepted, started.Body)
		status := client.PollExchangeRateLoadingStatusRevision(1)
		if status.LastSuccess == nil || *status.LastSuccess || status.LastError == nil {
			t.Fatalf("failure status = %+v, want visible failure", status)
		}
		run := client.PollExchangeRateLoadingRun(started.JSON202.OperationRunId)
		if run.Status != httpclient.OperationRunResponseStatusFailed || run.Error == nil || *run.Error != "provider unavailable" {
			t.Fatalf("failure run = %+v, want failed run with provider error", run)
		}

		created, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
			FromCurrency:  "USD",
			ToCurrency:    "EUR",
			Rate:          "1.09000000",
			EffectiveDate: apptest.Timestamp("2026-03-31T00:00:00Z"),
		})
		requireClientResponse(t, "create exchange rate after loader failure", err, created.StatusCode(), http.StatusCreated, created.Body)
	})

	t.Run("transient provider failure is observable", func(t *testing.T) {
		provider := apptest.NewUnavailableExchangeRateProvider()
		client := newSharedClient(
			t,
			apptest.WithExchangeRateLoading(false),
			apptest.WithExchangeRateProviderFactory(provider),
		)
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-04-01T12:00:00Z"),
		})

		started, err := client.REST().StartExchangeRateLoadingRunWithResponse(context.Background())
		requireClientResponse(t, "start transient failing exchange-rate loading run", err, started.StatusCode(), http.StatusAccepted, started.Body)
		run := client.PollExchangeRateLoadingRun(started.JSON202.OperationRunId)
		if run.Status != httpclient.OperationRunResponseStatusFailed {
			t.Fatalf("transient failure run status = %q, want failed; error = %v", run.Status, run.Error)
		}
		if run.Error == nil || *run.Error != "exchange-rate provider unavailable" {
			t.Fatalf("transient failure run error = %v, want provider unavailable", run.Error)
		}
	})
}

func installFrankfurterCacheFixture(t *testing.T, cacheDir string) string {
	t.Helper()

	cachePath := filepath.Join(cacheDir, "frankfurter-usd-rates.ndjson")
	fixture, err := os.ReadFile(frankfurterCacheFixturePath(t))
	if err != nil {
		t.Fatalf("read Frankfurter cache fixture: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(cachePath), 0o755); err != nil {
		t.Fatalf("create Frankfurter cache fixture dir: %v", err)
	}
	if err := os.WriteFile(cachePath, fixture, 0o644); err != nil {
		t.Fatalf("write Frankfurter cache fixture: %v", err)
	}

	return cachePath
}

func frankfurterCacheFixturePath(t *testing.T) string {
	t.Helper()

	_, file, _, ok := goruntime.Caller(0)
	if !ok {
		t.Fatal("resolve test file path")
	}

	return filepath.Join(filepath.Dir(file), "..", "testdata", "frankfurter-usd-rates.ndjson")
}

func requireClientResponse(t *testing.T, label string, err error, got int, want int, body []byte) {
	t.Helper()

	if err != nil {
		t.Fatalf("%s request: %v", label, err)
	}
	if got != want {
		t.Fatalf("%s status = %d, want %d; body %s", label, got, want, body)
	}
}
