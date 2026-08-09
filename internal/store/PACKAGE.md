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

## Boundaries

- Owns: DuckDB SQL, migrations, transaction and connection mechanics, DB-facing row/type conversion, runtime-schema state, and database-copy mechanics.
- Does not own: database lifecycle policy, domain or reference-integrity decisions, process configuration, or transport behavior. See [architecture](../../docs/architecture.md).
