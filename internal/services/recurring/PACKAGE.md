# github.com/mishamsk/mina/internal/services/recurring

## Purpose

- Owns recurring definition validation, occurrence materialization, and lifecycle use cases.
- Converts complete recurring definition record shapes into generated transaction records.

## Implicit Contracts

- Occurrence-listing and lifecycle operations run catch-up materialization before decisions that need current schedule state.
- Materialization is idempotent by definition/date slot and creates only EXPECTED review-queue transactions.
- Occurrence rows are permanent; terminal statuses are not reopened.
- Confirm posts generated records; dismiss tombstones the generated transaction and keeps the occurrence row.
- Defer rewrites interval anchors only after writing a DEFERRED audit occurrence.
- Pause suppresses materialization; resume prevents backlog across the paused window.
- Definition edits affect only future materialization; existing occurrences keep copied generated transactions.
- Active definitions protect referenced accounts, categories, members, and tags from tombstone deletes.

## Boundaries

- Owns: schedule validation, FQN rules, recurring lifecycle semantics, and transaction-shape validation.
- Does not own: SQL persistence, HTTP DTO mapping, exchange-rate storage, or transaction classification.

## Testing Notes

- Behavior is covered by REST app-tests; tests must not inspect store state directly.
