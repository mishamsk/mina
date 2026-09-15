# Plan: Command palette keyboard-only rows, stable heights, and modifier ribbon (feedback fleet, Brief C)

## Goal

The command palette becomes keyboard-only in its row behavior (mouse position never changes the active row; click still activates), every result row keeps a fixed height per surface (transaction rows always show the full title and memo in a taller allowance; account rows always show the truncated path), and the in-row modifier subtitle is replaced by a hanging ribbon attached below the palette frame that appears only while the active row carries a conditional modifier action, with content that never changes with modifier state.

## Constraints

- No Kata issue; this is Brief C of `docs/plans/2026-09-14-p1-p2-feedback-fleet.md`.
- Operator measurements before this change (chromium, 1280×800): transaction result rows are 44, 58, or 78px and change on selection; an account row grows from 40 to 100px when active.
- Edits in `frontend/src/features/command-palette/command-palette.tsx`:
  - Remove both `onMouseEnter` handlers and the `hover:` classes on transaction and command rows; keep the click handlers (they pass the row's own item) and the active-row classes. The template row tooltip trigger must keep working.
  - Transaction rows: replace the `active ? whitespace-normal : truncate` conditionals on title and memo with an unconditional wrapped presentation clamped to two lines (`[overflow-wrap:anywhere] whitespace-normal line-clamp-2`), set a fixed row allowance (about `min-h-[3.5rem]`), and switch the grid to `items-start` so the date, class, and amount cells stay put.
  - Account and command rows: delete the in-row subtitle block, the per-row `aria-describedby` and `sr-only` action descriptions, the polite live region and its announcement derivation, and the `useAcceleratorHeld` usage and import (the hook stays for the entity picker). Row height is then constant; update the `entityResultRowHeightPx` comment from "a floor" to the exact command-row pitch.
- Ribbon design spec (from `docs/webui-theme-arcade-cabinet.md` landmark, strip, and chip rules): wrap the dialog frame in a positioning stack inside the scrim (`flex w-full max-w-2xl flex-col shadow-[var(--shadow-pixel)]`, moving the pixel shadow from the frame to the wrapper so frame and ribbon cast one shadow, the frame keeping its 2px ink outline and `h-[min(38rem,72svh)]` to leave room). The ribbon is a sibling after the frame: full frame width, `border-2 border-t-0 border-[var(--border-ink)] bg-[var(--band)] px-3 py-2 font-mono text-xs uppercase`, laid out as two non-wrapping clauses separated by a muted `·`: `Kbd Enter` plus the default action label, then `Kbd Mod` `Kbd Enter` plus the alternate action label. Content order and text are constant regardless of modifier state; the ribbon is present only when `activeCommand?.alternateAction` exists and not in transaction-search mode. Backdrop-click close keeps working (mirror the scrim's target check). Nothing inside the frame moves when the ribbon appears; the ribbon hangs below the frame's bottom edge and moves with it. At short viewports the results viewport absorbs the height (it is already the flex scroll region).
- Accessibility: exactly one description: `aria-describedby="command-palette-action-ribbon"` on the combobox input while the ribbon is present; the ribbon is plain text with `aria-hidden` separators; no live region.
- Docs: rewrite the Command Palette subtitle bullet in `docs/webui-design.md` to describe the ribbon and keyboard-only rows with stable heights; update the `CommandPalette` primitive bullet; add the ribbon to the `CommandPalette` line in `docs/webui-theme-arcade-cabinet.md` (one clause); `frontend/src/features/command-palette/PACKAGE.md` via the `write-package-docs` skill; `PROJECT_STATE.md` phrase stays as is.
- Testing policy (mandatory): `docs/FRONTEND-TESTING.md` governs. Do not add e2e tests; reviewers must not request coverage. Fold: in `frontend/tests/e2e/command-palette.spec.ts` retarget the subtitle assertions to the ribbon test id and assert the same text with and without `ControlOrMeta` held; no other test changes. Net test count unchanged. No REST as action or evidence, no matrices, no geometry assertions, no fixed waits.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo` at 1280×800: transaction search rows all share one height and do not change on selection; account rows all share one height and stay truncated when active; moving the mouse over rows never changes the active row; clicking a row activates it; an active account row shows the ribbon hanging under the frame with constant content while `Cmd/Ctrl` is held or released; arrowing to a non-account row hides the ribbon without moving the frame; Enter and Cmd/Ctrl+Enter still go to the register and the filtered Transactions.
- [x] Screenshots of transaction results, of an active account row with the ribbon, and of the same with the accelerator held are attached to the completion report and match the design spec.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/command-palette.spec.ts tests/e2e/keyboard-shortcuts.spec.ts` passes on chromium and webkit with test counts unchanged.
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-palette-rows-ribbon.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report. Reviewers must not request added coverage.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Keyboard-only rows with stable heights

- [x] Hover handlers and classes removed; transaction and account rows have fixed heights; subtitle, per-row descriptions, live region, and accelerator usage removed.
- [x] Commit as `fix(command-palette): keyboard-only rows with stable heights`.

### Task 2: Modifier ribbon

- [x] The ribbon renders per the design spec with one description on the combobox.
- [x] Commit as `feat(command-palette): hang a stable modifier-action ribbon below the palette`.

### Task 3: Docs and folded assertions

- [x] Design docs, theme doc clause, package doc, and the retargeted assertions updated; `just prose-fmt` run.
- [x] Commit as `docs(command-palette): document keyboard-only rows and the action ribbon`.
