# Plan: Shared themed dropdown — create and adopt everywhere it fits (Kata d9hq)

Give Mina one shared, arcade-themed dropdown component and use it for every single-select control. The audit found there is NO shared dropdown component today: exactly 7 native `<select>` elements exist, each ad-hoc styled with the same theme classes, and their option popups render OS-native (visually off-theme). Build a themed Select primitive on Radix Select (the `radix-ui` unified package already in `package.json:11` includes it), adopt it at all 7 sites, and record the deliberate exceptions on the kata issue.

## Plan Context

- Kata issue: `d9hq`. Related: `d8z6` (the toolbar redesign lands NEXT on top of this — keep the class dropdown API clean but do not redesign the toolbar here).
- MANDATORY pre-reads: `docs/frontend-architecture.md` (shadcn primitives live in `src/components/ui` owned as source), `docs/webui-theme-arcade-cabinet.md` (hard shadows `:90`, press feedback `:91`, landmark popups `:128`, tooltips-only-flat `:132`, focus contrast `:136`), `docs/webui-design.md`, `docs/TESTING.md`.
- Component (decided): a shadcn-style Select primitive in `frontend/src/components/ui/select.tsx` built on Radix Select from the `radix-ui` package (matching how button/checkbox/popover/tooltip are owned as source), arcade-styled:
  - Trigger: match the EXISTING native select styling exactly so nothing shifts visually — `bg-card text-foreground border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]`, with size variants for the current `h-9` (toolbar/filter/form) and `h-8` (page-size "Rows") sites, plus a themed chevron. Press/focus states per theme doc `:91`/`:136`. Do NOT switch small controls to `--shadow-chip` in this task — that would change toolbar alignment, which `d8z6` owns.
  - Content/listbox: landmark treatment per theme doc `:128` (white/card surface, 2px ink outline, `--shadow-pixel`), item highlight consistent with `EntityPicker`'s listbox (`src/features/ledger/entity-picker.tsx:172-196`), Radix-provided keyboard/typeahead/a11y.
  - Must support disabled options (the entry-panel posting-status select conditionally disables one option, `entry-panel.tsx:2611`) and a per-item `data-testid`/value attribute for e2e.
- Adoption sites (all 7 native selects; keep each site's label, id wiring, value semantics, and callbacks unchanged):
  1. `src/features/ledger/transaction-browser-toolbar.tsx:113` — transaction class filter.
  2. `src/features/ledger/transaction-browser.tsx:904` — page-size "Rows" (h-8).
  3. `src/features/accounts/account-register-table.tsx:498` — register page-size "Rows" (h-8).
  4. `src/features/accounts/accounts-page-content.tsx:129` — account type filter.
  5. `src/features/accounts/accounts-side-panel.tsx:666` — account type in the create form (edit mode keeps the badge).
  6. `src/features/categories/categories-side-panel.tsx:374` — category economic intent (edit mode keeps the badge).
  7. `src/features/ledger/entry-panel.tsx:2596` — advanced-record posting status (sr-only label preserved).
- Deliberate exceptions (do NOT convert; list them in the kata close message): `EntityPicker`/`EntityMultiPicker` (search comboboxes), the command-palette listbox, the account currency datalist combo (`accounts-side-panel.tsx:686`), and the entry-panel free-text currency input.
- e2e updates: `page.selectOption()` only works on native selects, so rewrite these six interaction sites to the themed-dropdown pattern (click trigger by accessible name/label → click `role="option"` by name; add a tiny shared helper in the spec support code if one exists, otherwise inline consistently):
  - `transactions-page.spec.ts:1006` (Rows), `:1165,1176,1190,1212` (Class)
  - `accounts-page.spec.ts:259,272` (Type filter), `:562` (Rows), `:1386,1568` (create-form Type)
  - `categories-page.spec.ts:502` (Intent)
  Assertions about resulting behavior stay untouched; only the interaction mechanics change. Everything else in the suite must stay green.
- A11y requirement: the trigger must remain associated with its visible label (the current `<label htmlFor>` wiring) — Radix Select trigger accepts an id; verify `getByLabel` still resolves it in specs.
- Docs: update `frontend/src/components/ui/PACKAGE.md` if it enumerates owned primitives. No ground-truth doc edits (`docs/webui-theme-arcade-cabinet.md` and `docs/webui-design.md` stay untouched). No PROJECT_STATE.md change.
- Note for honesty in the kata close: the issue text assumed the component existed; the audit showed it did not (7 ad-hoc native selects), so this task created it and adopted it everywhere it fits.

## Tasks

### Task/Commit 1: Themed Select primitive

- [x] Add `frontend/src/components/ui/select.tsx` (Radix Select from `radix-ui`, arcade styling per Plan Context: trigger variants h-9/h-8, ink border, pixel shadow, themed chevron, landmark content panel, disabled-option support, keyboard/typeahead from Radix).
- [x] Update `src/components/ui/PACKAGE.md` if it lists primitives.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `d9hq` (`kata comment d9hq --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Adopt at all seven sites + e2e interaction updates

- [x] Replace the seven native selects listed in Plan Context with the themed Select; preserve labels, ids, values, callbacks, and layout sizing exactly.
- [x] Update the six `selectOption` e2e interaction sites to the themed-dropdown pattern; keep all behavioral assertions unchanged.
- [x] Add one e2e assertion that the class-filter dropdown opens a themed listbox (ink-outlined panel with role="listbox"/options) — the smoke for the new pattern.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `d9hq` (`kata comment d9hq --agent ...`; include the deliberate-exceptions list)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Themed dropdown create-and-adopt (kata d9hq): new shadcn-style Radix Select primitive in components/ui with arcade trigger matching existing native-select styling exactly (h-9/h-8 variants, ink border, pixel shadow) and landmark listbox panel; adopted at all 7 native select sites (class filter, two Rows selects, account type filter+form, category intent, posting status with disabled option); EntityPicker/command-palette/currency-datalist are deliberate exceptions; six selectOption e2e sites rewritten to click-trigger-click-option with behavioral assertions unchanged; theme and design docs untouched"` *(Intentionally skipped per the operator fix-plan rules; this plan is validation-only.)*
- [x] Move this plan to `docs/plans/completed/`
