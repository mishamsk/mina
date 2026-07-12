# Plan: Recurring page becomes definitions management (Kata bnvy)

Replace the `/recurring` occurrence review queue with definitions management, per the operator-amended `docs/webui-design.md` section 8 "Definitions management screen" (READ IT FIRST — it is the complete UX spec; do not edit ground-truth docs). All backend APIs exist (`GET/POST /api/recurring-definitions`, PUT replace with version increment, pause/resume, defer, cancel, confirm-next); this is frontend work.

## Plan Context

- Kata issue: `bnvy` (blocked-by `b1m2`, merged — occurrence review now lives inline in Transactions; the old review-queue UI is now redundant).
- MANDATORY pre-reads: amended `docs/webui-design.md` section 8; `docs/recurring-transactions-semantics.md` (schedule classes, defer semantics, pause/resume, cancel); `docs/frontend-architecture.md`; `docs/TESTING.md`; `api/openapi.yaml` recurring endpoints.
- Replace, don't accrete: the review-queue page content (`frontend/src/features/recurring/recurring-page-content.tsx`, `use-recurring-review-resource.ts`) is superseded. Remove the occurrence-review table and its supporting code once the new screen lands (the confirm/dismiss flows already moved into the transaction browser in b1m2 — reuse, do not duplicate). Delete dead code; keep the `/recurring` route and sidebar entry.
- Screen per the design doc:
  - Definitions table: FQN path, schedule summary, status badge, next date, amount, trailing RowActions.
  - Schedule summary text: derive from the schedule rule (interval every-N unit / day-of-month / last-day). Next date: the API exposes next occurrence data (check the definitions list response; if it lacks a next date, compute client-side from the schedule rule per semantics — fixed anchor).
  - Row activation opens the editor (the stated management exception); Edit row action too.
  - Row actions: Confirm next (toast), Pause/Resume (persistent toggle), Defer (interval-only; dialog, offset default one cadence, editable), Edit, Cancel (named confirmation via shared ConfirmationDialog, tombstones).
  - Editor side panel (create + edit): FQN, schedule class/fields, anchor date, paused state, full balanced record grid REUSING the advanced journal editor pieces from the ledger feature (record rows with account/category/tags/member/amount/currency, per-currency balance meter, intent-valid account pickers). Extract/parameterize the entry-panel grid pieces where practical instead of copying; a lean shared grid is acceptable if full reuse is impractical — no partial shapes, save disabled until balanced.
  - Save = create or full replace (PUT semantics); API shape-validation errors map onto offending rows; other errors per standard feedback rules.
  - Empty state + New definition header action.
- Demo data has 4 definitions (45vz) — the screen is demonstrable out of the box.
- e2e (replace `recurring-page.spec.ts` review-queue specs deliberately; keep any that still apply):
  - Table renders the 4 seeded definitions with schedule summaries, status, next dates.
  - Create a definition via the editor (balanced grid, save) → appears in table; its occurrences materialize into Transactions (assert via the inline view or occurrences API).
  - Edit/replace round-trip; pause/resume toggle; defer (interval definition) shifts the next date; cancel behind confirmation removes it (history untouched); confirm-next posts a transaction with toast.
  - Editor gates save until balanced; API error mapping (e.g. invalid reference) surfaces on the offending row.
- PROJECT_STATE.md: update the recurring UI capability line (definitions management screen).
- Package docs: recurring feature PACKAGE.md update (screen contract change). No ground-truth edits.

## Tasks

### Task/Commit 1: Definitions table + row actions (no editor yet)

- [x] Implement the definitions table, row actions (confirm-next, pause/resume, defer, cancel), and empty state per the design doc; remove the superseded review-queue UI.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `bnvy` (`kata comment bnvy --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Definition editor (create + edit/replace)

- [x] Implement the editor side panel per the design doc (schedule fields + balanced record grid reuse, save semantics, error mapping); wire row activation + Edit + New definition.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `bnvy`
  - [x] Commit changes

### Task/Commit 3: e2e + PROJECT_STATE + docs

- [x] Replace/extend `recurring-page.spec.ts` per Plan Context; update PROJECT_STATE.md and the recurring feature PACKAGE.md.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `bnvy`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Recurring definitions management (kata bnvy): /recurring replaced per operator-amended webui-design section 8 — definitions table (FQN, schedule summary, status, next, amount, RowActions incl. confirm-next/pause-resume/interval-only defer/cancel-with-confirmation), editor side panel with schedule fields and balanced record grid reusing advanced journal pieces, save=create-or-full-replace with row-mapped shape errors; review-queue UI removed (b1m2 owns inline review); e2e replaced accordingly; PROJECT_STATE updated; ground-truth doc amendment operator-owned and already committed"`
- [x] Move this plan to `docs/plans/completed/`
