package apptest

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/mishamsk/mina/internal/services/recurring"
	"github.com/mishamsk/mina/internal/services/values"
	"github.com/mishamsk/mina/internal/store"
)

// AssertRecurringMaterializationUsesSecondPooledConnection verifies non-transactional recurring reads work on a fresh pooled connection.
func AssertRecurringMaterializationUsesSecondPooledConnection(t *testing.T) {
	t.Helper()

	ctx := context.Background()
	appDB, err := store.OpenAppDB(ctx, store.AppDBOpenRequest{
		AccountingLocation: store.AccountingLocationConfig{
			Database: "memory",
			Schema:   "schema_selection_regression",
		},
		MaxOpenConns: 2,
	})
	if err != nil {
		t.Fatalf("open app db: %v", err)
	}
	defer func() {
		if err := appDB.Close(); err != nil {
			t.Fatalf("close app db: %v", err)
		}
	}()

	if err := store.Migrate(ctx, appDB); err != nil {
		t.Fatalf("migrate app db: %v", err)
	}

	anchorDate, err := values.ParseCivilDate("2024-01-01")
	if err != nil {
		t.Fatalf("parse anchor date: %v", err)
	}
	created, err := store.NewRecurringStore(appDB).Create(ctx, recurring.SaveInput{
		FQN:          "SchemaSelection:SecondConnection",
		ScheduleRule: json.RawMessage(`{"version":1,"kind":"interval","every":1,"unit":"MONTH"}`),
		AnchorDate:   anchorDate,
	})
	if err != nil {
		t.Fatalf("create recurring definition fixture: %v", err)
	}

	today, err := values.ParseCivilDate("2024-01-02")
	if err != nil {
		t.Fatalf("parse today: %v", err)
	}
	var definitions []recurring.MaterializationDefinition
	if err := appDB.WithTx(ctx, nil, func(*store.AppDB) error {
		var listErr error
		definitions, listErr = store.NewRecurringStore(appDB).ListMaterializationDefinitions(ctx, today)
		return listErr
	}); err != nil {
		t.Fatalf("list materialization definitions on second pooled connection: %v", err)
	}
	if len(definitions) != 1 || definitions[0].ID != created.ID {
		t.Fatalf("materialization definitions = %+v, want definition %d", definitions, created.ID)
	}
}
