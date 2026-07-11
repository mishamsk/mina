package store

import (
	"context"
	"database/sql/driver"
	"fmt"
	"sync"
)

type accountingConnectionInitializer struct {
	mu         sync.RWMutex
	schemaName string
}

func newAccountingConnectionInitializer() *accountingConnectionInitializer {
	return &accountingConnectionInitializer{}
}

func (i *accountingConnectionInitializer) setAccountingSchema(schemaName string) {
	i.mu.Lock()
	defer i.mu.Unlock()

	i.schemaName = schemaName
}

func (i *accountingConnectionInitializer) init(execer driver.ExecerContext) error {
	i.mu.RLock()
	schemaName := i.schemaName
	i.mu.RUnlock()
	if schemaName == "" {
		return nil
	}

	// DuckDB resolves unqualified sequence defaults and generated-column enum
	// types against the connection's current schema, so every pooled connection
	// must enter the selected accounting schema before its first app statement.
	if _, err := execer.ExecContext(context.Background(), "USE "+schemaName, nil); err != nil {
		return fmt.Errorf("select accounting schema %s: %w", schemaName, err)
	}

	return nil
}

func enableAccountingConnectionInit(ctx context.Context, appDB *AppDB) error {
	if appDB.connInit != nil {
		appDB.connInit.setAccountingSchema(appDB.accountingSchemaName())
	}

	return useAccountingLocation(ctx, appDB, appDB.db)
}
