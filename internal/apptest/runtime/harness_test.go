package runtime_test

import (
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestAppTestClientIsolatesClientState(t *testing.T) {
	t.Run("first test", func(t *testing.T) {
		client := newSharedClient(t)

		created := apptest.Decode[models.Member](client, http.MethodPost, "/members", models.CreateMemberRequest{
			Name: "Alex",
		})
		if created.StatusCode != http.StatusCreated {
			t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
		}

		list := apptest.Decode[models.MemberListResponse](client, http.MethodGet, "/members", nil)
		if list.StatusCode != http.StatusOK {
			t.Fatalf("list status = %d, want %d; body %s", list.StatusCode, http.StatusOK, list.RawBody)
		}
		if len(list.Body.Members) != 1 || list.Body.Members[0].MemberId != created.Body.MemberId {
			t.Fatalf("members = %+v, want created member %d", list.Body.Members, created.Body.MemberId)
		}
	})

	t.Run("second test", func(t *testing.T) {
		client := newSharedClient(t)

		list := apptest.Decode[models.MemberListResponse](client, http.MethodGet, "/members", nil)
		if list.StatusCode != http.StatusOK {
			t.Fatalf("list status = %d, want %d; body %s", list.StatusCode, http.StatusOK, list.RawBody)
		}
		if len(list.Body.Members) != 0 {
			t.Fatalf("member count = %d, want 0; body %+v", len(list.Body.Members), list.Body)
		}
	})
}

func TestScenarioCreatesFixturesThroughClient(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()

	refs := scenario.TransactionRefs()
	transaction := scenario.BalancedTransaction(refs)

	response := apptest.Decode[models.TransactionListResponse](client, http.MethodGet, "/transactions", nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("list transactions status = %d, want %d; body %s", response.StatusCode, http.StatusOK, response.RawBody)
	}
	if len(response.Body.Transactions) != 1 {
		t.Fatalf("transaction count = %d, want 1", len(response.Body.Transactions))
	}
	if response.Body.Transactions[0].TransactionId != transaction.TransactionId {
		t.Fatalf("listed transaction id = %d, want %d", response.Body.Transactions[0].TransactionId, transaction.TransactionId)
	}
}
