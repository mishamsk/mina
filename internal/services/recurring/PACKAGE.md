# github.com/mishamsk/mina/internal/services/recurring

## Purpose

- Owns recurring definition validation, occurrence materialization, and lifecycle use cases.
- Converts complete recurring definition record shapes into generated transaction records.

## Implicit Contracts

- Occurrence-listing and lifecycle operations run catch-up materialization before decisions that need current schedule state.
- Materialization is idempotent by definition/date slot and creates only EXPECTED review-queue transactions.
- Occurrence rows are permanent; terminal statuses are not reopened.
- Confirm changes the generated transaction to active and applies explicit owned/party settlement; dismiss tombstones it and keeps the occurrence row.
- Confirmation and dismissal pass service-clock timestamps into one atomic repository operation; SQL does not choose lifecycle timestamps.
- Defer rewrites interval anchors only after writing a DEFERRED audit occurrence.
- Pause suppresses materialization; resume prevents backlog across the paused window.
- Definition edits affect only future materialization; existing occurrences keep copied generated transactions.
- Definition save and every materialization revalidate record currencies through account-reference validation, so later account mode changes cannot create invalid records.
- Definition display enrichment resolves active account metadata without revalidating persisted record currencies.
- Active definitions protect referenced accounts, categories, members, and tags from tombstone deletes.
- Generated-record writes notify the runtime currency-usage signal after success.

## Boundaries

- Owns: schedule validation, FQN rules, recurring lifecycle semantics, and transaction-shape validation.
- Does not own: SQL persistence, HTTP DTO mapping, exchange-rate storage, or transaction classification.

## Testing Notes

- Behavior is covered by REST app-tests; tests must not inspect store state directly.
