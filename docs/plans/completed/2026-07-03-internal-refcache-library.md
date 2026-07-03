# Plan: Internal refcache library for reference dictionaries and cached values

Extract the four duplicated write-through reference caches (accounts, categories, tags, members) into one generic in-house library package, and use the same package to cache the exchange-rate loader's needed-currency list. Establishes `internal/x/` as the documented home for pure in-process library packages.

## Plan Context

- The four dictionary services each carry a near-identical bespoke cache (`ensureReferenceCache` / `cacheActiveReference` / `cacheInactiveReference` / `InvalidateReferenceCache`; see `internal/services/tags/tags.go` for the canonical copy). Semantics to preserve exactly: lazy one-time full-table preload; a missing key in a loaded snapshot means "invalid reference" (never load-on-miss, never evict); write-through updates on create/update/tombstone; explicit full invalidation (runtime restore hook in `internal/runtime/app.go`).
- Decision (user-approved): no external caching library. Cache-library semantics (eviction, load-on-miss) are wrong for membership-authoritative reference data. Use `golang.org/x/sync/singleflight` for load coalescing; promote it from indirect to direct dependency.
- Decision (user-approved): new umbrella `internal/x/` for pure in-process library packages. The cache is a side-effect-free data structure, not a boundary, so it is imported directly by services — no injected interface ("Add interfaces only at real boundaries").
- Decision (user-approved): edit `docs/architecture.md` to add the `internal/x` boundary bullet and rule. This plan is the explicit instruction required by AGENTS.md.
- `exchangerateloading.Service.Load` re-queries `Repository.NeededCurrencies` on every run. The needed set changes only when a journal write introduces a new currency: `transactions.Service.Create`/`Replace` (demo seeding goes through `transactions.Create`) or a database restore (existing runtime invalidation hook). Transaction deletes only shrink the set; stale over-inclusion is harmless (the loader skips unneeded pairs), so deletes need no hook.
- Two `exchangerateloading.Service` instances exist (daily and startup, wired in `internal/runtime/app.go`). Each owns its own cached value; invalidation wiring must hit both.
- Testing per `docs/TESTING.md`: no unit tests anywhere, including for `internal/x` packages. refcache behavior is exercised through existing app-tests of reference validation and restore, plus one new app-test scenario for the currency cache.

## Tasks

### Task/Commit 1: Add internal/x/refcache and the internal/x boundary

Creates the library package and its architectural home. After this task, the generic cache exists, is documented, and lint enforces that `internal/x` packages stay app-agnostic. No consumers yet.

- [x] Create `internal/x/refcache` with two types:
  - [x] `Dictionary[K comparable, V any]`: constructed with a loader `func(context.Context) (map[K]V, error)`; methods `GetMany(ctx, keys []K) (map[K]V, error)` (ensures the snapshot is loaded, returns only present keys), `Put(key K, v V)`, `Modify(key K, fn func(v V, ok bool) V)`, `Invalidate()`.
  - [x] `Value[T any]`: constructed with a loader `func(context.Context) (T, error)`; methods `Get(ctx) (T, error)`, `Invalidate()`.
  - [x] Coalesce concurrent loads with `golang.org/x/sync/singleflight`; a failed load leaves the cache unloaded so the next call retries.
  - [x] Write-through mutations (`Put`/`Modify`) apply only when a snapshot is loaded and no-op otherwise (the next load reads the source of truth, which already contains the write).
- [x] Document exported APIs with godoc; add `internal/x/refcache/PACKAGE.md` (use `docs/package_doc_template.md`) covering the implicit contracts: entries are never evicted; absence in a loaded snapshot is authoritative; mutations no-op while unloaded; a coalesced load runs under the first caller's context.
- [x] Promote `golang.org/x/sync` to a direct dependency in `go.mod`.
- [x] Add depguard rule `x-library-boundaries` in `.golangci.yml`: files under `internal/x/**` deny `github.com/mishamsk/mina` (library packages must not import app packages; stdlib and approved third-party only). If x packages ever need to import each other, adjust the rule then.
- [x] Update `docs/architecture.md` Package Boundaries: add an `internal/x` bullet (pure in-process library packages: app-agnostic data structures and helpers, no app imports, no side-effect boundaries) and a matching rule line.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Task/Commit 2: Migrate the four dictionary services to refcache.Dictionary

Replaces the four bespoke cache blocks with `refcache.Dictionary`, keeping every exported service API and validation rule identical. Existing app-tests must pass unchanged (coupling rule in `docs/TESTING.md`).

- [x] In `internal/services/tags`, `members`, `accounts`, `categories`: replace the bespoke cache struct and helpers with a `refcache.Dictionary[int64, <service reference state>]` whose loader lists all rows including hidden and tombstoned (current `ensureReferenceCache` query).
- [x] Keep exported APIs and semantics unchanged: `ValidateActiveReferences`, `ValidateActiveReference`, `InvalidateReferenceCache`, hidden/active rules, `services.ErrInvalidReference` on any miss. ID deduplication and validation policy stay in the services.
- [x] Write-through call sites map as: create/update → `Put`; tombstone → `Modify` preserving existing reference fields while marking inactive.
- [x] Delete the now-unused bespoke cache code from all four services.
- [x] Existing app-tests pass without modification.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Task/Commit 3: Cache needed currencies in exchange-rate loading

Stops the daily loader from re-querying `NeededCurrencies` when nothing changed, using `refcache.Value` with invalidation on the writes that can introduce a new currency.

- [x] In `internal/services/exchangerateloading`: wrap the `Repository.NeededCurrencies` result in a `refcache.Value[[]NeededCurrency]` built inside `NewService`; `Load` reads through it. Add exported `InvalidateCurrencyCache()`.
- [x] In `internal/services/transactions`: add a nil-safe notifier (consumer-owned `func()` constructor parameter, named in domain terms, e.g. currency usage changed) invoked after successful `Create` and `Replace`. No hook on delete (see Plan Context).
- [x] In `internal/runtime/app.go`: wire the transactions notifier to a closure invalidating the currency cache on both loading service instances; extend the existing restore invalidation hook to also invalidate both.
- [x] Add or extend an app-test in `internal/apptest/runtime`: after a first load run, create a transaction in a currency not previously present, run the loading operation again through the REST surface used by existing exchange-rate tests, and assert rates for the new currency appear.
- [x] Update `internal/services/exchangerateloading` package doc (`PACKAGE.md`) with the invalidation contract (currency cache must be invalidated by composition when journal writes or restores can change needed currencies).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (process startup and runtime wiring touched)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Internal refcache library: extracted generic write-through dictionary cache used by accounts/categories/tags/members and Value cache for exchange-rate needed currencies; constraints: no external cache library, singleflight direct dep, internal/x must stay app-agnostic (depguard rule), miss-means-invalid semantics preserved, no unit tests per docs/TESTING.md, docs/architecture.md internal/x bullet is user-approved and must not be removed"`
- [x] Move this plan to `docs/plans/completed/`
