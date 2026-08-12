// accountingschema generates the checked-in current target accounting DDL.
package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/mishamsk/mina/internal/store"
)

const (
	canonicalDatabase = "memory"
	canonicalSchema   = "mina"
	defaultOutputPath = "internal/services/accountingschema/schema.sql"
)

func main() {
	outputPath := flag.String("output", defaultOutputPath, "generated schema output path")
	flag.Parse()

	if err := run(context.Background(), *outputPath); err != nil {
		fmt.Fprintf(os.Stderr, "accountingschema: %v\n", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, outputPath string) error {
	db, err := store.OpenInMemory(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	appDB, err := store.OpenAppDBWithProcessDB(ctx, db, store.AppDBOpenRequest{
		AccountingLocation: store.AccountingLocationConfig{
			Database: canonicalDatabase,
			Schema:   canonicalSchema,
		},
	})
	if err != nil {
		return err
	}
	defer func() {
		if appDB != nil {
			_ = appDB.Close()
		}
	}()

	if err := store.Migrate(ctx, appDB); err != nil {
		return fmt.Errorf("migrate pristine accounting schema: %w", err)
	}
	if err := appDB.Close(); err != nil {
		return fmt.Errorf("close migrated accounting database: %w", err)
	}
	appDB = nil

	exportDir, err := os.MkdirTemp("", "mina-accounting-schema-")
	if err != nil {
		return fmt.Errorf("create export directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(exportDir) }()

	exportSQL := "EXPORT DATABASE " + quoteLiteral(exportDir)
	if _, err := db.ExecContext(ctx, exportSQL); err != nil {
		return fmt.Errorf("export pristine accounting database: %w", err)
	}
	ddl, err := os.ReadFile(filepath.Join(exportDir, "schema.sql"))
	if err != nil {
		return fmt.Errorf("read exported schema: %w", err)
	}
	ddl = append(bytes.TrimRight(ddl, "\n"), '\n')
	if err := os.WriteFile(outputPath, ddl, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", outputPath, err)
	}

	return nil
}

func quoteLiteral(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}
