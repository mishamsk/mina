# Plan: Polish detail lifecycle strip internals (Kata `ekp3`)

The transaction detail panel closes on a single Esc even while a lifecycle-stage tooltip is showing, and the lifecycle stage derivation shared by the header strip and the record table exists exactly once.

## Plan Context

- Kata issue: `ekp3` — "Polish detail lifecycle strip internals" (P4, frontend). Two enumerated residuals from the m3ea review:
  1. Hovering a lifecycle-stage tooltip can require two Escapes to close the containing panel. Operator decision (implement, do not relitigate): tooltips are not an overlay layer in the Esc ladder — a visible hover/focus tooltip must be Esc-transparent, so one Esc closes the containing detail panel (the tooltip disappears with it). Interactive overlays (pickers, dialogs, popovers) keep absorbing Esc per the Esc-ladder rules in `docs/webui-design.md`. Fix this at the shared tooltip component level if that is where the absorption happens (`frontend/src/components/tooltip.tsx`, likely Radix `onEscapeKeyDown`), so every tooltip in the app behaves consistently — not with a detail-panel special case. Verify no other surface depends on tooltip Esc-absorption (search for existing tests pinning two-Esc behavior).
  2. Lifecycle derivation is duplicated between the header strip and the record table inside `frontend/src/features/ledger/transaction-detail-panel.tsx` (stage reached/day/deviation logic around `recordHasReachedStage`, `recordStageDay`, `stageDiffersForRecord`, and the strip's stage summaries). Extract one shared derivation (single module-level function set or hook feeding both consumers) with zero rendering changes.
- This is refactor + interaction polish; the recently merged `5qah` (nullable pending) and `e222` (day-marker rendering) behaviors are the current ground truth — the extraction must preserve them bit-for-bit (day markers as calendar dates, instants local, null stages dashed, deviation badges, "n of m" qualifiers, varies markers).
- Ground truth: `docs/webui-design.md` (Screen 2 lifecycle strip spec; Esc ladder rules; the day-marker rule in Dates and statuses), `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e` (existing lifecycle e2e in `frontend/tests/e2e/lifecycle-timezone.spec.ts` and the detail-panel specs must stay green — they are the no-regression net for the extraction).

## Tasks

### Task 1: One shared lifecycle derivation

- [x] Extract the duplicated stage derivation into a single shared implementation consumed by both the header strip and the record table; no user-visible change (existing lifecycle e2e green without assertion edits).
- [x] Commit the task as `refactor(frontend): share lifecycle stage derivation in transaction detail`.

### Task 2: Esc-transparent tooltips

- [x] Make visible tooltips Esc-transparent so one Esc closes the containing panel; verify by hovering a lifecycle stage tooltip and pressing Esc once (panel closes, focus returns per the panel's focus rule), and confirm pickers/dialogs still absorb Esc per the ladder.
- [x] Add or adjust e2e coverage for single-Esc close with a tooltip showing.
- [x] Commit the task as `fix(frontend): close detail panel on single Esc despite visible tooltip`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-27-ekp3-lifecycle-strip-polish.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `ekp3` with `kata close ekp3 --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
