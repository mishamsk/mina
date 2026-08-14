package runtime_test

import (
	"strings"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestRuntimeValidationExpectedBehavior(t *testing.T) {
	t.Run("empty database encryption key fails runtime composition", func(t *testing.T) {
		_, err := apptest.NewResult(t, apptest.WithDatabaseEncryptionKey(""))
		if err == nil || !strings.Contains(err.Error(), "MINA_DATABASE_ENCRYPTION_KEY must not be empty") {
			t.Fatalf("runtime composition error = %v, want empty database encryption key failure", err)
		}
	})

	t.Run("invalid enabled exchange-rate schedule fails runtime composition", func(t *testing.T) {
		_, err := apptest.NewResult(
			t,
			apptest.WithOperationsEnabled(true),
			apptest.WithExchangeRateLoading(true),
			apptest.WithExchangeRateLoadScheduleUTC("not-a-schedule"),
		)
		if err == nil || !strings.Contains(err.Error(), "exchange-rate load schedule") {
			t.Fatalf("runtime composition error = %v, want exchange-rate schedule validation failure", err)
		}
	})

	t.Run("unsupported startup provider fails runtime composition", func(t *testing.T) {
		_, err := apptest.NewResult(
			t,
			apptest.WithOperationsEnabled(true),
			apptest.WithExchangeRateLoading(true),
			apptest.WithExchangeRateStartupProvider("unsupported"),
		)
		if err == nil || !strings.Contains(err.Error(), "exchange-rate startup provider") {
			t.Fatalf("runtime composition error = %v, want startup provider validation failure", err)
		}
	})

	for _, retention := range []int{0, -1} {
		t.Run("non-positive audit-log retention fails runtime composition", func(t *testing.T) {
			_, err := apptest.NewResult(t, apptest.WithAuditLogRetentionMonths(retention))
			if err == nil || !strings.Contains(err.Error(), "audit-log retention months must be positive") {
				t.Fatalf("runtime composition error = %v, want positive audit-log retention failure", err)
			}
		})
	}

	t.Run("invalid audit-log compaction schedule fails runtime composition", func(t *testing.T) {
		_, err := apptest.NewResult(
			t,
			apptest.WithOperationsEnabled(true),
			apptest.WithAuditLogCompactionScheduleUTC("not-a-schedule"),
		)
		if err == nil || !strings.Contains(err.Error(), "audit-log compaction schedule") {
			t.Fatalf("runtime composition error = %v, want audit-log schedule validation failure", err)
		}
	})

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
		status := client.ExchangeRateLoadingStatus()
		if status.State != httpclient.ExchangeRateLoadingStatusResponseStateIdle || status.RunCount != startup.RunCount || status.CompletedRunRevision != startup.CompletedRunRevision {
			t.Fatalf(
				"exchange-rate loading status = %+v, want unchanged idle run counters %d/%d",
				status,
				startup.RunCount,
				startup.CompletedRunRevision,
			)
		}
	})
}
