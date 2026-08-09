# github.com/mishamsk/mina/internal/services/backups

## Purpose

- Owns database-backup source and destination contracts plus one-run orchestration.

## Implicit Contracts

- `Run` passes the provider the source and a UTC request timestamp; the provider chooses the target and invokes the copy.
- Source implementations reject in-memory accounting state with `ErrInMemorySource`.
- Source-copy and provider configuration or destination failures remain discoverable through this package's error sentinels.

## Boundaries

- Owns source/provider interfaces, required-dependency errors, timestamp handoff, and a single backup invocation.
- Store owns database-copy mechanics; providers own destination lifecycle; runtime owns composition, scheduling, retries, and operation outcome classification.
