# Plan: Seed real recurring definitions in demo data (Kata 45vz)

Make the Recurring screen and Expected posting-status filtering demonstrable out of the box on `--demo` data. Today `seedRecurring` (`internal/services/demo/demo.go:338`) predates the recurring data model: it seeds ordinary historical transactions with recurring-looking cadence but creates ZERO recurring definitions or occurrences, so the recurring review screen renders empty. Seed 3–4 real recurring definitions continuing the existing fake series, materialize their due occurrences at seed time, and rename the old helper to say what it actually seeds.

## Plan Context

- Kata issue: `45vz`. Backend/demo-seed only; the recurring UX direction change (`b1m2`) is a separate later task — do not touch frontend behavior beyond deliberately updating e2e specs affected by the new demo content.
- MANDATORY pre-read: `docs/recurring-transactions-semantics.md` (ground truth for definitions, EXPECTED occurrences, catch-up materialization, overdue semantics — do not edit it) and `internal/services/recurring/PACKAGE.md`.
- Current demo shape: fully pinned deterministic dataset for April–May 2026 (`demo.go:56` "deterministic demo data for April-May 2026"); no clock anywhere in `demo.go`. Recurring handlers compute `Today` from the runtime clock (`internal/httpapi/strict_recurring.go:135`), so occurrence materialization is inherently now-relative.
- Design (decided):
  - Seed 3–4 recurring definitions that continue the existing seeded series past its 2026-05 end, with pinned anchor dates in June 2026 so materialization at any later "today" yields at least one overdue EXPECTED occurrence and an upcoming next date. E.g.: monthly mortgage payment anchored 2026-06-05 (same 3-record shape as the historical series at `demo.go:339-346`), monthly Netflix subscription anchored 2026-06-10 (simple-spend shape), weekly savings transfer anchored 2026-06-01 (transfer shape), optionally a monthly credit-card payment anchored 2026-06-12. Reuse the accounts/categories/tags/members the builder already tracks.
  - Extend `demo.Services` (`demo.go:24-33`) with `Recurring *recurring.Service` and wire it in `demoDependencies` (`internal/runtime/app.go:450-455`).
  - After creating definitions, run one catch-up materialization inside the same seed flow (the recurring service's occurrence-listing/materialization use case) so the review queue and the transactions Expected filter are populated without any UI interaction. `Today` comes from a clock supplied through `demo.Dependencies` (wire `opts.clock()` in `newDemoService`, `internal/runtime/app.go:457-`); keep the seed deterministic for fixed clocks (app-tests use fake clocks).
  - Rename `seedRecurring` to reflect that it seeds historical recurring-pattern transactions (e.g. `seedRecurringHistory`); add the new definition seeding as its own builder step. Do NOT convert or remove the existing historical transactions — they remain the series history.
  - Extend `demo.Summary` (and the seed-demo REST response + generated clients ONLY IF the summary counts are exposed through the REST contract — mirror whatever the existing counts do) with recurring definition/occurrence counts.
- Demo reset/cache invalidation: `invalidateReferenceCaches` (`app.go:477-484`) already invalidates the exchange-rate needed-currency cache after seeding; recurring materialization now also fires the currency-usage signal (merged fyq2) — no extra work expected, just don't regress it.
- Tests:
  - App-tests per `docs/TESTING.md` (read first): extend the existing demo-seed app-test to assert (via REST) that demo seeding creates the definitions, that the occurrence list shows at least one overdue EXPECTED occurrence and an upcoming schedule under a fake clock later than the anchors, and that the transactions Expected posting-status filter returns the generated expected transactions.
  - Frontend e2e: demo content changes what the browser sees (recurring page is no longer empty; expected rows exist). Run `just test-frontend-e2e` and deliberately update any spec that asserted the old empty/absent state (e.g. `frontend/tests/e2e/recurring-page.spec.ts`), preserving each spec's original intent. Do not add new frontend features.
- Docs: update `internal/services/demo/PACKAGE.md` (if present) for the new seeding contract; extend the PROJECT_STATE.md demo line only if it enumerates seeded content. No ground-truth doc changes.

## Tasks

### Task/Commit 1: Recurring definitions + seed-time materialization in demo data

- [x] Extend `demo.Services` with the recurring service and `demo.Dependencies` with a clock; wire both in `internal/runtime/app.go`.
- [x] Rename `seedRecurring` → historical name; add a new builder step creating 3–4 pinned June-2026-anchored definitions continuing the seeded series (shapes per Plan Context), then materialize due occurrences via the recurring service with the clock's today.
- [x] Extend `demo.Summary` counts (and REST exposure only if summary counts already cross the REST contract; regen `just openapi`/`just frontend-openapi` if and only if the OpenAPI changed).
- [x] Update `internal/services/demo/PACKAGE.md` contract if present.
- [x] App-test coverage per Plan Context (fake clock after the anchors; assert definitions, overdue EXPECTED occurrence, upcoming schedule, Expected transactions filter).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue `45vz` (`kata comment 45vz --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Frontend e2e alignment with the new demo content

- [x] Run `just test-frontend-e2e`; update every spec whose assertions the new demo content invalidates (recurring page emptiness, row counts, Expected-filter results), preserving original spec intent. No behavior changes to the frontend itself.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `45vz` (`kata comment 45vz --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Demo recurring definitions (kata 45vz): demo seed creates 3-4 pinned June-2026 recurring definitions continuing the existing fake series plus seed-time catch-up materialization via a clock threaded through demo.Dependencies; old seedRecurring renamed to reflect historical transactions; summary counts extended; app-tests under fake clock assert overdue EXPECTED occurrence, upcoming schedule, Expected filter; e2e specs deliberately aligned with non-empty recurring demo content; recurring semantics doc untouched"`
- [x] Move this plan to `docs/plans/completed/`
