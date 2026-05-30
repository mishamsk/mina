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
		location store.AccountingLocationConfig
		wantErr  bool
	}{
		{
			name: "valid",
			location: store.AccountingLocationConfig{
				Database: "accounting",
				Schema:   "mina_1",
			},
		},
		{
			name: "empty database",
			location: store.AccountingLocationConfig{
				Database: "",
				Schema:   "main",
			},
			wantErr: true,
		},
		{
			name: "dot in schema",
			location: store.AccountingLocationConfig{
				Database: "accounting",
				Schema:   "bad.schema",
			},
		},
		{
			name: "digit prefix",
			location: store.AccountingLocationConfig{
				Database: "1_accounting",
				Schema:   "main",
			},
		},
		{
			name: "quoted payload",
			location: store.AccountingLocationConfig{
				Database: "accounting",
				Schema:   `main"`,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
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

			_, err = store.NewAccountingLocation(ctx, db, tt.location)
			if (err != nil) != tt.wantErr {
				t.Fatalf("NewAccountingLocation() error = %v, wantErr %v", err, tt.wantErr)
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

	first := store.AccountingLocationConfig{Database: store.InMemoryAccountingDatabase, Schema: "route_one"}
	second := store.AccountingLocationConfig{Database: store.InMemoryAccountingDatabase, Schema: "route_two"}
	locations := []store.AccountingLocation{}
	for _, config := range []store.AccountingLocationConfig{first, second} {
		location, err := store.NewAccountingLocation(ctx, db, config)
		if err != nil {
			t.Fatalf("new location: %v", err)
		}
		accounting := store.NewAccountingStore(db, location)
		if err := store.PrepareAccountingLocation(ctx, accounting); err != nil {
			t.Fatalf("prepare %s.%s: %v", location.Database(), location.Schema(), err)
		}
		name, err := location.QualifiedName("probe")
		if err != nil {
			t.Fatalf("qualified name: %v", err)
		}
		if _, err := db.ExecContext(ctx, "CREATE TABLE "+name+" (value INTEGER NOT NULL)"); err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		locations = append(locations, location)
	}

	firstLocation := locations[0]
	secondLocation := locations[1]
	firstProbe, err := firstLocation.QualifiedName("probe")
	if err != nil {
		t.Fatalf("first qualified name: %v", err)
	}
	secondProbe, err := secondLocation.QualifiedName("probe")
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

	location, err := store.NewAccountingLocation(ctx, db, store.AccountingLocationConfig{
		Database: "quoted_path",
		Schema:   "main",
	})
	if err != nil {
		t.Fatalf("new accounting location: %v", err)
	}
	accounting := store.NewAccountingStore(db, location)
	path := filepath.Join(t.TempDir(), "mina's.db")
	if err := store.AttachDatabase(ctx, accounting, path); err != nil {
		t.Fatalf("attach database: %v", err)
	}
	if err := store.PrepareAccountingLocation(ctx, accounting); err != nil {
		t.Fatalf("prepare accounting location: %v", err)
	}

	probe, err := location.QualifiedName("attach_probe")
	if err != nil {
		t.Fatalf("qualified probe name: %v", err)
	}
	if _, err := db.ExecContext(ctx, "CREATE TABLE "+probe+" (value INTEGER NOT NULL)"); err != nil {
		t.Fatalf("create attached probe: %v", err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO "+probe+" VALUES (7)"); err != nil {
		t.Fatalf("insert attached probe: %v", err)
	}

	var value int
	if err := db.QueryRowContext(ctx, "SELECT value FROM "+probe).Scan(&value); err != nil {
		t.Fatalf("read attached probe: %v", err)
	}
	if value != 7 {
		t.Fatalf("attached probe value = %d, want 7", value)
	}
}
