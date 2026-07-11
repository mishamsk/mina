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
	if err := s.attachTarget(ctx, path, targetIdentifier); err != nil {
		return err
	}

	copyErr := s.copyDatabase(ctx, targetIdentifier)
	cleanupCtx := context.WithoutCancel(ctx)
	detachErr := s.detachTarget(cleanupCtx, targetIdentifier)
	if copyErr != nil {
		if detachErr != nil {
			return errors.Join(copyErr, detachErr)
		}
		return copyErr
	}
	if detachErr != nil {
		return detachErr
	}

	return nil
}

func (s *backupSource) attachTarget(ctx context.Context, path string, targetIdentifier string) error {
	_, err := s.db.db.ExecContext(ctx, "ATTACH "+quoteStringLiteral(path)+" AS "+targetIdentifier)
	return backupSourceError(ctx, "attach backup target database", err)
}

func (s *backupSource) copyDatabase(ctx context.Context, targetIdentifier string) error {
	// DuckDB resolves the enum type of a generated column (e.g.
	// recurring_definition.schedule_class) by unqualified name in the current
	// catalog during COPY FROM DATABASE, so the accounting database must be
	// current for the copy to succeed.
	if _, err := s.db.db.ExecContext(ctx, "USE "+s.db.accountingSchemaName()); err != nil {
		return backupSourceError(ctx, "select accounting database before copy", err)
	}

	sql := "COPY FROM DATABASE " + s.db.accountingDatabaseIdentifier() + " TO " + targetIdentifier
	_, err := s.db.db.ExecContext(ctx, sql)
	return backupSourceError(ctx, "copy database", err)
}

func (s *backupSource) detachTarget(ctx context.Context, targetIdentifier string) error {
	if _, err := s.db.db.ExecContext(ctx, "USE memory.main"); err != nil {
		return backupSourceError(ctx, "select memory database before detach", err)
	}

	if _, err := s.db.db.ExecContext(ctx, "DETACH "+targetIdentifier); err != nil {
		return backupSourceError(ctx, "detach backup target database", err)
	}
	if err := useAccountingLocation(ctx, s.db, s.db.db); err != nil {
		return backupSourceError(ctx, "restore accounting database after detach", err)
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
