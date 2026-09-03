# github.com/mishamsk/mina/internal/apptest

## Purpose

- Provides reusable in-process app-boundary test clients, scenarios, and deterministic side-effect fakes.

## Implicit Contracts

- Migration fixture clients upgrade an extracted archived database under a deterministic non-UTC DuckDB timezone and complete full database validation before exposing REST behavior.
- New clients inject a canonical fake clock unless the caller supplies an explicit clock; client time controls are the app-test source of current time and deadline progression.
- `FakeClock` deadline waits block without real-time polling, wake when fake time reaches their deadline, and release on runtime cancellation.
- `FakeExchangeRateProvider` preserves rows added with `Add`, including repeated currency/date keys, while `Set` remains convenient unique-key configuration.
- Asynchronous helpers pass only on observable REST state or controlled fake events; typed helpers cover every concrete background-operation run, and their real-time watchdog fails harness hangs and cancels condition polling without waiting on an uncooperative probe.
- `RunConcurrentRequests` releases app-boundary requests only after every request reaches the shared HTTP barrier and returns results in caller order.
- Accounting schema helpers provide process-unique names without wall time, randomness, or UUIDs so repeated test runs can safely share one DuckDB process.
- Clients configured with `WithDuckDBTimeZone` own one DuckDB session whose timezone is set before database startup.
- Complete-replacement helpers send the transaction ETag so scenarios exercise the public concurrency contract; `ReplaceTransactionRetainingRecords` retains identities by position, while `ReplaceTransactionWithNewRecords` intentionally omits them.

## Boundaries

- Owns: reusable test composition, shared REST-level behavior assertions, and test-owned fixture lifecycle.
- Does not own: production app behavior or persistence behavior.

## Testing Notes

- Produce and persist minimal immutable schema-version archives from state reachable through the source version's REST API by following the [migration-fixture workflow](testdata/migrations/README.md); omit schema-only placeholder tables without REST behavior because they cannot contain production data. Migration tests consume archives through `NewFromMigrationFixture` and assert only through REST.
