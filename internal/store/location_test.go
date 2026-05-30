package store_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/mishamsk/mina/internal/store"
)

func TestAccountingLocationValidation(t *testing.T) {
	tests := []struct {
		name     string
		location store.AccountingLocation
		wantErr  bool
	}{
		{
			name: "valid",
			location: store.AccountingLocation{
				Catalog: "accounting",
				Schema:  "mina_1",
			},
		},
		{
			name: "empty catalog",
			location: store.AccountingLocation{
				Catalog: "",
				Schema:  "main",
			},
			wantErr: true,
		},
		{
			name: "dot in schema",
			location: store.AccountingLocation{
				Catalog: "accounting",
				Schema:  "bad.schema",
			},
			wantErr: true,
		},
		{
			name: "digit prefix",
			location: store.AccountingLocation{
				Catalog: "1_accounting",
				Schema:  "main",
			},
			wantErr: true,
		},
		{
			name: "quoted payload",
			location: store.AccountingLocation{
				Catalog: "accounting",
				Schema:  `main"`,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.location.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestDuckDBIdentifierQuoting(t *testing.T) {
	got := store.QuoteIdentifier(`table"name`)
	want := `"table""name"`
	if got != want {
		t.Fatalf("QuoteIdentifier() = %q, want %q", got, want)
	}
}

func TestQualifiedAccountingObjectRoutesToLocation(t *testing.T) {
	ctx := context.Background()
	db, err := store.OpenInMemory(ctx)
	if err != nil {
		t.Fatalf("open in-memory database: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close database: %v", err)
		}
	})

	first := store.AccountingLocation{Catalog: store.InMemoryAccountingCatalog, Schema: "route_one"}
	second := store.AccountingLocation{Catalog: store.InMemoryAccountingCatalog, Schema: "route_two"}
	for _, location := range []store.AccountingLocation{first, second} {
		if err := store.PrepareAccountingLocation(ctx, db, location); err != nil {
			t.Fatalf("prepare %s.%s: %v", location.Catalog, location.Schema, err)
		}
		name, err := location.QualifiedName("probe")
		if err != nil {
			t.Fatalf("qualified name: %v", err)
		}
		if _, err := db.ExecContext(ctx, "CREATE TABLE "+name+" (value INTEGER NOT NULL)"); err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
	}

	firstProbe, err := first.QualifiedName("probe")
	if err != nil {
		t.Fatalf("first qualified name: %v", err)
	}
	secondProbe, err := second.QualifiedName("probe")
	if err != nil {
		t.Fatalf("second qualified name: %v", err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO "+firstProbe+" VALUES (1)"); err != nil {
		t.Fatalf("insert first probe: %v", err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO "+secondProbe+" VALUES (2)"); err != nil {
		t.Fatalf("insert second probe: %v", err)
	}

	var firstValue int
	if err := db.QueryRowContext(ctx, "SELECT value FROM "+firstProbe).Scan(&firstValue); err != nil {
		t.Fatalf("read first probe: %v", err)
	}
	if firstValue != 1 {
		t.Fatalf("first value = %d, want 1", firstValue)
	}

	var secondValue int
	if err := db.QueryRowContext(ctx, "SELECT value FROM "+secondProbe).Scan(&secondValue); err != nil {
		t.Fatalf("read second probe: %v", err)
	}
	if secondValue != 2 {
		t.Fatalf("second value = %d, want 2", secondValue)
	}
}

func TestAttachDatabaseQuotesPathLiteral(t *testing.T) {
	ctx := context.Background()
	db, err := store.OpenInMemory(ctx)
	if err != nil {
		t.Fatalf("open in-memory database: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close database: %v", err)
		}
	})

	location := store.AccountingLocation{
		Catalog: "quoted_path",
		Schema:  "main",
	}
	path := filepath.Join(t.TempDir(), "mina's.db")
	if err := store.AttachDatabase(ctx, db, path, location); err != nil {
		t.Fatalf("attach database: %v", err)
	}
	if err := store.PrepareAccountingLocation(ctx, db, location); err != nil {
		t.Fatalf("prepare accounting location: %v", err)
	}
	if err := store.SelectAccountingLocation(ctx, db, location); err != nil {
		t.Fatalf("select accounting location: %v", err)
	}

	var currentDatabase string
	if err := db.QueryRowContext(ctx, "SELECT current_database()").Scan(&currentDatabase); err != nil {
		t.Fatalf("read current database: %v", err)
	}
	if currentDatabase != location.Catalog {
		t.Fatalf("current database = %q, want %q", currentDatabase, location.Catalog)
	}
}
