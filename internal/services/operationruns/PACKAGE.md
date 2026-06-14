# github.com/mishamsk/mina/internal/services/operationruns

## Purpose

- Owns operation-run observability use cases, status transitions, and repository contracts.

## Implicit Contracts

- Operation IDs are stable public API identifiers.
- Operation run IDs are numeric invocation IDs assigned by the repository at run start.
- Manual REST starts are delegated to the background runner.
- Runtime startup and scheduled jobs record observable run attempts through this service.

## Boundaries

- Owns: operation status use-case shape, status transitions, repository contracts, and stable operation identifiers.
- Does not own: HTTP DTOs, process scheduling, no-overlap guards, retry/backoff, SQL queries, database row types, or runtime composition.

## Testing Notes

- Background operation behavior is covered through runtime-constructed boundary tests.
