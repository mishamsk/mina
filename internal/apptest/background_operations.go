package apptest

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/mishamsk/mina/internal/httpclient"
)

// ExchangeRateLoadingStatus returns the public exchange-rate loading status.
func (c *Client) ExchangeRateLoadingStatus() *httpclient.ExchangeRateLoadingStatusResponse {
	c.t.Helper()
	return c.exchangeRateLoadingStatus(context.Background())
}

func (c *Client) exchangeRateLoadingStatus(ctx context.Context) *httpclient.ExchangeRateLoadingStatusResponse {
	response, err := c.REST().GetExchangeRateLoadingStatusWithResponse(ctx)
	requireNoClientError(c, "get exchange-rate loading status", err)
	requireStatus(c, "get exchange-rate loading status", response.StatusCode(), http.StatusOK, response.Body)

	return response.JSON200
}

// PollExchangeRateLoadingStatusRevision waits for a terminal-run revision through the public REST API.
func (c *Client) PollExchangeRateLoadingStatusRevision(revision int64) *httpclient.ExchangeRateLoadingStatusResponse {
	c.t.Helper()

	return awaitCondition(c.t, fmt.Sprintf("exchange-rate loading revision %d", revision), func(ctx context.Context) (*httpclient.ExchangeRateLoadingStatusResponse, bool) {
		status := c.exchangeRateLoadingStatus(ctx)
		return status, status.CompletedRunRevision >= revision
	})
}

// PollExchangeRateLoadingRun waits for a concrete operation run through the public REST API.
func (c *Client) PollExchangeRateLoadingRun(runID int64) *httpclient.ExchangeRateLoadingRun {
	c.t.Helper()

	return awaitCondition(c.t, fmt.Sprintf("exchange-rate loading run %d", runID), func(ctx context.Context) (*httpclient.ExchangeRateLoadingRun, bool) {
		response, err := c.REST().GetExchangeRateLoadingRunWithResponse(ctx, runID)
		requireNoClientError(c, "get exchange-rate loading run", err)
		requireStatus(c, "get exchange-rate loading run", response.StatusCode(), http.StatusOK, response.Body)
		return response.JSON200, response.JSON200.Outcome != httpclient.BackgroundOperationRunOutcomeRunning
	})
}

// DatabaseBackupStatus returns the public database backup status.
func (c *Client) DatabaseBackupStatus() *httpclient.DatabaseBackupStatusResponse {
	c.t.Helper()
	return c.databaseBackupStatus(context.Background())
}

func (c *Client) databaseBackupStatus(ctx context.Context) *httpclient.DatabaseBackupStatusResponse {
	response, err := c.REST().GetDatabaseBackupStatusWithResponse(ctx)
	requireNoClientError(c, "get database backup status", err)
	requireStatus(c, "get database backup status", response.StatusCode(), http.StatusOK, response.Body)

	return response.JSON200
}

// PollDatabaseBackupStatusRevision waits for a terminal-run revision through the public REST API.
func (c *Client) PollDatabaseBackupStatusRevision(revision int64) *httpclient.DatabaseBackupStatusResponse {
	c.t.Helper()

	return awaitCondition(c.t, fmt.Sprintf("database backup revision %d", revision), func(ctx context.Context) (*httpclient.DatabaseBackupStatusResponse, bool) {
		status := c.databaseBackupStatus(ctx)
		return status, status.CompletedRunRevision >= revision
	})
}

// PollDatabaseBackupRun waits for a concrete operation run through the public REST API.
func (c *Client) PollDatabaseBackupRun(runID int64) *httpclient.DatabaseBackupRun {
	c.t.Helper()

	return awaitCondition(c.t, fmt.Sprintf("database backup run %d", runID), func(ctx context.Context) (*httpclient.DatabaseBackupRun, bool) {
		response, err := c.REST().GetDatabaseBackupRunWithResponse(ctx, runID)
		requireNoClientError(c, "get database backup run", err)
		requireStatus(c, "get database backup run", response.StatusCode(), http.StatusOK, response.Body)
		return response.JSON200, response.JSON200.Outcome != httpclient.BackgroundOperationRunOutcomeRunning
	})
}

