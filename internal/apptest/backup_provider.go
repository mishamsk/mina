package apptest

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/services/backups"
)

// BlockedDatabaseBackup blocks database backup runs until released.
type BlockedDatabaseBackup struct {
	provider *blockingBackupProvider
}

type blockingBackupProvider struct {
	blockReady   chan struct{}
	blockRelease chan struct{}
	readyOnce    sync.Once
	releaseOnce  sync.Once
}

// NewBlockedDatabaseBackup returns a backup blocker that can be released by the test.
func NewBlockedDatabaseBackup() *BlockedDatabaseBackup {
	return &BlockedDatabaseBackup{
		provider: &blockingBackupProvider{
			blockReady:   make(chan struct{}),
			blockRelease: make(chan struct{}),
		},
	}
}

// WaitUntilStarted waits until a database backup run reaches the configured block.
func (b *BlockedDatabaseBackup) WaitUntilStarted(t *testing.T) {
	t.Helper()
	if b == nil || b.provider == nil {
		t.Fatal("database backup blocker is not configured")
	}

	select {
	case <-b.provider.blockReady:
	case <-time.After(2 * time.Second):
		t.Fatal("database backup did not start")
	}
}

// Release lets blocked database backup runs finish.
func (b *BlockedDatabaseBackup) Release() {
	if b == nil || b.provider == nil {
		return
	}
	b.provider.releaseOnce.Do(func() {
		close(b.provider.blockRelease)
	})
}

func (p *blockingBackupProvider) Backup(ctx context.Context, _ backups.Source, _ time.Time) error {
	if p.blockReady == nil || p.blockRelease == nil {
		return nil
	}

	p.readyOnce.Do(func() {
		close(p.blockReady)
	})
	select {
	case <-p.blockRelease:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
