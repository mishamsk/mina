# Plan: Recurring anchor, defer, and confirm improvements

## Goal

Make recurring schedules behave the way the schedule reads: an edited anchor is the next occurrence, deferral works for every schedule class and is reachable from the occurrence it actually moves, confirming a materialized occurrence records the date it actually happened, and the recurring row's Pause control looks and behaves like every other row action.

- Anchor edits re-anchor the schedule from the anchor date itself.
- Defer works for date-rule schedules and is offered on `/recurring` and on the definition's next projected occurrence in the transaction list.
- Confirming a materialized expected occurrence asks for the actual date, defaulting to the scheduled date.
- Pause is a compact outline icon button with a recognisable pause glyph from the existing icon set.

## Constraints

- Follow `docs/TESTING.md`: app-tests through the in-process REST client for behavior, Playwright specs only for browser wiring. No unit tests.
- Occurrence rows stay permanent audit state and `UNIQUE(recurring_definition_id, scheduled_date)` stays; no schema migration is expected. If an implementation appears to need one, stop and report instead of relaxing the constraint.
- Fixed-anchor semantics stay: due dates advance from scheduled dates, never from confirmation dates.
- Defer never acts on a materialized occurrence: with several unconfirmed occurrences open, "defer this one" is ambiguous. Defer always targets the next non-materialized slot.
- Do not author new icon artwork. Use glyphs that already ship with `pixelarticons`.
- Every REST contract change carries explicit CLI and MCP exposure or description decisions in `api/client-surfaces.yaml`; regenerate through `just openapi` and `just frontend-openapi` and never hand-edit generated code.
- Update the owning docs in the same commit as the behavior: `docs/recurring-transactions-semantics.md`, `docs/webui-design.md`, and the touched `PACKAGE.md` files. Run `just prose-fmt` before finishing.

## Success Criteria

- [ ] Editing a definition's anchor to a future date makes that date the next occurrence and steps every later occurrence from it, regardless of any previously computed next occurrence, deferred slot, or early-confirmed slot; already-materialized occurrences are untouched.
- [ ] Defer is offered for every non-paused definition on `/recurring` regardless of schedule class, and date-rule schedules jump N schedule periods.
- [ ] In the transaction list, Defer appears only on a definition's next projected occurrence; other projections and materialized expected rows do not offer it.
- [ ] Confirming a materialized expected occurrence opens a dialog whose actual date defaults to the scheduled date and becomes the confirmed transaction's initiated date.
- [ ] Pause/Resume on `/recurring` renders as the same compact outline icon button as the row's other direct actions, using an existing `pixelarticons` glyph.
- [ ] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-22-recurring-transaction-improvements.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: An edited anchor is the next occurrence

`NextDueDateAfter` (`internal/services/recurring/recurring.go:1603`) advances from `MAX(scheduled_date)` while `visitDueSlotsUntil` (`:1621`) enumerates from the anchor. The two disagree whenever an occurrence row exists on or after a newly set anchor — deferred slots and early-confirmed slots — and the next date lands one cadence past the new anchor instead of on it.

Make one rule true everywhere: the next occurrence is the first schedule slot on or after the definition's anchor that has no occurrence row; occurrence dates before the anchor never advance it, and later slots step from the anchor. The `/recurring` next column, occurrence catch-up, and future transaction-list projection must all agree.

Replacing a definition with a *changed* anchor requires the new anchor to be on or after the server's current civil date; an unchanged anchor is accepted as-is regardless of age, and creation still accepts past anchors for backfill.

- [ ] App-test in `internal/apptest/runtime/recurring_definition_test.go`: a monthly definition with unreviewed materialized occurrences plus a future slot already recorded (defer or confirm-next), replaced with an on-grid future anchor, reports `next_due_date` equal to that anchor, projects the following occurrence one cadence after it, and leaves every existing occurrence row and its transaction unchanged.
- [ ] App-test: replacing a definition with an anchor before the current civil date returns 400; replacing without touching a past anchor succeeds.
- [ ] `docs/recurring-transactions-semantics.md`, `internal/services/recurring/PACKAGE.md`, and the `anchor_date` description in `api/openapi.yaml` state the anchor-as-floor and anchor-edit rules.
- [ ] `just test` and `just pre-commit` pass.
- [ ] Commit as `fix(recurring): re-anchor schedules from edited anchor dates`.

### Task 2: Defer covers every schedule class

Definition-level defer rejects date-rule schedules (`recurring.go:793`). It keeps targeting only the next non-materialized slot; materialized occurrences stay outside defer entirely.

Date-rule defer jumps N schedule periods: `every` counts schedule periods and defaults to 1, and `unit` is rejected with 400 for date-rule definitions while interval defer keeps its cadence-unit offset. The deferred slot is recorded and the anchor moves the same way interval defer already does, so the next due date becomes the Nth rule slot after the deferred one and later slots follow the new anchor. Paused definitions keep rejecting defer.

Projected transaction rows must let a client tell which projection is the definition's next non-materialized slot: mark it in the projection payload rather than making the browser infer it from a page of rows it may not fully see.

