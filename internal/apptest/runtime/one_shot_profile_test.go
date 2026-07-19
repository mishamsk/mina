package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestOneShotExecutionProfilePolicy(t *testing.T) {
	provider := apptest.NewFakeExchangeRateProvider()
	client := newSharedClient(
		t,
		apptest.WithOneShotExecutionProfile(),
		apptest.WithOperationsEnabled(true),
		apptest.WithExchangeRateLoading(true),
		apptest.WithExchangeRateProviderFactory(provider),
	)

	status := client.ExchangeRateLoadingStatus()
	if !status.Enabled || status.RunCount != 0 || status.CompletedRunRevision != 0 {
		t.Fatalf("initial one-shot status = %+v, want enabled operation with no automatic runs", status)
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

	created, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{Name: "Alex"})
	requireClientResponse(t, "create member through one-shot app", err, created.StatusCode(), http.StatusCreated, created.Body)
	listed, err := client.REST().ListMembersWithResponse(context.Background(), nil)
	requireClientResponse(t, "list members through one-shot app", err, listed.StatusCode(), http.StatusOK, listed.Body)
	if len(listed.JSON200.Members) != 1 || listed.JSON200.Members[0].MemberId != created.JSON201.MemberId {
		t.Fatalf("one-shot members = %+v, want created member %d", listed.JSON200.Members, created.JSON201.MemberId)
	}
}
