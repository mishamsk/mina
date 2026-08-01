package store

import (
	"context"
	"database/sql"
	"fmt"
)

func prepareEncryptedDatabaseSupport(ctx context.Context, db *sql.DB, request AppDBOpenRequest) error {
	if request.Path == "" || request.EncryptionKey == "" {
		return nil
	}
	if request.HTTPFSExtensionPath != "" {
		if _, err := db.ExecContext(ctx, "LOAD "+quoteStringLiteral(request.HTTPFSExtensionPath)); err != nil {
			return fmt.Errorf("load bundled httpfs extension for encrypted database writes: %w", err)
		}
		return nil
	}
	if _, err := db.ExecContext(ctx, "INSTALL httpfs"); err != nil {
		return fmt.Errorf("install signed httpfs extension for encrypted database writes: %w", err)
	}
	if _, err := db.ExecContext(ctx, "LOAD httpfs"); err != nil {
		return fmt.Errorf("load signed httpfs extension for encrypted database writes: %w", err)
	}

	return nil
}
