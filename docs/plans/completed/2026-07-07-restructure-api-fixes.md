# Plan: Restructure API review fixes — remove budget REST surface (Kata mrs9, fix plan 1)

Operator review of branch `mrs9-restructure-api` found the implementation semantically correct and architecturally clean, but it shipped a budget REST API that the product owner has ruled out of scope: budgeting is Phase 4 (`docs/business-requirements.md`), and budget-by-path semantics live only in `docs/hierarchy-semantics.md`. This fix plan removes that surface, keeps the store-level category/budget lockstep rewrite, and fixes the remaining review findings.

## Plan Context

- Do not run review-loop.
- Product decision (Misha, 2026-07-07): no budget REST API in Phase 2. The category restructure's lockstep rewrite of active `budget.category_fqn` rows stays exactly as implemented in the category store (`internal/store/categories.go` `RestructureFQNs` `withTx`), including the collision-aborts-all behavior. Only the user-facing budget surface is removed.
- Consequence for tests: with no budget API and `docs/TESTING.md` forbidding SQL in app-tests, budget-lockstep app-test coverage is dropped, not replaced with internals-reaching fixtures. REST-boundary coverage returns when budgeting lands in Phase 4.
- Protect — do not regress: all four restructure endpoints and their service/store implementations; the operator wording of the self-subtree rule in `docs/hierarchy-semantics.md` (commit `2d25265` — do not touch this file); template PUT fqn restriction; template delete serialization; all existing restructure app-tests that do not touch budgets; the category store's budget rewrite SQL and its `withTx` atomicity.
- Scope exclusions: no new endpoints, no changes to restructure semantics, no changes to ground-truth docs (`docs/hierarchy-semantics.md`, `docs/architecture.md`, `docs/business-requirements.md`, `docs/webui-design.md`).

## Tasks

### Task/Commit 1: Remove the budget REST API surface

Removes endpoints, service, store, wiring, and docs entries for budgets while leaving the category-restructure lockstep rewrite untouched.

- [x] Remove `POST /api/budgets` and `GET/DELETE /api/budgets/{budget_id}` plus budget request/response schemas from `api/openapi.yaml`; regenerate with `just openapi` and `just frontend-openapi`
- [x] Remove `internal/httpapi/strict_budgets.go` handlers and the budgets entry from httpapi `Dependencies`/router wiring
- [x] Remove `internal/services/budgets` (package, `doc.go`, `PACKAGE.md`) and its listing in `internal/services/PACKAGE.md`; remove `internal/store/budgets.go` and the budgets wiring in `internal/runtime`
- [x] Keep `CategoryStore.RestructureFQNs` budget rewrite unchanged; keep the `internal/store/PACKAGE.md` line about the lockstep rewrite
- [x] Remove the "Monthly category budget create, read, and tombstone flows." line from `PROJECT_STATE.md`; keep the restructure capability line (lockstep clause stays — the store behavior exists)
- [x] Rework `internal/apptest/runtime/category_restructure_test.go`: drop budget seeding/assertions and any budget-dependent cases (including the budget-collision test); keep all category-only restructure cases
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata mrs9
  - [x] Commit changes

### Task/Commit 2: Remaining review findings

File:line findings from the operator audit, all small.

- [x] `internal/services/categories/categories.go` Restructure: with the destination check already excluding category collisions under the mutex, the only reachable repo `ErrConflict` is the budget `(category_fqn, month)` collision — map it to a budget-specific conflict message (e.g. "category restructure conflicts with an existing active budget for the destination path and month") instead of the category-hierarchy message; align the `CategoryFQNConflict` description in `api/openapi.yaml` if needed and regenerate
- [x] `internal/store/PACKAGE.md`: correct the claim that repositories pre-check active uniqueness — dictionary-entity and template creates map unique-index violations only (members and exchange-rates pre-check); state what is actually true
- [x] `internal/store/transaction_templates.go` Replace: remove the now-unreachable unique-violation → `ErrConflict` mapping on the fqn UPDATE (fqn is always unchanged in Replace after the PUT restriction)
- [x] Add missing restructure app-test cases: categories — `to == from` 400, invalid FQN 400, hidden leaf follows the move; tags — invalid FQN 400, hidden leaf follows; templates — invalid FQN 400, tombstoned template exemption (historical FQN untouched, not counted)
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata mrs9
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
