# github.com/mishamsk/mina/internal/store

## Purpose

- Owns DuckDB access: accounting locations, migrations, transactions, repository implementations, and disposable per-app database state.

## Implicit Contracts

- `AppDB` owns the selected accounting location, optional file path, and an app-unique `memory` runtime schema. Runtime objects are never portable accounting state; transaction-scoped copies retain the accounting location, optional file path, and runtime schema, and `Close` drops the runtime schema before releasing resources.
- Accounting names must be qualified through `AppDB`; it resolves and safely renders database and schema identifiers when opened.
- Database file-size reads stat the selected accounting path; in-memory databases return no size without error, while filesystem stat failures return an error.
- Repository SQL must use `AppDB` query and transaction helpers. Active transaction-scoped handles route queries to that transaction, and nested `WithTx` calls reuse it.
- Store transactions keep their physical connection until explicit commit or rollback; statements still honor caller cancellation. Connection-scoped operations cannot run inside a transaction and must not retain their callback queryer.
- Embedded migrations and database validation are coupled: changing migration SQL requires reviewing reference registration or waivers and re-pinning `PinnedMigrationContentHash`.
- Migrations merged to `main` are immutable. Persisted accounting changes add an upgrade migration when required and preserve accounting data from every earlier `main` schema under `docs/compatibility.md`.
- DuckDB active-row business-key enforcement remains only on the small account, category, tag, member, credit-limit, budget, transaction-template, and recurring-definition tables. Nullable tombstone constraints do not own active exchange-rate, imported-metadata, or record-link keys; recurring occurrence slots belong to coordinated writes and store transactions. Full invariant validation audits all keys independently of index drift.
- Dense exchange rates are disposable runtime snapshots. Rebuild stages a new snapshot and swaps it transactionally, so readers observe either the previous or replacement snapshot.
- Backups require file-backed accounting state and attach, copy, and detach the target on one connection; cleanup still detaches a target after copy failure or cancellation.
- User values are parameter-bound; dynamic SQL identifiers and sort expressions come only from store-owned allowlists, and paginated collection ordering includes a stable identity tiebreaker. Missing-row and DuckDB constraint errors are translated to repository error contracts.
- Transaction-list record filters match any active record within their dimension and compose independently at the containing transaction.
- Complete transaction replacement reads and compares the expected transaction revision inside its store transaction, reconciles active journal records by ID, and conditionally advances the parent only for a material change. Exact retained rows remain untouched, materially changed retained rows update in place, new rows are inserted, omitted rows are tombstoned, exact no-ops preserve the revision, and concurrent reconciliation conflicts are failed preconditions.
- Transaction writes batch new and changed journal records through parameterized set operations and use one operation timestamp for every material transaction-row and nested journal-record change. Bulk mutation counts include only materially changed records, every changed parent advances once through a set-based update, settlement requires the parent to remain active at that revision write, concurrent material changes to the same parent return a repository conflict, and expected-occurrence eligibility is rechecked in the committing transaction.
- Complete replacement is the sole atomic removal guard for imported and linked journal-record identities and returns a typed blocker to the service. Metadata and link batches stage their inputs in transaction-local tables, validate and insert through joins, reject active or intra-batch duplicate keys, and advance materially affected parents set-wise; whole deletion removes links, advances surviving linked parents without double-advancing the deleted parent, and leaves importer metadata attached to source records.
- Recurring occurrence writes explicitly validate permanent definition/date slots and lifecycle preconditions inside their store transactions; catch-up batches insert slots, generated transactions, and definition-ordered records set-wise, resume batches insert only deferred slots set-wise, and occurrence transitions commit atomically.
- API audit entries are portable accounting state, stored as structured columns with enum-backed client attribution and nullable DuckDB JSON payloads, and returned newest-first with store-owned exact filters; compaction deletes only rows whose occurrence is strictly before its service-selected cutoff.
- Flow-report queries aggregate categorized economic records into anchored month/year spines with scope-specific signed values, comparisons, stable window-ranked contributors, filtered period stacks and totals, conversion disclosure, and the selected trend; `Other` remains disclosed for trend-lookback-only activity so selecting no contributors is zero, and transfer movement is absent.
- The accounting-history range read returns the earliest active, non-tombstoned transaction date through the runtime-local current date, falling back to today for an empty ledger.
- Each flow-report read materializes matched transactions, economic components, and contributor ranks once in request-scoped runtime tables, then drops them before its single read transaction ends; calendar spines and metrics remain query-local CTEs.
- Report arithmetic stays within `values.Decimal` / DuckDB `DECIMAL(18,8)` and returns errors on overflow.

## Boundaries

- Owns: DuckDB SQL, migrations, transaction and connection mechanics, DB-facing row/type conversion, runtime-schema state, database-copy mechanics, and accounting-file metadata reads.
- Does not own: database lifecycle policy, domain or reference-integrity decisions, process configuration, or transport behavior. See [architecture](../../docs/architecture.md).
