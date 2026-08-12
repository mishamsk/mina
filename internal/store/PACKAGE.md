# github.com/mishamsk/mina/internal/store

## Purpose

- Owns DuckDB access: accounting locations, migrations, transactions, repository implementations, and disposable per-app database state.

## Implicit Contracts

- `AppDB` owns the selected accounting location and an app-unique `memory` runtime schema. Runtime objects are never portable accounting state; transaction-scoped copies retain that schema, and `Close` drops it before releasing resources.
- Accounting names must be qualified through `AppDB`; it resolves and safely renders database and schema identifiers when opened.
- Repository SQL must use `AppDB` query and transaction helpers. Active transaction-scoped handles route queries to that transaction, and nested `WithTx` calls reuse it.
- Store transactions keep their physical connection until explicit commit or rollback; statements still honor caller cancellation. Connection-scoped operations cannot run inside a transaction and must not retain their callback queryer.
- Embedded migrations and database validation are coupled: changing migration SQL requires reviewing reference registration or waivers and re-pinning `PinnedMigrationContentHash`.
- Dense exchange rates are disposable runtime snapshots. Rebuild stages a new snapshot and swaps it transactionally, so readers observe either the previous or replacement snapshot.
- Backups require file-backed accounting state and attach, copy, and detach the target on one connection; cleanup still detaches a target after copy failure or cancellation.
- User values are parameter-bound; dynamic SQL identifiers and sort expressions come only from store-owned allowlists. Missing-row and DuckDB constraint errors are translated to repository error contracts.
- Transaction-list record filters match any active record within their dimension and compose independently at the containing transaction.
- Flow-report queries aggregate categorized economic records into anchored month/year spines with scope-specific signed values, comparisons, stable window-ranked contributors, filtered period stacks and totals, conversion disclosure, and the selected trend; `Other` remains disclosed for trend-lookback-only activity so selecting no contributors is zero, and transfer movement is absent.
- The accounting-history range read returns the earliest active, non-tombstoned transaction date through the runtime-local current date, falling back to today for an empty ledger.
- Each flow-report read materializes matched transactions, economic components, and contributor ranks once in request-scoped runtime tables, then drops them before its single read transaction ends; calendar spines and metrics remain query-local CTEs.
- Report arithmetic stays within `values.Decimal` / DuckDB `DECIMAL(18,8)` and returns errors on overflow.

## Boundaries

- Owns: DuckDB SQL, migrations, transaction and connection mechanics, DB-facing row/type conversion, runtime-schema state, and database-copy mechanics.
- Does not own: database lifecycle policy, domain or reference-integrity decisions, process configuration, or transport behavior. See [architecture](../../docs/architecture.md).
