# github.com/mishamsk/mina/internal/apptest

## Purpose

- Provides reusable in-process app-boundary test clients, scenarios, and deterministic side-effect fakes.

## Implicit Contracts

- Migration fixture clients upgrade an extracted archived database and complete full database validation before exposing REST behavior.
- New clients inject a canonical fake clock unless the caller supplies an explicit clock; client time controls are the app-test source of current time and deadline progression.
- `FakeClock` deadline waits block without real-time polling, wake when fake time reaches their deadline, and release on runtime cancellation.
- Asynchronous helpers pass only on observable REST state or controlled fake events; their real-time watchdog fails harness hangs and cancels condition polling without waiting on an uncooperative probe.
- Accounting schema helpers provide process-unique names without wall time, randomness, or UUIDs so repeated test runs can safely share one DuckDB process.

## Boundaries

- Owns: reusable test composition, shared REST-level behavior assertions, and test-owned fixture lifecycle.
- Does not own: production app behavior or persistence behavior.

## Testing Notes

- Produce and persist minimal immutable schema-version archives by following the [migration-fixture workflow](testdata/migrations/README.md); migration tests consume them through `NewFromMigrationFixture` and assert only through REST.