// AuditLogCompactionStatus returns the public API audit-log compaction status.
func (c *Client) AuditLogCompactionStatus() *httpclient.AuditLogCompactionStatusResponse {
	c.t.Helper()
	return c.auditLogCompactionStatus(context.Background())
}

func (c *Client) auditLogCompactionStatus(ctx context.Context) *httpclient.AuditLogCompactionStatusResponse {
	response, err := c.REST().GetAuditLogCompactionStatusWithResponse(ctx)
	requireNoClientError(c, "get API audit-log compaction status", err)
	requireStatus(c, "get API audit-log compaction status", response.StatusCode(), http.StatusOK, response.Body)

	return response.JSON200
}

// AwaitAuditLogCompactionStatusRevision waits for a terminal compaction revision through REST.
func (c *Client) AwaitAuditLogCompactionStatusRevision(revision int64) *httpclient.AuditLogCompactionStatusResponse {
	c.t.Helper()

	return awaitCondition(c.t, fmt.Sprintf("audit-log compaction revision %d", revision), func(ctx context.Context) (*httpclient.AuditLogCompactionStatusResponse, bool) {
		status := c.auditLogCompactionStatus(ctx)
		return status, status.CompletedRunRevision >= revision
	})
}

// AwaitAuditLogCompactionRun waits for a concrete compaction run through REST.
func (c *Client) AwaitAuditLogCompactionRun(runID int64) *httpclient.AuditLogCompactionRun {
	c.t.Helper()

	return awaitCondition(c.t, fmt.Sprintf("audit-log compaction run %d", runID), func(ctx context.Context) (*httpclient.AuditLogCompactionRun, bool) {
		response, err := c.REST().GetAuditLogCompactionRunWithResponse(ctx, runID)
		requireNoClientError(c, "get API audit-log compaction run", err)
		requireStatus(c, "get API audit-log compaction run", response.StatusCode(), http.StatusOK, response.Body)
		return response.JSON200, response.JSON200.Outcome != httpclient.BackgroundOperationRunOutcomeRunning
	})
}

// AwaitBackgroundOperationRun waits for an exact terminal run envelope through REST.
func (c *Client) AwaitBackgroundOperationRun(
	operationID httpclient.BackgroundOperationId,
	trigger httpclient.BackgroundOperationRunTrigger,
	outcome httpclient.BackgroundOperationRunOutcome,
	startedAt time.Time,
) *httpclient.BackgroundOperationRun {
	c.t.Helper()

	return awaitCondition(c.t, fmt.Sprintf("%s %s run at %s", operationID, trigger, startedAt.Format(time.RFC3339Nano)), func(ctx context.Context) (*httpclient.BackgroundOperationRun, bool) {
		limit := 500
		response, err := c.REST().ListBackgroundOperationRunEnvelopesWithResponse(
			ctx,
			&httpclient.ListBackgroundOperationRunEnvelopesParams{OperationId: &operationID, Limit: &limit},
		)
		requireNoClientError(c, "list background-operation runs", err)
		requireStatus(c, "list background-operation runs", response.StatusCode(), http.StatusOK, response.Body)
		for index := range response.JSON200.Runs {
			run := &response.JSON200.Runs[index]
			if run.Trigger == trigger && run.Outcome == outcome && run.StartedAt.Equal(startedAt) {
				return run, true
			}
		}
		return nil, false
	})
}

// AwaitDailyExchangeRateCount waits for the exact visible daily-rate count through REST.
func (c *Client) AwaitDailyExchangeRateCount(count int) *httpclient.ListDailyExchangeRatesResponse {
	c.t.Helper()

	return awaitCondition(c.t, fmt.Sprintf("%d daily exchange rates", count), func(ctx context.Context) (*httpclient.ListDailyExchangeRatesResponse, bool) {
		response, err := c.REST().ListDailyExchangeRatesWithResponse(ctx, nil)
		requireNoClientError(c, "list daily exchange rates", err)
		requireStatus(c, "list daily exchange rates", response.StatusCode(), http.StatusOK, response.Body)
		return response, len(response.JSON200.ExchangeRates) == count
	})
}
