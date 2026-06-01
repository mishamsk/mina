package runtime_test

import (
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestAppReportsMigratedSchemaVersion(t *testing.T) {
	client := newSharedClient(t)

	response := apptest.Decode[models.HealthResponse](client, http.MethodGet, "/health", nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want %d; body %s", response.StatusCode, http.StatusOK, response.RawBody)
	}
	if response.Body.SchemaVersion == 0 {
		t.Fatalf("schema_version = 0, want migrated schema version")
	}
}
