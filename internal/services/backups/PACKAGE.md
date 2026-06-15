# github.com/mishamsk/mina/internal/services/backups

## Purpose

- Owns database backup source/provider contracts and the backup run use case.

## Implicit Contracts

- A source copies the selected Mina accounting database into a provider-selected DuckDB file path.
- Providers own destination lifecycle and must not inspect Mina store internals.
- In-memory accounting state is not a valid backup source.

## Boundaries

- Owns: backup provider/source interfaces, backup error taxonomy, and run orchestration.
- Does not own: SQL copy implementation, destination filesystem lifecycle, runtime scheduling, HTTP DTOs, app config, or concrete providers.

## Testing Notes

- Backup behavior is covered through REST-bound app tests and integration config tests.
