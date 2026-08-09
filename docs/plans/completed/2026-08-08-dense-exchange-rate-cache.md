# Plan: Add App-Scoped Runtime State and Dense Exchange Rates

Status: Complete

## Goal

Give every Mina app an isolated, opaque schema for disposable runtime state, move operation runs into it, and add a dense daily exchange-rate cache exposed through REST and used for atomic set-based `amount_usd` backfill.

## Constraints

- Each app owns one collision-resistant opaque schema in the in-memory DuckDB database. `AppDB` owns its creation, safe identifier rendering, and propagation to transaction-scoped stores; services and transports never receive raw schema or table identifiers.
- Runtime schemas contain only disposable operational state derived from the running app or portable accounting data. They are excluded from accounting migrations, backups, and database validation and disappear with the owning process database.
- `AppDB.Close` drops the app's entire runtime schema before releasing or detaching database resources, including when the process database is borrowed; close still attempts all owned cleanup and returns combined failures.
- Runtime-state repositories use fixed store-owned object names inside their app's runtime schema. No per-table opaque reference or identifier plumbing crosses service/store boundaries.
- Operation runs remain app-local and non-durable. Their public service and REST contracts stay unchanged; IDs need only be unique within one app.
- Active accounting `exchange_rate` rows remain the only source of truth. The dense cache is eventually consistent, and consumers may use an older complete snapshot without freshness checks, generation tracking, or source-write invalidation.
- The cache service allows at most one rebuild at a time. Concurrent rebuild requests are dropped without queuing and callers may continue with the currently committed snapshot.
- Cache replacement is transactional: readers see the prior complete snapshot or its complete replacement, and a failed or canceled rebuild preserves the prior snapshot.
- Dense rates preserve current resolution semantics: active `USD -> currency` rows only, latest exact rate on a civil date, deterministic prior and following endpoints, linear interpolation only when both endpoints exist, and no leading or trailing extrapolation.
- Preserve `amount_usd` behavior: signed USD amounts are copied, non-USD amounts are divided by the rate at fixed scale and rounding, zero or out-of-range results remain unresolved, and existing non-`NULL` values are never recomputed.
- Backfill uses each record's posted civil date when present and otherwise its transaction initiated date.
- `exchangerates.Service` remains the only service-level writer of source exchange rates, and `transactions.Service` remains the owner of journal-record backfill policy.
- Expose the committed dense snapshot through a read-only paginated `GET /api/exchange-rates/daily` REST resource. Each daily row has a required `interpolated` boolean distinguishing derived rows from provider-backed exact dates; existing exchange-rate CRUD continues to address persisted source rows only.
- This plan uses the cache for API reads and backfill. Create/replace, shorthand, and recurring inference continue using the existing point resolver.
- Tests for this work operate only through Mina's generated REST client and observable API behavior. They must not query, discover, accept, expose, or otherwise reach into the opaque runtime schema, nor call services or stores to inspect it or couple assertions to its storage layout.
- Keep architecture and package documentation evergreen and written as present-tense target state. Do not add migration history or descriptions of the replaced design.
- Keep the `docs/architecture.md` change surgical: replace or add only the minimum Store / Database rules needed to describe the current runtime-state boundary, leaving detailed contracts in package docs and avoiding document growth.
- Do not change `VISION.md` or `SCOPE.md`.

## Success Criteria

- [ ] Every composed app has a distinct runtime schema, including apps sharing one process database; transaction-scoped stores retain the same schema as their parent `AppDB`, and app close removes the entire schema.
- [ ] Operation-run type, sequence, and rows live in the app runtime schema without an `app_id` discriminator, while existing operation behavior and REST-bound tests remain unchanged.
- [ ] Every non-canceled exchange-rate loading attempt requests a cache rebuild before backfill; overlapping rebuild requests are dropped, and rebuild failure leaves the previous complete snapshot usable.
- [ ] The dense cache can be recreated entirely from active accounting rates and contains one deterministic daily `USD -> currency` rate only across each currency's bounded source-rate interval.
- [ ] The daily exchange-rate API returns the current committed snapshot with deterministic filtering and pagination and identifies every row as provider-backed or interpolated without exposing runtime identifiers.
- [ ] Backfill resolves all records supported by the current cache snapshot with one bounded set-based update instead of bracketing queries and row-by-row updates.
- [ ] Existing and focused app scenarios prove exact dates, interpolated gaps, no-extrapolation edges, posted-date precedence, repeated currency/date records, successive-load catch-up, and isolation between apps sharing one process database.
- [ ] For each application-code commit, `just test` and `just pre-commit` pass before committing.
- [ ] `just test-integration` and `just test-race-concurrency` pass for the completed implementation.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-08-dense-exchange-rate-cache.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Document the runtime-state target architecture

Update `docs/architecture.md` and the relevant `internal/runtime`, `internal/store`, `internal/services/operationruns`, `internal/services/transactions`, and new `internal/services/exchangeratecache` package documentation before implementation. Describe one app-owned runtime schema, whole-schema cleanup, fixed store-owned runtime object names, operation-run ephemerality, cache ownership and staleness, dense-rate API reads, and cache-backed set-based backfill as current contracts without historical prose.

