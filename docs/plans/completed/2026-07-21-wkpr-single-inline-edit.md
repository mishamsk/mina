# Plan: Enforce single explicit-commit transaction inline editing — Kata `wkpr`

Across the shared transaction browser, at most one inline editor (one row, one column) can be active at a time; every transaction-level inline editor (category, tags, member, amount) commits only through an explicit checkmark Save, and outside click, Escape, and Cancel all discard the draft. Kata issue: `wkpr`.

## Plan Context

- Kata `wkpr` acceptance (ground truth for this plan):
  - At most one row and one column can be in inline-edit mode across the shared transaction browser (every embedding: Transactions page, registers, drill-down pages, expanded-record editors included).
  - While an editor is open, the rest of the table cannot start another edit, expand a row, select another action, or otherwise create a conflicting state.
  - Clicking outside the active editor exits edit mode without saving.
  - Category, tags, member, and amount editors all expose consistent checkmark Save and Cancel controls.
  - Only the explicit checkmark saves; outside click, Escape, and Cancel discard the draft.
  - Keyboard focus and accessible labels are correct for save and cancel.
  - Bulk mode remains intentionally different: an edit initiated from a selected row applies to the selected transaction set. Do not change bulk-edit behavior.
- Owning docs: `docs/webui-design.md` (Inline editing — the uniformity rule; interaction rules), `docs/webui-theme-arcade-cabinet.md` (control treatments), `docs/frontend-architecture.md` (package boundaries). Do not edit these docs.
- Affected code lives in `frontend/src/features/ledger` (transaction browser, record editing, reference/amount cells). Keep the single-active-editor coordination inside the shared browser so every embedding inherits it.
- Editors involved are the shared pickers per `docs/webui-design.md`; popup pickers (category, tags, member) must gain/keep explicit save/cancel without breaking their type-ahead behavior.
- Saving behavior (which API each editor uses, refresh fan-out) is already established and must not change; this plan changes when a save is committed, not how it is executed.
- Update `frontend/src/features/ledger/PACKAGE.md` implicit contracts to reflect single-active-editor and explicit-commit semantics in the same commit as the behavior change.

## Tasks

### Task 1: Single active inline editor across the shared browser

End state: the shared transaction browser enforces exactly one active inline editor at a time across all embeddings, covering transaction-row editors and expanded-record editors.

- [x] While any inline editor is open, attempts to start another inline edit (any row, any column, including expanded-record cells), expand/collapse a row, or trigger row actions do not create a second editor or conflicting state; the active editor's draft is simply discarded-or-kept per the explicit-commit rule below, never double-opened.
- [x] Clicking outside the active editor closes it without saving; Escape closes it without saving and returns focus to the originating cell.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` implicit contracts for the single-active-editor rule.
- [x] Commit the task as `Enforce a single active inline editor in the transaction browser`.

### Task 2: Consistent explicit checkmark Save and Cancel on all inline editors

End state: category, tags, member, and amount inline editors (transaction-row and expanded-record variants) expose the same explicit checkmark Save and Cancel controls, and only the checkmark commits.

- [x] Category editing gains the explicit checkmark Save and Cancel controls already present for tags and amount; member editing matches; no editor commits on selection, blur, or outside click.
- [x] Save/Cancel controls carry correct accessible labels; keyboard flow reaches Save and Cancel; Cancel and Escape discard the draft identically.
- [x] Editor control styling follows `docs/webui-theme-arcade-cabinet.md` button/action treatments consistently across all four editors.
- [x] Commit the task as `Add explicit save and cancel controls to all inline transaction editors`.

### Task 3: End-to-end coverage for the explicit-commit editing model

End state: frontend e2e tests cover the new interaction model at the API boundary of the UI (user-observable behavior), not implementation internals.

- [x] Add e2e coverage for: starting an edit in one row/column then attempting another row and another column (no second editor; first draft discarded uncommitted), outside click discarding, Escape discarding, Cancel discarding, and explicit checkmark saving (value persists after refresh-fan-out).
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover explicit-commit inline editing with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Single explicit-commit inline editing in the shared transaction browser: one active editor at a time; category/tags/member/amount editors all use explicit checkmark save and cancel; outside click, Escape, and Cancel discard; bulk mode unchanged."`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `wkpr` with the commits and validation evidence: `kata close wkpr --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
