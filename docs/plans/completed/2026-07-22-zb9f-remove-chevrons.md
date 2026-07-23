# Plan: Remove transaction expansion chevrons — Kata `zb9f`

Transaction rows no longer render any disclosure chevron; the whole row remains the expansion affordance, expanded rows carry the theme's latched expanded-state treatment, and the freed width returns to the description text without shifting columns. Kata issue: `zb9f`.

## Plan Context

- The design phase is complete. Implement the interaction contract in `docs/webui-design.md` (Tables and filtering — no per-row disclosure control, expanded-state treatment; Keyboard — Space toggles expansion, Enter opens detail in the transactions browser; row-activation exception wording) and the presentation contract in `docs/webui-theme-arcade-cabinet.md` (expanded transaction rows: latched row-hover fill, dropped bottom hairline fusing with the records subtable closed by its 2px `--border-ink` bottom border, title steps to mono SemiBold; flat state — no outline/shadow/press; must read against both banding parities). Both docs are already updated on this branch — implement exactly them.
- Additional detail lives in the untracked working files `design-prototypes/prototype-a.md` and `design-prototypes/judgment.md` (grafts: `aria-controls` from the expanded row to the records row id; band-parity fallback of mixing the latched fill from the row's own stripe). Read them; NEVER commit `design-prototypes/`.
- Known mechanics from the design phase: the chevron is an inline span (+gap) inside the description cell in `frontend/src/features/ledger/transaction-browser.tsx`, already suppressed in bulk mode — removal frees inline truncation room in the same fixed-percentage column (no `styles.css` column-width changes expected) and fixes the existing bulk-mode title-left-edge jump. Space currently swallowed outside bulk mode becomes the expansion toggle; Enter opens detail; bulk-mode Space keeps toggling selection.
- Must not regress: hf98 bulk mode (row selection semantics, in-mode lockdown), wkpr single-editor model, 46vf in-place saves (`frontend/src/features/ledger/PACKAGE.md` contracts).
- Update `frontend/src/features/ledger/PACKAGE.md` if its wording references the disclosure indicator; update `PROJECT_STATE.md` for the user-visible change in the same commit.
- Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from the documented rule; note any such edit prominently in the completion report.

## Tasks

### Task 1: Remove the chevron and add the expanded-state treatment

End state: no chevron anywhere in transaction rows; expanded rows read per the theme contract; keyboard semantics match the updated docs.

- [x] Transaction rows render no chevron/disclosure icon in any embedding or mode; the reclaimed inline space benefits the description text; other columns do not move.
- [x] Expanded rows latch the row-hover fill, fuse with the records subtable (hairline dropped, subtable closes with its 2px ink bottom border), step the title to mono SemiBold, and read against both banding parities; the treatment is flat state (no outline/shadow/press affordance).
- [x] Row keeps `aria-expanded` and gains `aria-controls` to the records row; Space toggles expansion on the focused row (outside bulk mode), Enter opens the detail panel; bulk-mode Space still toggles selection.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` (if referenced) and `PROJECT_STATE.md`.
- [x] Commit the task as `Remove transaction expansion chevrons`.

### Task 2: End-to-end coverage

End state: e2e pins the no-chevron affordance and keyboard model.

- [x] E2E asserts: no disclosure control/icon in rows; click and Space expand/collapse; Enter opens detail; `aria-expanded`/`aria-controls` correctness; expanded-state treatment present (e.g. via the latched fill/testid-visible state, asserted at the user-observable level); bulk-mode Space unaffected.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover chevron-free expansion with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean (`design-prototypes/` stays untracked and uncommitted).
- [x] With a clean worktree run `just review-loop "Chevron-free transaction expansion: whole-row affordance, latched expanded-row treatment per theme doc, Space/Enter keyboard model, no column shifts; hf98/wkpr/46vf contracts unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `zb9f` with the commits and validation evidence: `kata close zb9f --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
