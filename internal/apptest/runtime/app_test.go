package runtime_test

import (
	"context"
	"net/http"
	"testing"
)

func TestAppReportsMigratedSchemaVersion(t *testing.T) {
	client := newSharedClient(t)

	response, err := client.REST().GetHealthWithResponse(context.Background())
	if err != nil {
		t.Fatalf("health request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("health status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if response.JSON200.SchemaVersion == 0 {
		t.Fatalf("schema_version = 0, want migrated schema version")
	}
}
