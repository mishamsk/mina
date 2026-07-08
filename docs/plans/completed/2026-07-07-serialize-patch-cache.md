# Plan: Serialize single-leaf mutation cache updates with the reference mutex (Kata 1316)

Close the last reference-cache race: account `UpdateMutable` and category/tag `UpdateHidden` currently run their repo write and `cacheActiveReference` outside `SerializeReferenceOperation`, so a concurrent bulk operation (restructure, set-hidden) can invalidate and reload the cache between the PATCH's DB write and its cache `Put`, leaving one stale cache entry. This is a minimal-diff concurrency fix; no behavior, API, or schema changes.

## Plan Context

- Owning docs: `docs/architecture.md` (services own validation; no redundant layers), `docs/hierarchy-semantics.md` (enforcement reads the reference cache). Create, Delete, Restructure, and SetHiddenByPath already run check-then-write and cache updates inside `SerializeReferenceOperation`; the three single-leaf mutations are the only reference mutations outside it.
- The fix is strictly mechanical: wrap the existing repo call plus the existing cache update in `s.refs.SerializeReferenceOperation(func() error { ... })`, mirroring the surrounding methods' shape. Input validation (id/field checks) stays outside the closure like the other methods. Error mapping is unchanged.
- Touch exactly three methods: `internal/services/accounts/accounts.go` `UpdateMutable`, `internal/services/categories/categories.go` `UpdateHidden`, `internal/services/tags/tags.go` `UpdateHidden`. Nothing else.
- No new tests: the change is a concurrency-ordering fix with no observable single-request behavior change; existing suites must stay green. Do not add sleeps/race-simulation tests.
- Update a package doc only if one currently documents the serialization contract in a way this change makes stale; otherwise touch no docs.
- Scope exclusions: no refactoring of the per-service duplication, no changes to bulk operations, no frontend changes, no changes to `Delete`/`Create`/`Restructure`.

## Tasks

### Task/Commit 1: Wrap the three single-leaf mutations in the reference mutex

- [x] `accounts.Service.UpdateMutable`: run the `repo.UpdateMutable` call, its error mapping, and `cacheActiveReference` inside `s.refs.SerializeReferenceOperation`
- [x] `categories.Service.UpdateHidden`: same treatment
- [x] `tags.Service.UpdateHidden`: same treatment
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata 1316
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Minimal concurrency fix: wrap account UpdateMutable and category/tag UpdateHidden repo write + cache update in SerializeReferenceOperation, matching every other reference mutation; constraints: three methods only, no behavior change, no new tests, no refactors"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata 1316 with evidence
