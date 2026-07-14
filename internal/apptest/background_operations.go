package apptest

import (
	"context"
	"net/http"
	"time"

	"github.com/mishamsk/mina/internal/httpclient"
)

// ExchangeRateLoadingStatus returns the public exchange-rate loading status.
func (c *Client) ExchangeRateLoadingStatus() *httpclient.ExchangeRateLoadingStatusResponse {
	c.t.Helper()

	response, err := c.REST().GetExchangeRateLoadingStatusWithResponse(context.Background())
	requireNoClientError(c, "get exchange-rate loading status", err)
	requireStatus(c, "get exchange-rate loading status", response.StatusCode(), http.StatusOK, response.Body)

	return response.JSON200
}

// PollExchangeRateLoadingStatusRevision waits for a terminal-run revision through the public REST API.
func (c *Client) PollExchangeRateLoadingStatusRevision(revision int64) *httpclient.ExchangeRateLoadingStatusResponse {
	c.t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for {
		status := c.ExchangeRateLoadingStatus()
		if status.CompletedRunRevision >= revision {
			return status
		}
		if time.Now().After(deadline) {
			c.t.Fatalf(
				"completed_run_revision = %d, want at least %d; status = %+v",
				status.CompletedRunRevision,
				revision,
				status,
			)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// PollExchangeRateLoadingRun waits for a concrete operation run through the public REST API.
func (c *Client) PollExchangeRateLoadingRun(runID int64) *httpclient.ExchangeRateLoadingRun {
	c.t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for {
		response, err := c.REST().GetExchangeRateLoadingRunWithResponse(context.Background(), runID)
		requireNoClientError(c, "get exchange-rate loading run", err)
		requireStatus(c, "get exchange-rate loading run", response.StatusCode(), http.StatusOK, response.Body)
		if string(response.JSON200.Outcome) != "running" {
			return response.JSON200
		}
		if time.Now().After(deadline) {
			c.t.Fatalf("run %d did not complete; run = %+v", runID, response.JSON200)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// DatabaseBackupStatus returns the public database backup status.
func (c *Client) DatabaseBackupStatus() *httpclient.DatabaseBackupStatusResponse {
	c.t.Helper()

	response, err := c.REST().GetDatabaseBackupStatusWithResponse(context.Background())
	requireNoClientError(c, "get database backup status", err)
	requireStatus(c, "get database backup status", response.StatusCode(), http.StatusOK, response.Body)

	return response.JSON200
}

// PollDatabaseBackupStatusRevision waits for a terminal-run revision through the public REST API.
func (c *Client) PollDatabaseBackupStatusRevision(revision int64) *httpclient.DatabaseBackupStatusResponse {
	c.t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for {
		status := c.DatabaseBackupStatus()
		if status.CompletedRunRevision >= revision {
			return status
		}
		if time.Now().After(deadline) {
			c.t.Fatalf(
				"completed_run_revision = %d, want at least %d; status = %+v",
				status.CompletedRunRevision,
				revision,
				status,
			)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// PollDatabaseBackupRun waits for a concrete operation run through the public REST API.
func (c *Client) PollDatabaseBackupRun(runID int64) *httpclient.DatabaseBackupRun {
	c.t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for {
		response, err := c.REST().GetDatabaseBackupRunWithResponse(context.Background(), runID)
		requireNoClientError(c, "get database backup run", err)
		requireStatus(c, "get database backup run", response.StatusCode(), http.StatusOK, response.Body)
		if string(response.JSON200.Outcome) != "running" {
			return response.JSON200
		}
		if time.Now().After(deadline) {
			c.t.Fatalf("run %d did not complete; run = %+v", runID, response.JSON200)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
