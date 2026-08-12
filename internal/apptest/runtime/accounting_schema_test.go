package runtime_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestAccountingSchemaIsStaticAcrossAccountingMutations(t *testing.T) {
	const configuredSchema = "live_schema_must_not_appear"
	client := newSharedClient(t, apptest.WithAccountingSchema(configuredSchema))

	before, err := client.REST().GetAccountingSchemaWithResponse(context.Background())
	requireNoTransportError(t, "get accounting schema before mutation", err)
	if before.StatusCode() != http.StatusOK || before.JSON200 == nil {
		t.Fatalf("get accounting schema before mutation status = %d, want %d; body %s", before.StatusCode(), http.StatusOK, before.Body)
	}
	if before.JSON200.Ddl == "" {
		t.Fatal("accounting schema DDL is empty")
	}
	if strings.Contains(before.JSON200.Ddl, configuredSchema) {
		t.Fatal("accounting schema DDL varies with the configured live schema")
	}

	created, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{Name: "Schema Staticness Fixture"})
	requireNoTransportError(t, "create accounting fixture", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create accounting fixture status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	after, err := client.REST().GetAccountingSchemaWithResponse(context.Background())
	requireNoTransportError(t, "get accounting schema after mutation", err)
	if after.StatusCode() != http.StatusOK || after.JSON200 == nil {
		t.Fatalf("get accounting schema after mutation status = %d, want %d; body %s", after.StatusCode(), http.StatusOK, after.Body)
	}
	if after.JSON200.Ddl != before.JSON200.Ddl {
		t.Fatal("accounting schema DDL changed after an accounting mutation")
	}
}
