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
	accounting *AccountingDB
}

// NewBackupSource creates a database backup source for the selected accounting database.
func NewBackupSource(accounting *AccountingDB) backups.Source {
	return &backupSource{accounting: accounting}
}

func (s *backupSource) CopyDatabaseToDuckDBFile(ctx context.Context, path string) error {
	if s.accounting == nil {
		return backups.ErrSourceRequired
	}
	if path == "" {
		return fmt.Errorf("%w: target path is required", backups.ErrSourceCopyFailed)
	}
	if s.accounting.location.Database() == "memory" {
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
	_, err := s.accounting.db.ExecContext(ctx, "ATTACH "+quoteStringLiteral(path)+" AS "+targetIdentifier)
	return backupSourceError(ctx, "attach backup target database", err)
}

func (s *backupSource) copyDatabase(ctx context.Context, targetIdentifier string) error {
	sql := "COPY FROM DATABASE " + s.accounting.location.databaseIdentifier + " TO " + targetIdentifier
	_, err := s.accounting.db.ExecContext(ctx, sql)
	return backupSourceError(ctx, "copy database", err)
}

func (s *backupSource) detachTarget(ctx context.Context, targetIdentifier string) error {
	if _, err := s.accounting.db.ExecContext(ctx, "USE memory.main"); err != nil {
		return backupSourceError(ctx, "select memory database before detach", err)
	}

	_, err := s.accounting.db.ExecContext(ctx, "DETACH "+targetIdentifier)
	return backupSourceError(ctx, "detach backup target database", err)
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