- [ ] App-tests cover: date-rule defer by 1 and by N periods, including `last_day_of_month` landing on real month ends and `day_of_month` clamping in short months; `unit` rejected for date-rule definitions; paused definitions still rejected.
- [ ] A future-positioned transaction list marks exactly one projection per active definition as its next occurrence, and that marker moves after a defer.
- [ ] `api/client-surfaces.yaml` corrects the `deferRecurringDefinition` CLI/MCP description; generated OpenAPI, client, CLI, MCP, and frontend client code is regenerated, not hand-edited.
- [ ] `docs/recurring-transactions-semantics.md`, `internal/services/recurring/PACKAGE.md`, and the `/recurring` row-action rules in `docs/webui-design.md` no longer restrict defer to interval schedules, and state that defer never acts on a materialized occurrence.
- [ ] `just test` and `just test-integration` pass.
- [ ] Commit as `feat(recurring): defer date-rule schedules`.

### Task 3: Confirming a materialized occurrence records the actual date

`confirmRecurringOccurrence` takes only a settlement intent, so a late confirmation keeps the scheduled date as the transaction's initiated date.

Give the confirm request an optional actual date that defaults to the occurrence's scheduled date, becomes the confirmed transaction's initiated date, and drives the derived signed USD amounts the way early confirmation already derives them for today. A date after the server's current civil date is a 400. Settlement timestamps keep coming from the supplied intent or the service clock. `confirm-next` early confirmation is unchanged.

- [ ] App-tests cover: confirming an overdue occurrence with an actual date between the scheduled date and today, the default preserving today's behavior, and a future actual date returning 400.
- [ ] `api/client-surfaces.yaml` descriptions and generated surfaces reflect the new field; `internal/services/recurring/PACKAGE.md` and `docs/recurring-transactions-semantics.md` state that confirmation may record the actual date while the schedule stays fixed.
- [ ] `just test` and `just test-integration` pass.
- [ ] Commit as `feat(recurring): confirm occurrences with an actual date`.

### Task 4: Recurring row actions read as one cluster

On `/recurring`, Pause/Resume is the only row action rendered as a bare flat toggle (`frontend/src/components/row-actions.tsx:334`) while Edit, Confirm next, Defer, and Cancel are outline icon buttons; the flat-toggle treatment belongs to the reference tables' star and hidden glyphs per `docs/webui-theme-arcade-cabinet.md` and must keep working there. Defer is also replaced by an invisible placeholder for non-interval definitions (`frontend/src/features/recurring/recurring-page-content.tsx:552`).

Pause/Resume becomes a direct button-class action with the same compact outline icon-button treatment as its neighbours. `pixelarticons` ships no pause glyph, so use its `Power` icon — the recognisable circle-and-bar on/off symbol — for Pause and keep `Play` for Resume; do not author new icon artwork. Accessible names `Pause`/`Resume`, disabled reasons, and the in-flight focus-restore behavior asserted by `frontend/tests/e2e/recurring-page.spec.ts:182` and `:252` must survive. Defer becomes a direct action for every non-paused definition, its dialog offering the every+unit pair for interval schedules and a period count for date rules, defaulting to one cadence or one period. The definition editor blocks past anchor dates when editing an existing definition and maps the server's anchor 400 onto the anchor field.

- [ ] `frontend/tests/e2e/recurring-page.spec.ts` shows the five direct actions with consistent button treatment at desktop width, folds them the same way at narrow width, and defers a date-rule definition end to end.
- [ ] `frontend/src/features/recurring/PACKAGE.md` and `docs/webui-design.md` describe the row-action set and defer availability without the interval-only restriction.
- [ ] `just frontend-check` and `just test-frontend-e2e` pass.
- [ ] Commit as `feat(webui): align recurring row actions and universal defer`.

### Task 5: Dated confirmation for expected rows, Defer on the next projection

Materialized expected transactions confirm immediately with no dialog (`frontend/src/features/ledger/transaction-browser.tsx:1890`, `transaction-detail-panel.tsx:1277`), and every projected row is action-free (`transaction-browser.tsx:1887`).

Confirm on a materialized expected occurrence — transaction list row, detail panel, and the account-register detail path (`frontend/src/features/accounts/use-account-register-transaction-detail.ts:122`) — opens a dialog whose actual-date field defaults to the occurrence's scheduled date and submits it, keeping the existing toast, refresh, and error behavior. Materialized expected rows keep exactly Confirm and Dismiss.

Defer appears only on the projected row the server marks as its definition's next occurrence, which only exists when the list is positioned in the future. Other projections stay action-free, and the row and detail footer agree per the shared applicability matrix. The action opens the same offset dialog as `/recurring`, calls the definition defer operation, and refreshes the list, open detail, and recurring snapshots on success. Adding an action to one class of projected rows changes the transactions action cluster, so keep the action column and its `data-row-actions-count` container-query fold rules in `frontend/src/styles.css` coherent.

- [ ] Frontend e2e covers: confirming an overdue expected occurrence through the dialog with the prefilled scheduled date and with an edited date; a future-positioned list offering Defer on the next projection only, with the deferred date reflected afterwards; materialized expected rows and later projections offering no Defer.
- [ ] `docs/webui-design.md` applicability matrix and occurrence rules, `frontend/src/features/ledger/PACKAGE.md`, and `PROJECT_STATE.md` describe the new occurrence affordances.
- [ ] `just frontend-check` and `just test-frontend-e2e` pass.
- [ ] Commit as `feat(webui): dated occurrence confirmation and next-projection defer`.
