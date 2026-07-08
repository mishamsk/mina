# Plan: Web UI display and interaction papercuts — Kata issue `gm9d`

Fix the display/interaction papercuts batch: account-view currency duplication and balance alignment, record-row tag chip shadow clipping, outside-click close for detail/peek panels, and the chart-of-accounts toolbar + row quick actions (hide/unhide toggle, featured star, delete with deleteability from the new accounts API).

## Plan Context

- Ground truth (read before starting): `docs/webui-design.md` (Overlays incl. the outside-click close rule; §4 Account and group pages incl. the header currency/alignment rule; §5 Accounts incl. row actions and hidden-state rules; Theme-Agnostic Presentation Rules; Amounts and currency), `docs/webui-theme-arcade-cabinet.md` (affordance classes / RowActions treatment; records-subtable chips note; tooltips), `docs/frontend-architecture.md`. The ground-truth doc adjustments for this issue are ALREADY committed by the operator — do not edit `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, or any other ground-truth doc.
- Frontend-only (FE) scope. The needed API surface already exists (kata `jrdt`, merged): `Account.deletable` populated by `listAccounts`, `AccountGroupState.deletable` on `/api/accounts/groups`, and `POST /api/accounts/delete-by-path` (all-or-nothing subtree tombstone; 404 empty scope; 409 on active dependents).
- Current state (line numbers as of this plan's commit):
  - Account header (`frontend/src/features/accounts/account-header.tsx`): currency chip `:61-65` (`px-2 py-1 font-mono text-xs`, visually heavier than the `AccountTypeBadge` next to it); balance labels embed the ISO code — `Current {ccy}` `:112`, `Posted {ccy}` `:121`, `Credit limit {ccy}` `:132` — while the amounts already carry the symbol marker; the balances block (`:99` `lg:min-w-[28rem]` grid) leaves a dead right margin on wide screens instead of right-aligning with the content edge.
  - Currency marker helper: `frontend/src/utils/currency.ts:1-28` `currencyDisplayMarker` (symbol with ISO fallback; crypto keeps code). Amount renderers already use it. Intentional ISO-code sites that must NOT change: chart-of-accounts Currency column (`accounts-tree.tsx:455-457`, per `docs/webui-design.md` §5), the account header currency chip (code as chip is allowed), Overview balance-row currency sublabels (`overview-dashboard.tsx:210`, currency is listed content per §1), `≈ … USD` approximate aggregates (documented format), currency input/combobox fields, and the `Amount USD` filter dimension labels (they name the USD-equivalent dimension).
  - Detail records tag chips clipped: `TagChip` has `shadow-[var(--shadow-chip)]` (`tag-chip.tsx:22`) but in the detail records table the Tags cell wraps `RecordTagSet` in `<div className="max-w-full overflow-hidden">` (`transaction-detail-panel.tsx:262`) inside an `overflow-hidden` table container (`:177-178`) — the 2px bottom/right shadow is cut. Applies to both the transaction detail panel and the account peek panel (it reuses `TransactionDetailContent`, `account-peek-panel.tsx:102`). Category chips in the same table share the containers.
  - Panel close behavior: transaction detail panel (`transaction-detail-panel.tsx` `<aside role="dialog">` `:560-568`) closes only via X (`:581-589`) and Esc (`:466-479`); account peek panel (`account-peek-panel.tsx:57-62`, Esc `:38-55`) likewise. No outside-click handling; neither has a backdrop. The docked entry panel (`frontend/src/features/ledger/entry-panel.tsx:716-994`) is a separate inline/sticky surface and must not gain outside-click behavior.
  - Chart of accounts toolbar: "Include hidden" is a `<label>` wrapping a shadcn `Checkbox` (`accounts-page-content.tsx:143-152`); unlike the sibling Search/Type labels it sets no text color (`:143` vs `:99,124`), so the label text renders near-invisible on the white control.
  - Accounts tree (`accounts-tree.tsx`): separate Hidden column (header `:351-356`, cell `:463-472`) showing a static `EyeOff`, plus a mobile `EyeOff` in the Name cell (`:419-424`); trailing Actions column (header `:357-362`, cell `:473-491`) renders `RowActions` with only "Move or rename". Hide/unhide, featured, and delete all live only in the side-panel edit form (`accounts-side-panel.tsx:788-809` checkboxes, delete `:848-859` + dialog `:1044-1104`, always enabled, failure discovered via 409).
  - `RowActions` (`frontend/src/components/row-actions.tsx:12-23`): supports only `{icon, label, onSelect}` actions — no disabled state and no flat toggle icons (that support was planned in fp3e and trimmed as unused; this task builds it with real consumers).
  - Mutation plumbing to reuse: `updateLedgerAccount` (`accounts-side-panel.tsx:541-546`) for single-account `is_hidden`/`is_featured`; `setAccountHiddenByPath` (`api/openapi.yaml` `/api/accounts/set-hidden`) for group hide; `deleteLedgerAccountById`; new `deleteAccountsByPath` (generated client); `refreshAccountsAfterMutation` (`use-accounts-resource.ts:115-138`).
  - e2e that WILL need updating: `frontend/tests/e2e/accounts-page.spec.ts` — include-hidden interactions (`:270-271`, `:1178`), Hidden-column assertions (`:276-277`, `:1196-1200`), header assertions `Current USD`/`Posted USD`/`Credit limit USD` (`:396-404`), column style test (`:943-954`), delete flow (`:1128`); `frontend/tests/e2e/transactions-page.spec.ts` — detail panel open/close (`:1800`), Esc ordering (`:1968`).
- Theme contract reminders: flat toggle icons are persistent bare glyphs — `--muted-foreground` when off, yellow-filled star when featured, ink eye-off when hidden — with hover ink and tooltips; disabled icon buttons use `--muted-foreground` outline/glyph with an explanatory tooltip; the outside-click rule says the click still performs its normal action on the underlying content, and a click that opens another record simply moves the panel; centered dialogs (delete confirmations) stay modal and must not count as "outside".
- Scope exclusions: no API/backend changes; no ground-truth doc edits; no changes to the inline expanded records subtable in the transactions list (it stays plain text); no entry-panel changes; no register filter bar; leave the side-panel edit form's hidden/featured checkboxes and delete button working as today.
- Protect — do not regress: fp3e behavior (trailing actions columns, hover/focus reveal, chips filter in place, collapse ladder incl. actions overflow fold at narrow widths — the new toggles must stay visible at rest per the design rule while button-class actions stay hover-revealed); restructure flows and their e2e; keyboard driving (row focus, Enter/Space, Esc ordering with popovers and dialogs); detail deep links; single-height rows; banded rows; `just test-frontend-e2e` green.

## Tasks

### Task/Commit 1: Account header currency dedup and balance alignment

After this commit the account/group register header shows the currency exactly once as a compact chip, balance labels are plain, and the balances block right-aligns with the content edge.

- [x] `account-header.tsx`: size the currency chip like the adjacent `AccountTypeBadge` (one visual family, sitting together); drop the ISO code from the balance labels — "Current", "Posted", "Credit limit" — leaving the currency to each amount's own marker; right-align the balances block with the content's right edge on wide screens (no dead margin), mirroring the account name's left margin.
- [x] Audit the rest of the web UI for stray ISO codes where a symbol belongs (amount-adjacent markers); fix any found, leaving the intentional ISO-code sites listed in Plan Context untouched.
- [x] Update `accounts-page.spec.ts` header assertions (plain labels, chip present) and keep the currency-symbol e2e in `transactions-page.spec.ts` green.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Record-row tag chip shadows and outside-click panel close

After this commit detail/peek record chips render their full hard shadow, and the transaction detail and account peek panels close on outside click.

- [x] Stop clipping chip shadows in the detail records table (both panels): give the Tags/Category cells room for the 2px `--shadow-chip` offset (or stop the `overflow-hidden` wrappers from cutting it) without growing row height or breaking the responsive stacking of the detail records table.
- [x] Outside-click close for the transaction detail panel and the account peek panel per the Overlays rule: a pointer-down outside the panel closes it while the click still performs its normal action underneath; clicks inside the panel, inside centered dialogs (e.g. delete confirmation), or inside portal overlays anchored in the panel (tooltips, popovers, pickers) never close it; a click that opens another transaction/record just moves the panel; the docked entry panel keeps its current behavior. Esc ordering (dialog before panel; filter popover before panel) is unchanged.
- [x] e2e: outside-click closes the transaction detail panel (and the peek panel in the register spec) while a row click still expands/moves as expected; chip shadow fix gets a cheap assertion only if practical, otherwise verify visually and say so in the commit message.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Chart of accounts — include-hidden toggle and hidden indicator placement

After this commit the toolbar's include-hidden control is a visible eye icon button and the hidden state is a row indicator, not a column.

- [x] Replace the "Include hidden" checkbox+label with an eye icon toggle button (pressed state visible, tooltip + accessible label, readable in the toolbar context) keeping the `?hidden=true` URL behavior.
- [x] Remove the separate Hidden column; render the standard eye-off indicator on the row itself (the existing Name-cell indicator becomes the one placement at all widths); rebalance column widths.
- [x] Update the accounts e2e for the new toggle and indicator (`:270-277`, `:1178-1200`, column style test).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 4: Chart of accounts row quick actions — hide toggle, featured star, delete

After this commit every tree row carries its applicable quick actions in the trailing actions column per the affordance-class rules, wired to the deleteability flags.

- [x] Extend `RowActions` with the two missing affordance kinds: flat toggle icons (persistent bare glyphs, off = `--muted-foreground`, on = accent per theme, hover ink, tooltip, keyboard operable) and disabled button-class actions (muted outline/glyph + explanatory tooltip, not focus-trapped away). Keep the existing hover/focus reveal for button-class actions and the overflow fold contract intact.
- [x] Accounts tree rows (`Leaf and group rows carry the actions that apply to them`):
  - Leaf: hide/unhide flat toggle (ink eye-off when hidden) via `updateLedgerAccount`; featured star flat toggle (yellow-filled when featured) via `updateLedgerAccount`; delete icon button — enabled per `account.deletable` from the listing, disabled with an explanatory tooltip otherwise; activation opens the standard confirm dialog then `deleteLedgerAccountById`.
  - Group: hide/unhide flat toggle via `setAccountHiddenByPath` (group `is_hidden` from the group state); delete icon button — enabled per `AccountGroupState.deletable`, disabled with tooltip otherwise; activation opens a confirm dialog naming the subtree and count consequence, then `deleteAccountsByPath`; surface a 409 as the standard error.
  - Move/rename stays; toggles must not trigger the row's edit-panel click; every mutation refreshes via `refreshAccountsAfterMutation`.
- [x] e2e: hide toggle hides a row (and include-hidden shows it with the indicator); star toggles featured (assert via the balance strip or refetched flag); delete disabled tooltip on an undeletable row; successful leaf delete; group delete flow hitting `/api/accounts/delete-by-path` (success and a 409-conflict path using demo data or a created fixture).
- [x] Update `PROJECT_STATE.md` accounts/web-UI line to reflect chart-of-accounts quick actions if it tracks that surface.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Web UI papercuts (kata gm9d): account header currency dedup (chip sized like type badge, plain balance labels, right-aligned balances); record-row tag chip shadows unclipped in detail/peek records; detail and peek panels close on outside click per the Overlays rule (entry panel unchanged); chart of accounts include-hidden eye toggle, hidden column removed in favor of row indicator, and row quick actions (hide toggle, featured star, delete driven by Account.deletable / AccountGroupState.deletable, group delete via delete-by-path). Constraints: frontend-only; no ground-truth doc edits (operator already adjusted docs); chart-of-accounts currency column keeps ISO code; inline expanded records subtable stays plain text; fp3e affordance behavior preserved."`
- [x] Move this plan to `docs/plans/completed/`
