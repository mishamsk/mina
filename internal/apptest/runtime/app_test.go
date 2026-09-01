package runtime_test

import (
	"context"
	"net/http"
	"os"
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
	version, err := response.JSON200.Version.AsDevelopmentBuild()
	if err != nil {
		t.Fatalf("decode development version: %v", err)
	}
	if version.CommitSha == "" {
		t.Fatal("version.commit_sha is empty")
	}
	if response.JSON200.DatabaseEncrypted {
		t.Fatal("database_encrypted = true, want false for in-memory database")
	}
	if response.JSON200.DatabaseFileSizeBytes != nil {
		t.Fatalf("database_file_size_bytes = %d, want null for in-memory database", *response.JSON200.DatabaseFileSizeBytes)
	}
}

func TestAppReportsDatabaseFileSizeWithoutMakingItRequiredForHealth(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "mina.duckdb")
	client := newSharedClient(t, apptest.WithDatabasePath(databasePath))

	response, err := client.REST().GetHealthWithResponse(context.Background())
	if err != nil {
		t.Fatalf("health request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("health status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if response.JSON200.DatabaseFileSizeBytes == nil {
		t.Fatal("database_file_size_bytes = null, want file size")
	}
	info, err := os.Stat(databasePath)
	if err != nil {
		t.Fatalf("stat database: %v", err)
	}
	if *response.JSON200.DatabaseFileSizeBytes != info.Size() {
		t.Fatalf("database_file_size_bytes = %d, want %d", *response.JSON200.DatabaseFileSizeBytes, info.Size())
	}

	unavailablePath := databasePath + ".unavailable"
	if err := os.Rename(databasePath, unavailablePath); err != nil {
		t.Fatalf("make database file unavailable: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Rename(unavailablePath, databasePath); err != nil {
			t.Fatalf("restore database file: %v", err)
		}
	})

	response, err = client.REST().GetHealthWithResponse(context.Background())
	if err != nil {
		t.Fatalf("health request with unavailable database file: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("health status with unavailable database file = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if response.JSON200.Status != "ok" {
		t.Fatalf("health status = %q, want ok", response.JSON200.Status)
	}
	if response.JSON200.DatabaseFileSizeBytes != nil {
		t.Fatalf("database_file_size_bytes = %d, want null for unavailable file", *response.JSON200.DatabaseFileSizeBytes)
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
