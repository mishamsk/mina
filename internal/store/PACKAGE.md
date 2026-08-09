# github.com/mishamsk/mina/internal/store

## Purpose

- Owns database connection helpers, Goose migration wiring, query code, repository implementations, and transaction boundaries.

## Implicit Contracts

- Migrations are upgrade-only Goose SQL files recorded in `schema_version` in the selected accounting location.
- Adding or editing an embedded migration requires re-pinning `PinnedMigrationContentHash`.
- New FK-shaped columns must be registered in the validation reference registry or explicitly waived.
- Database validation builds its pristine reference catalog in a scratch in-memory accounting schema.
- `AppDB` owns the DuckDB process handle, selected accounting location, opaque app-unique runtime schema, active transaction, and close policy.
- Each app's disposable runtime state lives under fixed store-owned object names in its `memory` runtime schema, outside portable accounting state, migrations, backups, and validation.
- `AppDB` creates and safely qualifies its runtime schema internally; raw runtime identifiers do not cross store boundaries, and transaction-scoped copies retain the same schema.
- Operation runs use app-local numeric IDs from a runtime-schema sequence and a store-owned DuckDB status enum.
- Dense daily exchange rates are staged from active accounting `USD -> currency` rows outside the live table, then swapped transactionally; readers see the prior or replacement snapshot.
- AppDB open helpers perform DuckDB-specific process DB open/reuse and one-time plaintext or AES-256-GCM file attach lifecycle; encrypted writes load OpenSSL through signed `httpfs`, while read-only encrypted opens require no extension.
- Backup sources perform DuckDB attach/copy/detach mechanics, encrypt targets with the active primary key, and reject in-memory accounting sources.
- Closing an `AppDB` drops its complete runtime schema before file-backed cleanup and owned process-handle close; borrowed process handles remain open, and cleanup failures are combined.
- Writable file-backed handles checkpoint before detaching; read-only file-backed handles detach without checkpointing.
- Accounting locations cache rendered database and schema identifiers resolved with DuckDB keyword metadata at open time.
- Schema-existence checks report the selected accounting schema before migration creates missing schemas.
- Repository constructors receive `AppDB` and qualify accounting objects through `AppDB` helpers.
- Repository methods execute SQL only through `AppDB.query()` or `AppDB.withTx()`.
- `AppDB.query()` routes direct repository queries to the active transaction when one exists.
- `AppDB.withConn()` runs callback SQL on one physical connection without starting a transaction, rejects transaction-scoped handles, and owns release of the connection it acquires.
- `AppDB.withTx()` starts a transaction or reuses the active one on transaction-scoped `AppDB` handles.
- Direct `AppDB.db` access is limited to open, attach, detach, migration setup, connection or transaction creation, and close paths.
- DuckDB indexes are created with quoted one-part names on fully qualified tables because DuckDB rejects database-qualified index names in `CREATE INDEX`.
- Store code owns DB-facing row types and conversion between app service types and database column values.
- Store code returns account FQN/type and nullable category intent metadata for service-owned semantic decisions, plus nullable display-label overrides for presentation.
- Transaction repositories return semantic metadata for service-owned classification and bulk semantic validation.
- Repositories bind and scan DuckDB `DATE`, `TIMESTAMP`, and decimal columns through app service value types.
- Exchange-rate loading queries infer needed currencies and latest active USD-pair dates from active accounting rows only.
- Dense-rate queries deterministically interpolate bounded daily intervals, expose the committed snapshot through typed filters and pagination, and never expose runtime identifiers.
- SQL casts on typed date/decimal columns are limited to store-owned expression keys such as active uniqueness indexes.
- Query generation is not selected because the required DuckDB SQL features are not yet proven against a repo-owned generator. Manual query code must keep user values parameter-bound and dynamic identifiers selected from store-owned allowlists.
- Database-specific constraint and foreign-key errors are mapped before returning from repository implementations.
- Transaction repositories store normalized journal records, own active selected-record checks and atomic writes for bulk operations, and perform cache-backed unresolved `amount_usd` backfill as one bounded set update.
- Transaction-template repositories store normalized partial record defaults.
- Record-link repositories store pairwise journal-record settlement metadata; services own semantic validation and cascade-tombstone decisions.
- Recurring repositories store normalized definition record shapes and permanent occurrence rows.
- Recurring materialization writes occurrence rows, generated transactions, and generated journal records in one store transaction.
- Recurring pause/resume operations update definition schedule state in store transactions.
- Recurring defer and date-rule resume write occurrence audit rows with definition schedule state in one store transaction.
- Dictionary usage queries report active dependency facts only; services decide whether those facts block deletes.
- Category FQN restructure rewrites active `budget.category_fqn` paths in the same store transaction as the category rewrite.
- Transaction and record lists exclude expected lifecycle by default; explicit lifecycle filters include it.
- Transaction class, shape, and record-role filters reproduce the service-owned derived role rules in SQL; transfer shape requires balance records of both signs.
- Month totals aggregate only categorized `flow` records: expense-intent records net spend/refunds and income-intent records net income/clawbacks.
- Settlement filters derive pending/posted from dates on owned/party records; lifecycle filters read the transaction value.
- Account balance aggregation reads active transactions only, includes pending and posted owned/party records, and casts aggregate sums to `DECIMAL(18,8)` in SQL.
- Account-record running balances are computed over full active transaction history and cast aggregate sums to `DECIMAL(18,8)` in SQL.
- Active uniqueness is enforced by DuckDB expression indexes that index only non-tombstoned rows; account/category/tag/template creates map index violations after service path checks, while member and exchange-rate writes pre-check uniqueness for stable conflict messages.
- FQN restructure writes rely on service check-then-write validation and map DuckDB uniqueness conflicts.
- Path-addressed account/category/tag hidden updates rely on service check-then-write validation and issue one bulk `is_hidden` update against active leaves.
- Account, category, tag, transaction-template, and recurring-definition hierarchy fields are read from DuckDB generated virtual columns.

## Boundaries

- Owns: SQL execution helpers, migration wiring, transactions, backup database copy mechanics, runtime-schema DDL and queries, row types, and app-to-DB type conversion.
- Does not own: process configuration, HTTP behavior, REST DTOs, or domain validation.

## Testing Notes

- Store behavior is verified through `app-tests` at the REST boundary; `app-test` functions do not inspect DuckDB tables directly.
