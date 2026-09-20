# Plan: Replace the Cmd/Ctrl+L search chord with Cmd/Ctrl+Shift+F

## Goal

`Cmd+L` is browser-reserved in Safari and Firefox, so pages cannot intercept it. Rebind both Mina uses of the primary-modifier `L` chord to `Cmd/Ctrl+Shift+F`: the global list-search focus shortcut and the modal-scoped Start-from-a-template shortcut. `/` stays the primary list-search key. No other behavior changes.

## Constraints

- Do not run review-loop.
- `docs/FRONTEND-TESTING.md` governs. Do not add e2e tests; reviewers must not request coverage; fold any missing assertion into an existing journey. Net e2e `test(` count stays at most 137 (`rg -n '^test\(' frontend/tests/e2e`).
- Narrow change only: key matching, help catalog entries, and the documentation sentences that name the chord. Do not change dispatch guards, focus behavior, availability logic, group ordering, or anything else.
- Frontend-only; no Go changes. Validation: `just pre-commit` and `just test-frontend-e2e` before the implementation commit; Justfile recipes only. Run `just prose-fmt` after doc edits.
- Close every `agent-browser` session opened before finishing.

## Success Criteria

- [x] `Cmd/Ctrl+Shift+F` (metaKey or ctrlKey, shiftKey, no Alt, key `f`/`F` case-insensitive) focuses and selects the visible list search exactly where `Cmd/Ctrl+L` did; inside the entry modal it opens Start from a template under the existing availability rule, and is consumed under the existing rule. `Cmd/Ctrl+L` is no longer handled anywhere.
- [x] `?` help shows `Cmd/Ctrl Shift F` for both the `List search` group entry and the `Transaction entry` "Start from a template" entry, rendered through the existing `Kbd` component (`["Mod", "Shift", "F"]`, matching the existing `["Mod", "Shift", "Enter"]` entry).
- [x] `docs/webui-design.md`, `PROJECT_STATE.md`, `frontend/src/features/app-shell/PACKAGE.md`, and `frontend/src/features/ledger/PACKAGE.md` name `Cmd/Ctrl+Shift+F` wherever they named `Cmd/Ctrl+L` or "primary-modifier+L"; no other doc edits.
- [x] `just pre-commit` and `just test-frontend-e2e` pass; e2e count unchanged at 137.
- [x] Commit as `fix(frontend): rebind search chord from Cmd/Ctrl+L to Cmd/Ctrl+Shift+F`, then move this plan to `docs/plans/completed/`, commit the move as `docs: complete search chord rebind plan`, and leave the worktree clean.

## Tasks

### Task 1: Rebind the chord

- [x] `frontend/src/features/app-shell/global-shortcuts.ts:~26-35` `matchesListSearchShortcut`: replace the `l` + primary-modifier branch (currently `!shiftKey`) with `f` + primary-modifier + `shiftKey` + `!altKey`. Keep the plain `/` branch unchanged.
- [x] `frontend/src/features/app-shell/use-list-search-shortcuts.ts:~11-15`: entry id `list-search-primary-l` → `list-search-primary-shift-f`, keys `["Mod", "Shift", "F"]`, label unchanged.
- [x] `frontend/src/features/ledger/entry-panel.tsx:~5285-5292` modal handler: match `event.key.toLowerCase() === "f"` with `(metaKey || ctrlKey)`, `shiftKey`, `!altKey`; everything after the match (guards, consumption, open) unchanged.
- [x] `frontend/src/features/ledger/entry-shortcuts.ts:~25`: keys `["Mod", "Shift", "F"]`; label and detail unchanged.
- [x] Docs: `docs/webui-design.md:177` (two mentions: list search and the modal-scoped clause), `PROJECT_STATE.md:37`, `frontend/src/features/app-shell/PACKAGE.md:12` ("primary-modifier+L"), `frontend/src/features/ledger/PACKAGE.md` (any `Mod+L` / `Cmd/Ctrl+L` mention). Replace the key name only.
- [x] Quick browser check with `agent-browser`: on Transactions press `Cmd+Shift+F` → search focused; open the modal with `n` and press `Cmd+Shift+F` → template picker open; `?` shows the new key in both groups. Close the session.
- [x] Run `just prose-fmt`, `just pre-commit`, `just test-frontend-e2e`, then commit as directed.
