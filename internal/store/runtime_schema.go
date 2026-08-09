package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

const runtimeSchemaPrefix = "mina_runtime_"

func newRuntimeSchemaName() (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("generate runtime schema name: %w", err)
	}

	return runtimeSchemaPrefix + hex.EncodeToString(random), nil
}

func (s *AppDB) prepareRuntimeSchema(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, "CREATE SCHEMA "+s.runtimeSchemaName()); err != nil {
		return fmt.Errorf("create app runtime schema: %w", err)
	}

	return nil
}

func (s *AppDB) dropRuntimeSchema(ctx context.Context) error {
	if s.runtimeSchema == "" {
		return nil
	}

	return s.withConn(ctx, func(conn sqlQueryer) error {
		if _, err := conn.ExecContext(ctx, "DROP SCHEMA IF EXISTS "+s.runtimeSchemaName()+" CASCADE"); err != nil {
			return fmt.Errorf("drop app runtime schema: %w", err)
		}

		return nil
	})
}
