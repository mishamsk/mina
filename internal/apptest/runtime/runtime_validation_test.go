package runtime_test

import (
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestRuntimeValidationExpectedBehavior(t *testing.T) {
	t.Run("impossible recurring schedule does not synthesize a fallback run", func(t *testing.T) {
		clock := apptest.NewFakeClock(apptest.Timestamp("2026-01-01T00:00:00Z"))
		client := newSharedClient(
			t,
			apptest.WithClock(clock),
			apptest.WithOperationsEnabled(true),
			apptest.WithExchangeRateLoading(true),
			apptest.WithExchangeRateLoadScheduleUTC("0 0 31 2 *"),
			apptest.WithExchangeRateProviderFactory(apptest.NewFakeExchangeRateProvider()),
		)

		startup := client.PollExchangeRateLoadingStatusRevision(1)
		clock.Advance(9 * 366 * 24 * time.Hour)
		requireStableExchangeRateLoadingStatus(t, client, startup.RunCount, startup.CompletedRunRevision, 1200*time.Millisecond)
	})
}

func requireStableExchangeRateLoadingStatus(
	t *testing.T,
	client *apptest.Client,
	wantRunCount int64,
	wantCompletedRunRevision int64,
	stableFor time.Duration,
) {
	t.Helper()

	deadline := time.Now().Add(stableFor)
	for time.Now().Before(deadline) {
		status := client.ExchangeRateLoadingStatus()
		if status.State != httpclient.ExchangeRateLoadingStatusResponseStateIdle ||
			status.RunCount != wantRunCount ||
			status.CompletedRunRevision != wantCompletedRunRevision {
			t.Fatalf(
				"exchange-rate loading status = %+v, want idle with run counters %d/%d",
				status,
				wantRunCount,
				wantCompletedRunRevision,
			)
		}
		time.Sleep(25 * time.Millisecond)
	}
}
