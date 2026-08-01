package runtime_test

import (
	"context"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
)

func TestAppReportsHealth(t *testing.T) {
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
	if response.JSON200.DatabaseEncrypted {
		t.Fatal("database_encrypted = true, want false for in-memory database")
	}
}

func TestAppReportsEncryptedDatabase(t *testing.T) {
	client := newSharedClient(
		t,
		apptest.WithDatabasePath(filepath.Join(t.TempDir(), "mina.duckdb")),
		apptest.WithDatabaseEncryptionKey("health-encryption-fixture-key"),
	)

	response, err := client.REST().GetHealthWithResponse(context.Background())
	if err != nil {
		t.Fatalf("health request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("health status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if !response.JSON200.DatabaseEncrypted {
		t.Fatal("database_encrypted = false, want true for encrypted database")
	}
}
