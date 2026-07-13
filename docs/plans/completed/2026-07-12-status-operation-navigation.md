# Plan: Status page operation navigation — generic runs table + per-type details (Kata bzav)

Self-contained api+backend+frontend vertical per the operator-amended `docs/webui-design.md` Status section (read it first; do not edit ground-truth docs): a generic operation selector drills into a generic per-operation runs table (paged, newest first) with per-operation-type run-detail rendering. The API gap: there is no list-runs endpoint today — add one.

## Plan Context

- Kata issue: `bzav`.
- MANDATORY pre-reads: amended `docs/webui-design.md` Status bullets, `docs/architecture.md` (handlers thin, services own domain), `docs/frontend-architecture.md`, `docs/TESTING.md`, `api/openapi.yaml` background-operations paths (`/api/background-operations`, per-op `/status`, POST `/runs`, GET `/runs/{operation_run_id}`).
- EVERGREEN MIGRATIONS CONSTRAINT (Misha policy): if any schema change is needed (unlikely — runs are already persisted for the existing run-detail endpoint), it folds into the ORIGINAL create migration in place; migrations are not additive; no ALTER statements; recompute the pinned hash. Most likely NO schema change is required.
- Backend/API (the gap): add a per-operation runs LISTING — `GET /api/background-operations/{operation_id}/runs` (paged: limit/offset, newest first, total count per the shared list conventions; reuse the existing run DTO from the run-detail endpoint). Follow the existing background-operations handler/service/store structure; typed allowlists for any sort/filter params (probably none beyond paging). Regenerate `just openapi` + `just frontend-openapi`. App-test coverage per docs/TESTING.md (list newest-first, paging, unknown operation 404) and `just test-integration`.
- Frontend (`frontend/src/pages/status-page.tsx` + a status feature area if page code grows):
  - Generic operation selector listing all registered operations from `GET /api/background-operations` (selection URL-backed so a runs view is shareable).
  - Generic runs table for the selected operation per the amended design bullets (paged newest-first, started / finished-duration / outcome / trigger columns, shared table rules incl. page-size default 25).
  - Run detail (row activation per the shared rules — read-only detail; a peek panel or inline detail section consistent with the page's existing patterns): generic envelope fields plus a per-operation-type payload component (exchange-rate loading, database backup) and a plain generic fallback renderer for unknown types — mirror the registry-driven structure, no hardcoded operation enum in the generic layers.
  - Existing status content (health, database, manual triggers, current status) stays; the navigation integrates rather than replaces.
- e2e (`status-page.spec.ts`): selector lists operations; selecting shows the runs table (trigger a run first via the existing manual trigger to guarantee a row); paging params round-trip in the URL; run detail renders the exchange-rate payload fields for an exchange-rate run and the generic fallback for a type without a renderer (if only two types exist, assert the two type renderers); newest-first ordering.
- PROJECT_STATE.md: extend the status/operations capability line. PACKAGE.md updates where contracts change (httpapi/status feature). No ground-truth edits.

## Tasks

### Task/Commit 1: Backend runs-listing API

- [x] Implement the paged list-runs endpoint per Plan Context (service/store/handler/OpenAPI/regenerated clients + app-tests).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue `bzav` (`kata comment bzav --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Frontend operation navigation

- [x] Implement selector + generic runs table + per-type run detail per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `bzav`
  - [x] Commit changes

### Task/Commit 3: e2e + docs

- [x] e2e per Plan Context; PROJECT_STATE.md/PACKAGE.md updates.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `bzav`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Status operation navigation (kata bzav): new paged newest-first GET /api/background-operations/{operation_id}/runs following existing background-operations structure with app-test+integration coverage; frontend generic operation selector + generic runs table (URL-backed selection/paging, shared table rules) with per-operation-type run-detail components and a generic fallback per operator-amended webui-design; registry-mirroring structure with no hardcoded op enums in generic layers; no schema changes (evergreen migration policy stated); existing status content integrated not replaced"`
- [x] Move this plan to `docs/plans/completed/`
