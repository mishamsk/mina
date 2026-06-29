package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/httpclient"
)

func TestAppTestClientIsolatesClientState(t *testing.T) {
	t.Run("first test", func(t *testing.T) {
		client := newSharedClient(t)

		created, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{
			Name: "Alex",
		})
		if err != nil {
			t.Fatalf("create request: %v", err)
		}
		if created.StatusCode() != http.StatusCreated {
			t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
		}

		list, err := client.REST().ListMembersWithResponse(context.Background(), nil)
		if err != nil {
			t.Fatalf("list request: %v", err)
		}
		if list.StatusCode() != http.StatusOK {
			t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
		}
		if len(list.JSON200.Members) != 1 || list.JSON200.Members[0].MemberId != created.JSON201.MemberId {
			t.Fatalf("members = %+v, want created member %d", list.JSON200.Members, created.JSON201.MemberId)
		}
	})

	t.Run("second test", func(t *testing.T) {
		client := newSharedClient(t)

		list, err := client.REST().ListMembersWithResponse(context.Background(), nil)
		if err != nil {
			t.Fatalf("list request: %v", err)
		}
		if list.StatusCode() != http.StatusOK {
			t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
		}
		if len(list.JSON200.Members) != 0 {
			t.Fatalf("member count = %d, want 0; body %+v", len(list.JSON200.Members), list.JSON200)
		}
	})
}

func TestScenarioCreatesFixturesThroughClient(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()

	refs := scenario.TransactionRefs()
	transaction := scenario.BalancedTransaction(refs)

	response, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list transactions request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list transactions status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if len(response.JSON200.Transactions) != 1 {
		t.Fatalf("transaction count = %d, want 1", len(response.JSON200.Transactions))
	}
	if response.JSON200.Transactions[0].TransactionId != transaction.TransactionId {
		t.Fatalf("listed transaction id = %d, want %d", response.JSON200.Transactions[0].TransactionId, transaction.TransactionId)
	}
}
