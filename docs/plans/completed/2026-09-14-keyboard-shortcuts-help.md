# Plan: Page-aware keyboard shortcuts help (Kata f6qg)

## Goal

Pressing `?` anywhere opens a polished, keyboard-accessible modal listing the keyboard shortcuts available in the current context (global shortcuts plus the groups registered by the active route and any open overlay), and the command palette offers a "Keyboard shortcuts" action that opens the same modal. Closing it restores focus to the invoker.

- One registry of shortcut groups that pages and overlays register on mount, so the modal reflects route and page context without a hand-maintained per-route table in the shell.
- A shared `Kbd` primitive used by the modal and the command palette.
- Browser coverage for open via `?`, open via the palette action, suppression while typing or while the palette is open, and focus restoration.

## Constraints

- Kata issue: `f6qg`.
- Architecture (per `docs/frontend-architecture.md` package boundaries and Zustand conventions):
  - `frontend/src/store/keyboard-shortcuts.ts`: shortcut and group types (`id`, `keys` token list, `label`, optional `detail`; group `id`, `title`, `order`, `shortcuts`), a `groups` map, and a `launch` with `opener` and a monotonic key; actions `registerShortcutGroup`, `unregisterShortcutGroup`, `openKeyboardShortcuts(opener?)`, `closeKeyboardShortcuts`; selectors with `useShallow`; a `getKeyboardShortcutsSnapshot` getter; devtools action names `KeyboardShortcutsStore/...`; exported through `frontend/src/store/index.ts`. Model on `frontend/src/store/template-editor.ts`.
  - `frontend/src/hooks/use-shortcut-group.ts`: generic mount/unmount registration hook (callers memoize the group), mirroring the edit-mode availability registration in `frontend/src/features/ledger/use-transaction-browser-page.ts`.
  - `frontend/src/components/ui/kbd.tsx`: `Kbd` primitive lifting the exact chip classes from the palette header (`bg-muted border-2 border-[var(--border-ink)] px-1.5 py-0.5 font-mono text-xs shadow-[var(--shadow-chip)]`); refactor the palette header chip to use it.
  - `frontend/src/features/app-shell/global-shortcuts.ts`: extract `modalOverlaySelector`, `isVisibleOverlay`, `hasActiveOverlay`, a new exported `isEditableTarget`, and the static global catalog (`Cmd/Ctrl K` open palette, `n` new transaction, `?` keyboard shortcuts, `Esc` close the topmost overlay) out of `app-shell.tsx`; the `?` handler and the modal consume this single source.
  - `frontend/src/features/app-shell/keyboard-shortcuts-dialog.tsx`: the shell-owned modal, mounted beside `CommandPalette` in `app-shell.tsx`; a Radix `Dialog` imported from `radix-ui` like the other modals (no new generic dialog wrapper unless it is trivially thin); focus restore copied from `frontend/src/features/templates/template-editor-modal.tsx` (`onCloseAutoFocus` preventDefault + `focusWithoutTooltip(launch.opener)` with the `main h1[tabindex='-1']` fallback).
- `?` handler: match `event.key === "?"`, reject when meta/ctrl/alt are held, when `hasActiveOverlay()` is true, or when `isEditableTarget(event.target)`; capture the invoker as `document.activeElement` (or undefined) as the opener. The open modal is a `[role='dialog'][aria-modal='true']`, so `n`, `Cmd/Ctrl K`, and a second `?` are suppressed by the existing overlay guard without extra bookkeeping. `Escape` closes the modal.
- Command palette: add a `Keyboard shortcuts` item to the Actions group with keywords ("help", "keys", "hotkeys"). Because `activateCommand` closes the palette and restores focus before running the action, pass the palette's saved restore target (the pre-palette active element) as the modal opener so closing the modal returns focus there. Add an optional `shortcut` token list to `CommandItem`, rendered as `Kbd` on the option row (show `?` on the new item and `n` on the new-transaction entry commands); no other palette behavior changes.
- Modal content and design (`docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`): landmark treatment (white surface, 2px ink outline, pixel shadow, mono bold uppercase title "Keyboard shortcuts"), a centered dialog narrower than the entry stage (about `w-[min(640px,calc(100%-2rem))]`, max height with the title pinned and the body as the single scroll region), groups ordered global first then registered groups by `order`, each shortcut as a row with `Kbd` chips on the left and the label plus optional muted detail on the right, close button with `aria-label="Close keyboard shortcuts"`. Render the `Mod` token deterministically as `Cmd/Ctrl`, matching the existing palette chip; do not add platform sniffing.
- Catalog registration (each where the keys live; register only what is implemented and only while it applies):
  - Transactions browse: `↑/↓` move row focus, `Enter`/`Space` open detail, `Esc` close detail (`frontend/src/features/ledger/transaction-browser.tsx`, detail panel).
  - Transactions Edit mode (registered only while Edit mode is enabled): `Cmd/Ctrl A` select all, `Shift ↑/↓` and `Shift Space` extend selection, `Enter`/`Space` toggle selection, `a`/`c`/`m`/`t` open the Account/Category/Member/Tags dock, `Esc` ladder (dock, selection, Edit mode).
  - Account and group registers: `↑/↓`, `Enter`, `Esc` (`frontend/src/features/accounts/account-register-table.tsx`).
  - Reference tables (accounts, categories, tags, members, templates): `Enter`/`Space` open the row destination (`frontend/src/features/reference/reference-tree.tsx`, accounts tree, members list).
  - Status: `←/→`, `Home`, `End` switch tabs; `↑/↓`, `Enter`/`Space` in the audit log.
  - Recurring: `Enter`/`Space` open a definition; `Esc` discards the editor draft while the editor is open.
  - Entry modal (while open): `Cmd/Ctrl Enter` save and add another or update, `Cmd/Ctrl Shift Enter` save and close, `Esc` closes the picker then the modal; hierarchical picker keys (`↑/↓`, `Enter`, `Tab`/`→` commit a segment, `←`/`Backspace` back out, hold `Cmd/Ctrl` to reveal full paths, `Esc`).
  - Command palette (while open): `↑/↓`, `Enter`, `Space` on an empty query starts transaction search, `Tab` cycles focus, `Esc`.
  - Do not list "focus list search": it is not implemented. Remove that phrase from the global-shortcuts bullet in `docs/webui-design.md` (stale statement; operator-authorized correction).
