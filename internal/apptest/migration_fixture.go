package apptest

import (
	"compress/gzip"
	"embed"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/mishamsk/mina/internal/runtime"
)

//go:embed testdata/migrations/*.duckdb.gz
var migrationFixtures embed.FS

// NewFromMigrationFixture creates an in-process client after upgrading and fully validating an archived database from schemaVersion.
func NewFromMigrationFixture(t *testing.T, schemaVersion int) *Client {
	t.Helper()
	if schemaVersion < 1 {
		t.Fatalf("migration fixture schema version must be positive, got %d", schemaVersion)
	}
	databasePath, err := extractMigrationFixture(t.TempDir(), schemaVersion)
	if err != nil {
		t.Fatalf("extract migration fixture for schema version %d: %v", schemaVersion, err)
	}

	return New(t, func(opts *clientOptions) {
		opts.config.DatabasePath = databasePath
		opts.config.AccountingSchema = runtime.AttachedAccountingSchema
		opts.config.StartupValidation = "full"
		opts.runtimeOptions.ExecutionProfile = runtime.ExecutionProfileMigration
	}, WithDuckDBTimeZone("America/New_York"))
}

func extractMigrationFixture(directory string, schemaVersion int) (string, error) {
	fixtureName := fmt.Sprintf("v%05d.duckdb", schemaVersion)
	archive, err := migrationFixtures.Open(filepath.Join("testdata", "migrations", fixtureName+".gz"))
	if err != nil {
		return "", err
	}
	defer func() {
		_ = archive.Close()
	}()

	reader, err := gzip.NewReader(archive)
	if err != nil {
		return "", fmt.Errorf("open gzip archive: %w", err)
	}
	defer func() {
		_ = reader.Close()
	}()

	databasePath := filepath.Join(directory, fixtureName)
	database, err := os.OpenFile(databasePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", fmt.Errorf("create database copy: %w", err)
	}
	if _, err := io.Copy(database, reader); err != nil {
		_ = database.Close()
		return "", fmt.Errorf("extract database copy: %w", err)
	}
	if err := database.Close(); err != nil {
		return "", fmt.Errorf("close database copy: %w", err)
	}

	return databasePath, nil
}