- [ ] The docs identify runtime composition as lifecycle owner, `AppDB` as DuckDB namespace owner, services as use-case owners, and stores as DDL/query owners without exposing SQL identifiers across boundaries.
- [ ] The docs clearly exclude runtime schemas from portable accounting state and state that `AppDB.Close` drops the complete app-owned schema.
- [ ] `docs/architecture.md` receives only the minimal runtime-schema boundary edits; package docs carry lifecycle and service/store details without duplicating the architecture map.
- [ ] Commit as `docs(architecture): define app-scoped runtime state`.

### Task 2: Move operation runs into the app runtime schema

Add the opaque runtime location to `AppDB`, create its schema in `memory` for each composed app, and provide store-private qualification for fixed runtime object names. Transaction-scoped `AppDB` copies must inherit it automatically. `AppDB.Close` must drop the whole runtime schema while its process handle remains available, including borrowed handles and failed app composition. Move the operation-run enum, sequence, and table into that schema, remove the fixed `_mina_internal` helpers and `app_id` filtering, and preserve the operation repository and REST contracts.

- [ ] Runtime schema names are generated internally from a collision-resistant safe alphabet, consistently quoted, and cannot originate from config, transport, or arbitrary service input.
- [ ] Existing background-operation app tests pass unchanged against the package-wide shared process database, confirming that operation IDs, listing, status, and app isolation survive the storage refactor. Do not add storage-aware tests, schema inspection, or runtime-schema access to the app-test harness.
- [ ] `just test` and `just pre-commit` pass.
- [ ] Commit as `refactor(store): isolate runtime state per app`.

### Task 3: Add the dense exchange-rate cache service

Add a focused cache service and store repository over a fixed `dense_exchange_rates` table in the app runtime schema. Runtime composition creates the table and requests an initial rebuild from persisted accounting rates without making cache freshness a readiness condition; a failed initial rebuild leaves a usable empty snapshot. A rebuild records whether each daily row is interpolated, generates only each currency's first-through-last source-rate interval, and transactionally replaces the table contents. Exchange-rate loading requests another rebuild after every non-canceled load attempt while retaining the existing backfill implementation in this commit.

Expose the committed snapshot as `GET /api/exchange-rates/daily`, with optional `to_currency`, `effective_date_from`, and `effective_date_to` filters, deterministic currency/date ordering, standard bounded `limit`/`offset` pagination, and a dedicated response shape containing `from_currency`, `to_currency`, civil `effective_date`, `rate`, and required `interpolated`. Regenerate the REST client and normal CLI/MCP surfaces from OpenAPI; the endpoint is read-only and never exposes cache identifiers or persisted exchange-rate IDs.

- [ ] The service owns only rebuild orchestration and a non-blocking single-updater guard; the store owns cache DDL, source queries, interpolation SQL, and transactional replacement through its `AppDB` runtime location.
- [ ] A dropped rebuild is a successful no-op. Cancellation or failure returns an error without exposing partial replacement rows or making the prior snapshot unusable.
- [ ] Exact-date selection and interpolation endpoint ordering match the existing point resolver, and empty or single-endpoint ranges produce no extrapolated rows.
- [ ] REST-bound app scenarios use only the generated client to prove reconstruction after reopening persisted accounting state, exact/provider provenance, interpolated provenance, no extrapolation, filtering, pagination, and isolation between simultaneous apps sharing one process database.
- [ ] Update `PROJECT_STATE.md` concisely for the new user-visible daily-rate API.
- [ ] `just test`, `just test-integration`, `just test-race-concurrency`, and `just pre-commit` pass.
- [ ] Commit as `feat(exchange-rates): add dense runtime cache`.

### Task 4: Replace record-by-record backfill with one set update

Keep backfill orchestration in `transactions.Service`, but replace unresolved-record listing, per-record `SignedAmountUSD` calls, and batched row updates with one repository operation that joins accounting records to the fixed dense-cache table through the shared `AppDB` runtime location. Runtime attempts backfill against the committed snapshot even when a rebuild was dropped or failed, while preserving operation error reporting and cancellation behavior.

- [ ] The update targets non-tombstoned records in non-tombstoned transactions, uses posted date before initiated date, matches currency and civil date, copies USD amounts directly, and safely leaves missing-rate, zero-result, and decimal-range failures as `NULL`.
- [ ] Journal-record changes are atomic on cancellation or SQL failure; successful source-rate writes retain their existing transaction semantics.
- [ ] Remove the obsolete backfill record/update service types and store methods so the point resolver remains only for create/replace, shorthand, and recurring inference rather than as a competing backfill path.
- [ ] Preserve existing backfill scenarios and add only focused REST-bound coverage needed to prove repeated currency/date updates; cache content and app isolation remain covered through the daily-rate API scenarios from Task 3.
- [ ] `just test`, `just test-integration`, and `just pre-commit` pass.
- [ ] Commit as `perf(exchange-rates): backfill from dense runtime rates`.
