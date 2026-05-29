package apptest

import (
	"context"
	"net/http"
	"testing"

	models "mina.local/mina/internal/httpapi/openapi"
)

func TestNewUsesPerTestInMemorySchema(t *testing.T) {
	client := New(t)
	persistence := client.Persistence()

	var schema string
	if err := persistence.QueryRowContext(context.Background(), "SELECT current_schema()").Scan(&schema); err != nil {
		t.Fatalf("read current schema: %v", err)
	}
	if schema != persistence.Schema() {
		t.Fatalf("current schema = %q, want %q", schema, persistence.Schema())
	}

	var count int
	if err := persistence.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM schema_version").Scan(&count); err != nil {
		t.Fatalf("count schema versions: %v", err)
	}
	if count == 0 {
		t.Fatalf("schema_version count = 0, want migrated schema")
	}
}

func TestScenarioCreatesFixturesThroughClient(t *testing.T) {
	client := New(t)
	scenario := client.Scenario()

	refs := scenario.TransactionRefs()
	transaction := scenario.BalancedTransaction(refs)

	response := Decode[models.TransactionListResponse](client, http.MethodGet, "/transactions", nil)
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
