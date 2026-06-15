# github.com/mishamsk/mina/internal/providers/backups/file

## Purpose

- Owns local filesystem backup destination behavior for DuckDB database backup files.

## Implicit Contracts

- Backup files created by this provider use the `mina-backup-` prefix and `.duckdb` extension.
- Temp files are created in the destination directory and removed after failed copies.
- Retention pruning only considers provider-created successful backup files.

## Boundaries

- Owns: backup directory creation, temp/final filenames, atomic rename, failed-temp cleanup, and retention pruning.
- Does not own: Mina store access, SQL copying, app config loading, runtime scheduling, HTTP DTOs, or domain operation status.

## Testing Notes

- Provider behavior is covered through runtime-bound app tests that observe filesystem artifacts.
