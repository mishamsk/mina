package apptest

import (
	"context"
	"net/http"
	"testing"

	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestNewUsesPerTestInMemorySchema(t *testing.T) {
	client := New(t)
	persistence := client.Persistence()

	location := persistence.Location()

	var count int
	if err := persistence.QueryRowContext(
		context.Background(),
		`SELECT COUNT(*)
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?
  AND table_name = 'schema_version'`,
		location.Database,
		location.Schema,
	).Scan(&count); err != nil {
		t.Fatalf("count schema version tables: %v", err)
	}
	if count != 1 {
		t.Fatalf("schema_version table count = %d, want 1", count)
	}

	if err := persistence.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM "+persistence.QualifiedName("schema_version")).Scan(&count); err != nil {
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
