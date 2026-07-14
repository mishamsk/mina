# Plan: Background operations — concrete APIs, shared run envelope, per-op frontend modules (Kata z4z6)

Align the background-operations surface with the decided architecture (Misha, 2026-07-13; kata z4z6): no generic operation concept in the API/domain — concrete named APIs per operation type. Sharing happens only through a contract-level common run envelope, one full envelope-only runs listing, links from the operations listing to concrete APIs, and shared UI building blocks composed by per-operation frontend modules. Greenfield rules: fully remove superseded surface, no compatibility shims.

## Plan Context

- Kata issue: `z4z6` (records the architecture decision).
- The operator has amended `docs/webui-design.md`'s operation-navigation bullets on this branch (commit b69ae840) — that is the UX ground truth; do not edit ground-truth docs.
- MANDATORY pre-reads: the amended `docs/webui-design.md` Status bullets, `docs/architecture.md` (REST rules: typed allowlists, stable errors), `docs/frontend-architecture.md` (package boundaries; generated types only from codegen), `docs/TESTING.md`, `api/openapi.yaml` background-operations paths.
- EVERGREEN MIGRATIONS CONSTRAINT (standing policy): no schema changes expected; if one becomes necessary it folds into the original create migration in place — migrations are never additive, no ALTERs, recompute the pinned hash.
- Named per-op surface that STAYS: `GET .../{op}/status`, `POST .../{op}/runs` (start), `GET .../{op}/runs/{operation_run_id}` (typed run detail). The shared `operationruns` service/store internals remain shared — that is storage reuse, not a generic domain concept.

## Tasks

### Task/Commit 1: API contract — envelope, full listing, links, removals

- [x] Add a shared run-envelope OpenAPI component (e.g. `BackgroundOperationRun`): `operation_id` (the existing enum union), run id, started/finished timestamps, outcome, trigger, error. Concrete per-op run schemas (`ExchangeRateLoadingRun`, `DatabaseBackupRun` — reuse/rename existing ones) include it via `allOf` and add their typed payload fields. Mirror in Go with an embedded envelope struct in the per-op run types.
- [x] Add `GET /api/background-operations/runs`: envelope-only rows for ALL operations, paged, newest first, optional `operation_id` query filter validated against the operation-id enum (typed-allowlist rule).
- [x] Extend `GET /api/background-operations` entries with a `links` object per operation pointing to its concrete APIs: `status`, `start_run`, `run` (run-detail pattern), and `runs` (the full listing URL filtered to the operation), so consumers navigate from the listing without hardcoding paths.
- [x] Remove `GET /api/background-operations/{operation_id}/runs` (route, handler, schemas) and the unused named per-op GET runs listings (`listExchangeRateLoadingRuns`, `listDatabaseBackupRuns`) — superseded by the full envelope listing.
- [x] Regenerate `just openapi` and `just frontend-openapi`.
- [x] App-tests per `docs/TESTING.md`: full listing newest-first + paging + `operation_id` filter + invalid filter 400; links present and followed to a working concrete endpoint in the test; per-op run detail still returns typed payloads; removed routes return 404/405.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue `z4z6` (`kata comment z4z6 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Frontend per-op modules + shared building blocks

- [x] Create the per-operation module registry in the status feature: each module owns its label, NAMED generated client calls (status, start, run detail), its run-detail component, and its operation-specific controls.
- [x] Type the registry `Record<BackgroundOperationId, OperationModule>` where `BackgroundOperationId` derives from the GENERATED literal union (indexed access on a generated type — never handwritten), so `frontend-typecheck` fails when an enum member lacks a module. This is the only completeness mechanism — do NOT add new test tooling.
- [x] Keep the shared building blocks (operation selector, envelope runs table fed by the full listing with the operation filter, run-detail frame) and compose modules through them; delete the generic fallback renderer.
- [x] Refactor the monolithic `status-operations.tsx` (~876 lines) into this structure; user-visible behavior (URL-backed selection/paging, run detail, manual triggers, status cards) is preserved except where the amended design changes it.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `z4z6`
  - [x] Commit changes

### Task/Commit 3: e2e + docs

- [x] Update `status-page.spec.ts` to the new structure: selector/table/detail flows, both operation types rendering their dedicated detail components, envelope columns in the runs table. Links-driven navigation is covered at the API level (Task 1), not e2e.
- [x] Update PROJECT_STATE.md (full envelope runs listing + links; per-id listing removed) and PACKAGE.md files where contracts changed (httpapi, status feature).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `z4z6`
  - [x] Commit changes

## Final Verification

- [x] Dead-code sweep for the superseded generic surface: grep the whole tree (backend, generated clients, frontend src, app-tests, e2e specs, PACKAGE.md files) for remnants of `listBackgroundOperationRuns` / `ListBackgroundOperationRuns`, `listExchangeRateLoadingRuns`, `listDatabaseBackupRuns`, the `{operation_id}/runs` path, the generic fallback renderer, and any tests, helpers, DTOs, or UI components that existed only to serve them — delete every hit (generated files clear via regeneration). Record the sweep result in the kata.
- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Background operations architecture (kata z4z6): shared allOf run envelope with concrete per-op run schemas; full envelope-only runs listing GET /api/background-operations/runs (paged newest-first, enum-validated operation_id filter); operations listing gains links to concrete per-op APIs; generic {operation_id}/runs route and unused named per-op GET listings removed with a full dead-code sweep (tests, helpers, UI components included); frontend refactored into per-operation modules over shared selector/envelope-table/detail-frame with Record<BackgroundOperationId, OperationModule> typecheck-enforced completeness and no generic fallback; greenfield removal, no shims; evergreen migration policy stated (no schema changes expected)"`
- [x] Move this plan to `docs/plans/completed/`
