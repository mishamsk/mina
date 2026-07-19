package store

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/mishamsk/mina/internal/services/backups"
)

var backupTargetSequence atomic.Int64

type backupSource struct {
	db *AppDB
}

// NewBackupSource creates a database backup source for the selected accounting database.
func NewBackupSource(db *AppDB) backups.Source {
	return &backupSource{db: db}
}

func (s *backupSource) CopyDatabaseToDuckDBFile(ctx context.Context, path string) error {
	if s.db == nil {
		return backups.ErrSourceRequired
	}
	if path == "" {
		return fmt.Errorf("%w: target path is required", backups.ErrSourceCopyFailed)
	}
	if s.db.isInMemoryAccounting() {
		return backups.ErrInMemorySource
	}

	targetIdentifier := backupTargetIdentifier()
	connectionErr := s.db.withConn(ctx, func(conn sqlQueryer) error {
		if err := s.attachTarget(ctx, conn, path, targetIdentifier); err != nil {
			return err
		}

		copyErr := s.copyDatabase(ctx, conn, targetIdentifier)
		cleanupCtx := context.WithoutCancel(ctx)
		detachErr := s.detachTarget(cleanupCtx, conn, targetIdentifier)

		return errors.Join(copyErr, detachErr)
	})
	if connectionErr == nil {
		return nil
	}

	var scopeErr *connectionScopeError
	if !errors.As(connectionErr, &scopeErr) {
		return connectionErr
	}

	return backupSourceError(ctx, scopeErr.Error(), scopeErr)
}

func (s *backupSource) attachTarget(ctx context.Context, conn sqlQueryer, path string, targetIdentifier string) error {
	_, err := conn.ExecContext(ctx, "ATTACH "+quoteStringLiteral(path)+" AS "+targetIdentifier)
	return backupSourceError(ctx, "attach backup target database", err)
}

func (s *backupSource) copyDatabase(ctx context.Context, conn sqlQueryer, targetIdentifier string) error {
	sql := "COPY FROM DATABASE " + s.db.accountingDatabaseIdentifier() + " TO " + targetIdentifier
	_, err := conn.ExecContext(ctx, sql)
	return backupSourceError(ctx, "copy database", err)
}

func (s *backupSource) detachTarget(ctx context.Context, conn sqlQueryer, targetIdentifier string) error {
	if _, err := conn.ExecContext(ctx, "DETACH "+targetIdentifier); err != nil {
		return backupSourceError(ctx, "detach backup target database", err)
	}

	return nil
}

func backupTargetIdentifier() string {
	sequence := backupTargetSequence.Add(1)
	alias := "_mina_backup_target_" + strconv.FormatInt(time.Now().UnixNano(), 36) + "_" + strconv.FormatInt(sequence, 36)

	return QuoteIdentifier(alias)
}

func backupSourceError(ctx context.Context, action string, err error) error {
	if ctxErr := ctx.Err(); ctxErr != nil {
		return ctxErr
	}
	if err == nil {
		return nil
	}

	return fmt.Errorf("%w: %s", backups.ErrSourceCopyFailed, action)
}