- Preserve every existing shortcut behavior, overlay guard ordering, and palette focus restoration. The `n` and `Cmd/Ctrl K` handlers keep their current guards.
- Browser coverage per `docs/FRONTEND-TESTING.md`: a new `frontend/tests/e2e/keyboard-shortcuts.spec.ts` with three tests: (1) on `/transactions`, focus a row, press `?`, assert the dialog named "Keyboard shortcuts" shows a global entry and a Transactions entry, press `Escape`, assert focus returned to that row; (2) the palette "Keyboard shortcuts" action opens the same dialog and closing restores focus to the pre-palette element; (3) `?` typed into a focused text input and `?` pressed while the palette is open do not open the dialog. Web-first assertions only.
- Docs: `docs/webui-design.md`: add `?` to the Keyboard section's global-shortcuts bullet (and drop "focus list search"), add "open keyboard shortcuts help" to the Command Palette app-actions bullet, and add `KeyboardShortcutsDialog` and `Kbd` bullets to Shared Design Primitives; `PROJECT_STATE.md` one phrase; package docs for app-shell, command-palette, store, hooks, components/ui, and every feature that registers a group, via the `write-package-docs` skill. Do not change `docs/architecture.md`, `docs/frontend-architecture.md`, `docs/webui-theme-arcade-cabinet.md`, `VISION.md`, or `SCOPE.md`.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo`: `?` opens the modal on Overview (global group only), on Transactions (plus browse group; plus Edit-mode group once Edit mode is on), on an account register, on Categories, on Status, and on Recurring with the right groups; the palette action opens it; `Escape` and the close button close it and focus returns to the invoker; `?` inside inputs or over an open overlay does nothing.
- [x] The modal matches the cabinet landmark treatment and reads cleanly at 1280×800 and at a phone width.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e` passes (full suite: the palette and shell changed).
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-keyboard-shortcuts-help.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report.
- [x] Close Kata `f6qg` with the commits and validation evidence (`kata close f6qg --done --message "..." --commit <sha> --test "<suites>" --agent`).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Registry, hook, Kbd primitive, and extracted global-shortcut helpers

- [x] Store, hook, `Kbd`, and `global-shortcuts.ts` exist per Constraints; the palette header chip uses `Kbd`; `app-shell.tsx` consumes the extracted helpers with no behavior change.
- [x] Commit as `feat(frontend): add a keyboard shortcut registry and Kbd primitive`.

### Task 2: Shortcuts dialog, `?` handler, and palette action

- [x] The dialog renders the global catalog plus registered groups, opens via `?` and via the palette action, closes on Escape and the close button, and restores focus to the opener; palette items can show `Kbd` hints.
- [x] Commit as `feat(app-shell): add the keyboard shortcuts help dialog`.

### Task 3: Register page and overlay shortcut groups

- [x] Every group listed in Constraints registers while it applies and unregisters on unmount or when its condition ends (Edit mode, open overlays).
- [x] Commit as `feat(frontend): register page and overlay keyboard shortcut groups`.

### Task 4: Browser coverage

- [x] `keyboard-shortcuts.spec.ts` passes on chromium and webkit; the full suite passes.
- [x] Commit as `test(frontend): cover the keyboard shortcuts help dialog`.

### Task 5: Docs

- [x] Design doc, PROJECT_STATE.md, and package docs updated; `just prose-fmt` run.
- [x] Commit as `docs: document keyboard shortcuts help`.
