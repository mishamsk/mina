package file

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services/backups"
)

const (
	backupFilePrefix    = "mina-backup-"
	backupFileExtension = ".duckdb"
)

// Options controls the local file backup destination.
type Options struct {
	Directory      string
	RetentionCount int
}

// Provider writes DuckDB database backup files to one local directory.
type Provider struct {
	directory      string
	retentionCount int
}

// New creates a local file backup provider.
func New(opts Options) (*Provider, error) {
	if opts.RetentionCount < 0 {
		return nil, fmt.Errorf("%w: retention count must be greater than or equal to 0", backups.ErrProviderConfigInvalid)
	}

	return &Provider{
		directory:      opts.Directory,
		retentionCount: opts.RetentionCount,
	}, nil
}

// Backup copies source into a temp DuckDB file, atomically finalizes it, and prunes old backups.
func (p *Provider) Backup(ctx context.Context, source backups.Source, requestedAt time.Time) error {
	if p.directory == "" {
		return fmt.Errorf("%w: backup directory is required", backups.ErrProviderConfigInvalid)
	}
	if source == nil {
		return backups.ErrSourceRequired
	}
	if err := os.MkdirAll(p.directory, 0o755); err != nil {
		return providerError(ctx, "create backup directory", err)
	}

	finalPath, err := p.finalPath(ctx, requestedAt.UTC())
	if err != nil {
		return err
	}
	tempPath, err := p.tempPath(finalPath)
	if err != nil {
		return err
	}
	if err := source.CopyDatabaseToDuckDBFile(ctx, tempPath); err != nil {
		removeTemp(tempPath)
		return err
	}
	if err := os.Rename(tempPath, finalPath); err != nil {
		removeTemp(tempPath)
		return providerError(ctx, "finalize backup file", err)
	}
	if err := p.prune(ctx, finalPath); err != nil {
		return err
	}

	return nil
}

func (p *Provider) finalPath(ctx context.Context, requestedAt time.Time) (string, error) {
	for attempt := 0; ; attempt++ {
		path := filepath.Join(p.directory, backupFileName(requestedAt.Add(time.Duration(attempt)*time.Nanosecond)))
		_, err := os.Stat(path)
		if err == nil {
			continue
		}
		if os.IsNotExist(err) {
			return path, nil
		}

		return "", providerError(ctx, "check backup file collision", err)
	}
}

func (p *Provider) tempPath(finalPath string) (string, error) {
	suffix, err := randomSuffix()
	if err != nil {
		return "", err
	}

	return filepath.Join(p.directory, "."+filepath.Base(finalPath)+".tmp-"+suffix), nil
}

func backupFileName(requestedAt time.Time) string {
	return backupFilePrefix +
		requestedAt.Format("20060102T150405") +
		fmt.Sprintf("%09d", requestedAt.Nanosecond()) +
		"Z" +
		backupFileExtension
}

func randomSuffix() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("%w: generate temp file suffix", backups.ErrProviderFailed)
	}

	return hex.EncodeToString(raw[:]), nil
}

func removeTemp(path string) {
	_ = os.Remove(path)
}

func (p *Provider) prune(ctx context.Context, finalPath string) error {
	if p.retentionCount == 0 {
		return nil
	}
	entries, err := os.ReadDir(p.directory)
	if err != nil {
		return providerError(ctx, "read backup directory", err)
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isProviderBackupFile(entry.Name()) {
			continue
		}
		names = append(names, entry.Name())
	}
	sort.Strings(names)
	removeCount := len(names) - p.retentionCount
	if removeCount <= 0 {
		return nil
	}
	finalName := filepath.Base(finalPath)
	removed := 0
	for _, name := range names {
		if removed >= removeCount {
			break
		}
		if name == finalName {
			continue
		}
		if err := os.Remove(filepath.Join(p.directory, name)); err != nil {
			return providerError(ctx, "prune backup file", err)
		}
		removed++
	}

	return nil
}

func isProviderBackupFile(name string) bool {
	if !strings.HasPrefix(name, backupFilePrefix) || !strings.HasSuffix(name, backupFileExtension) {
		return false
	}

	timestamp := strings.TrimSuffix(strings.TrimPrefix(name, backupFilePrefix), backupFileExtension)
	if len(timestamp) != len("20060102T150405000000000Z") ||
		timestamp[8] != 'T' ||
		timestamp[24] != 'Z' {
		return false
	}

	return allDigits(timestamp[:8]) && allDigits(timestamp[9:24])
}

func allDigits(value string) bool {
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}

	return true
}

func providerError(ctx context.Context, action string, err error) error {
	if ctxErr := ctx.Err(); ctxErr != nil {
		return ctxErr
	}
	if err == nil {
		return nil
	}

	return fmt.Errorf("%w: %s", backups.ErrProviderFailed, action)
}
