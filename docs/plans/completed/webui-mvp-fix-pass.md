# Plan: Web UI MVP fix pass — review findings from the Paper Arcade slice

Fix defects found in the post-implementation review of the web UI MVP (`docs/plans/completed/webui-mvp-paper-arcade.md`). Findings come from a code audit against `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-paper-arcade.md`, and a live Playwright assessment against `mina serve --demo`. This is a fix pass: no new features, no scope beyond the items below.

## Plan Context

- Ground truth: `docs/webui-design.md` and `docs/webui-theme-paper-arcade.md` win over the current implementation wherever they disagree. Do not edit their requirements to match code; Task 1 reverses one such edit.
- The MVP implementation is largely sound — architecture boundaries, token layer, motion, store conventions, and aria labeling were verified good. Do not refactor beyond the listed fixes.
- Verified defect evidence (live, demo data): buttons report `outline-style: none` on focus; picker ArrowDown+Enter does not select; transfer lines render an empty Amount cell; adjustment `+1,000.00` renders in money-in green; the entry panel overlays the table hiding the Amount column and pagination; row click does not expand records; `N` focuses the panel close button, so `Cmd+Enter` submit does not fire; `/ui/status` and `/ui/transactions?page=2&pageSize=10` both land on `/transactions` losing path and query; a stale "Enter a positive amount" error persists after a valid amount is entered.
- `Transaction.components` (generated type) carries per-intent display amounts; use it for transfer/exchange line amounts — server values only, no client summing.

## Tasks

### Task/Commit 1: Restore design-doc phasing and reconcile theme tokens

The implementation pass edited `docs/webui-design.md` to demote balance-backed surfaces (Overview, balance strip, account balances, running balance, featured flag) from Phase 2 to Phase 3 — trimming ground truth to fit the current API, which the doc's own Backend Additions section forbids. Restore the doc; the theme doc and `styles.css` also disagree on two token values.

- [x] Revert the phasing changes introduced by commit `cd80f9d` in `docs/webui-design.md`: Overview is a Phase 2 screen; the featured-account balance strip, account/group balances, running balance column, and featured-account metadata return to their pre-`cd80f9d` wording (balance capabilities are Backend Additions planned with their owning screens, not Phase 3 deferrals)
- [x] Reconcile token values so `frontend/src/styles.css` and `docs/webui-theme-paper-arcade.md` agree: `--muted-foreground` (doc `#6B6686` vs css `#686280`) and violet bright (doc `#8F78FF` vs css `--color-interactive-bright: #9a86ff`) — pick one value per token with a WCAG AA contrast check recorded in the commit message, and update the lagging side
- [x] Document the implementation-added tokens (`--color-money-out`, `--color-interactive-ink`/`-bright`) in the theme doc's extended namespace, or remove them if redundant
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Task/Commit 2: Focus ring, picker keyboard support, entry focus flow

The theme's focus contract and the design's keyboard rules are broken at the three most-used interaction points. These are the highest-priority code fixes.

- [x] Remove `outline-none` from `components/ui/button.tsx` and `components/ui/checkbox.tsx` so the global `:focus-visible` ring (2px `--ring`, offset 2px) applies; sweep other components for the same suppression; verify no component removes or restyles the ring
- [x] Make `EntityPicker` a real keyboard combobox: ArrowUp/ArrowDown move an active option, Enter selects it, Esc closes the list; add `role="listbox"`/`role="option"` and `aria-activedescendant`; option selection must survive the input blur (do not dismiss the list before a click/Enter commits)
- [x] Focus the first form field (Date) when the entry panel opens via `N` or the header action; `Cmd+Enter` must submit whenever focus is anywhere inside the panel
- [x] Clear a field's validation error when its value becomes valid (revalidate on blur/change), instead of holding stale errors until the next submit
- [x] Extend e2e: a keyboard-only spend entry — `N`, type through fields, select funding/merchant/category via arrows+Enter, submit with `Cmd+Enter`, assert the transaction appears and session tally increments
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Domain display fixes in the transaction browser

Several Domain Display Rules are violated on the core table; all fixes render server-provided values only.

- [x] `AmountText`: color by class, never by sign — income green ink, refund teal ink, everything else `--foreground`; live evidence: adjustment `+1,000.00` currently renders green
- [x] Transfer and exchange lines must show their movement amounts on the line (currently an empty Amount cell): render from the server's `components` display amounts — transfer as neutral moved amount, exchange as sold and bought amounts
- [x] Whole-row click toggles expansion (keep the chevron and its `aria-expanded`; ignore clicks originating on interactive elements inside the row)
- [x] `primaryCategory`: replace the `records[0]` pick with the uniformity rule — show the category only when identical across all active records, otherwise render nothing; document it as a display convention in `features/ledger/PACKAGE.md` alongside the counterparty title and the `C::` currency-scale convention
- [x] Hide the reconciliation status chip while a record has the default `RECONCILED` value (the indicator is reserved for Phase 5 import flows)
- [x] Counterparty titles use a real arrow `→`, not ASCII `->`
- [x] `FqnPath`: middle-truncate ancestors on overflow (`banks:…:Joint`), keeping root and leaf
- [x] Amount grouping via `Intl.NumberFormat` (locale-grouped) while preserving the fixed-scale decimal string precision
- [x] Sticky table header (`thead` sticky within the scroll container)
- [x] Extend e2e: transfer line shows its moved amount; row click expands records
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 4: Entry panel layout and empty state

The docked panel exists to keep the list usable while entering; occluding the Amount column defeats it.

- [x] Entry panel must reflow the content area (shared layout, no overlay occlusion): with the panel open, the transactions table — including the Amount column — and pagination remain fully visible and interactive at the default desktop viewport
- [x] Empty state gains its primary action: a "New transaction" button that opens the entry panel (per design and theme empty-state rules)
- [x] Extend e2e: with the panel open, the Amount column header stays within the viewport
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 5: Routing base path, status page, and small cleanups

Deep links and the remaining minor findings.

- [x] Fix `/ui/*` deep links: `/ui/status` and `/ui/transactions?page=2` currently land on `/transactions`, dropping path and query. Either serve the SPA with a `/ui` router basename or redirect `/ui/*` to the root-path equivalent preserving path and query; align `PROJECT_STATE.md` (which says the UI is served under `/ui/`) and `docs/frontend-architecture.md` with the chosen reality in the same commit
- [x] Status page error state uses the two-tier pattern (plain-language message + expandable machine-readable error), mirroring the transaction browser's implementation
- [x] `CardTitle`: stop applying Silkscreen unconditionally — pixel font only for short (≤ ~12 chars) uppercase titles on the 8/16/24/32 grid; longer headings use the body family; remove the off-grid 14px heading variant
- [x] `ClassBadge`: `mixed` renders outlined-only with transparent fill (not `bg-card`); `spend` uses the `--muted` token instead of a duplicated hex value
- [x] Move the post-save "locate the created transaction's page" workflow out of `pages/transactions-page.tsx` into `features/ledger`, and bound it (the current loop issues up to 25 sequential page fetches): prefer a simple, bounded reveal — refresh the current page and confirm via toast if the transaction is elsewhere
- [x] Move UI draft/preference shapes (`SpendEntryDraft`, `UiPreferences`, `StatusPageUiState`) from `services/indexeddb` to `frontend/src/models`, importing them into the service
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
- [x] Run `just review-loop "<Web UI MVP fix pass: restore design-doc phasing; focus ring + picker keyboard + entry focus; class-driven amount colors and transfer line amounts from server components; panel reflow; /ui deep links; no new features beyond listed fixes>"`
- [x] Move this plan to `docs/plans/completed/`
