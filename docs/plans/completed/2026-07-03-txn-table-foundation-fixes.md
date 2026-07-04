# Plan: Transaction table foundation bug fixes (Kata fe08)

Fix five operator-reported bugs on the Phase 2 transactions page so the table foundation is solid: unified flat tooltips, correct/complete tag rendering with ellipsis overflow, consistent bottom insets, contained amounts, and currency-symbol markers.

## Plan Context

- Mandatory reading before any change: `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`.
- Ground truth was already updated for this work and is committed on this branch — implement against it, do not re-edit these docs:
  - `docs/webui-theme-arcade-cabinet.md` Component Notes now define the single flat tooltip treatment.
  - `docs/webui-design.md` now specifies currency-symbol markers with ISO-code fallback and the consistent pagination-footer bottom inset.
- This branch is frontend-only. No Go changes, no OpenAPI changes, no generated-client regeneration, no new UI features (no detail view, no filters, no new screens).
- Protect — do not regress: responsive column collapse across container widths 700–1600, keyboard `N` spend entry flow, server pagination with keep-previous-page behavior, banded-table theme treatment, existing entry-panel behavior (except the lookup-resolution change in Task 2), amounts never truncated with ellipsis.
- Existing e2e assertions that encode the old behavior (native `title` attributes on class/status icons, `USD` code text in amounts) must be updated in the same task that changes the behavior — never deleted without a replacement assertion of equal strength.
- Kata issue: fe08.

## Tasks

### Task/Commit 1: One flat tooltip treatment

Replace the divergent tooltip presentations (chip-styled popups over chips, pixel-shadow card popups, doubled native browser tooltips) with exactly one flat tooltip per the theme spec: ink fill (`--border-ink`), `--frame-foreground` text, 12px mono, square, no outline, no shadow, rendered above all surfaces and never clipped.

- [x] Rework `frontend/src/components/tooltip.tsx` to the flat treatment; prefer the shadcn/ui tooltip primitive (Radix, portal-based) added under `frontend/src/components/ui/` and wrapped by the existing `Tooltip` component API so call sites stay small
- [x] Remove doubled native tooltips: the wrapper `title` attribute in `tooltip.tsx` and the inner `title` on the icon spans in `frontend/src/features/ledger/line-icons.tsx` (ClassIcon/StatusIcon); keep accessible names (`role="img"` + `aria-label`)
- [x] Verify every tooltip call site uses the one treatment: `ClassIcon`/`StatusIcon` (`line-icons.tsx`), category leaf chip and full path (`fqn-path.tsx:24-50`), `TagChip` and memo second line (`transaction-browser.tsx`) — anchor styling (chips) stays on the anchor, popup styling comes only from the shared tooltip
- [x] Confirm tag-chip tooltips are no longer clipped by the tags cell `overflow-hidden` container (`transaction-browser.tsx:450`)
- [x] Update `frontend/tests/e2e/transactions-page.spec.ts` assertions that rely on native `title` attributes: keep accessible-name assertions, assert the styled tooltip becomes visible on hover for at least one class icon and one tag chip
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue fe08
  - [x] Commit changes

### Task/Commit 2: Correct and complete tag rendering

Tag chips on transaction lines can be wrong (hidden/tombstoned tags silently dropped by lookup resolution, display order from lexicographic numeric sort) and overflow is clipped with no indicator, violating the design's single-line-with-ellipsis rule.

- [x] Fix lookup resolution so names resolve for entities referenced by records even when hidden or tombstoned: fetch resolution lookups in `frontend/src/api/ledger.ts:37-81` with `include_hidden: true` (and `include_tombstoned: true`) for tags, categories, accounts, and members
- [x] Keep pickers excluding hidden/tombstoned entities by default: filter picker option lists (entry panel / `entity-picker.tsx`) at the picker layer, not in the resolution maps
- [x] Fix tag ordering in `lineTags` (`frontend/src/features/ledger/format.ts:262-280`): numeric-safe comparison for the uniformity check, and stable display order by resolved tag name
- [x] Implement overflow per `docs/webui-design.md` tag rules: single line, no row-height growth, a visible ellipsis indicator when chips are cut off (`transaction-browser.tsx:450-461`); the full tag set stays reachable (tooltip on the indicator or the chips)
- [x] Add e2e coverage: a transaction whose records carry a hidden tag renders that tag's leaf name; a many-tag transaction shows the ellipsis indicator on one line
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue fe08
  - [x] Commit changes

### Task/Commit 3: Consistent bottom insets and contained amounts

The main content area has `pb-0` so the pagination footer sits flush against the viewport while the sidebar collapse button sits inside a `p-3` block; long amounts bleed outside their chips/cells.

- [x] Give the content area a consistent small bottom inset matching the sidebar bottom-control inset (`p-3`, `frontend/src/features/app-shell/app-shell.tsx:193`): adjust `app-shell.tsx:219-224` (`pb-0`) and the page-section height calc in `frontend/src/pages/transactions-page.tsx:102-104` so the pagination footer bottom edge aligns with the sidebar collapse-button block per `docs/webui-design.md`
- [x] Contain amounts: long display amounts (large USD values, crypto with 8 decimals) must never bleed outside the amount chip or the amount cell (`frontend/src/features/ledger/amount-text.tsx`, `transaction-browser.tsx:472-497`, `.transactions-amount-column` widths in `frontend/src/styles.css`); amounts must stay untruncated — solve with layout (column width/collapse priority, chip wrapping), not ellipsis
- [x] Add e2e coverage: bounding-box assertions that the amount chip stays within its cell for a long-amount transaction across container widths; footer bottom inset equals the sidebar control inset
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue fe08
  - [x] Commit changes

### Task/Commit 4: Currency symbols instead of codes

Display amounts show ISO codes (`−1,234.56 USD`); per the updated `docs/webui-design.md` they must show the conventional currency symbol when one exists (`−1,234.56 $`), keeping the trailing de-emphasized position, with ISO-code fallback and crypto (`C::` prefix) always using its code.

- [x] Add a pure helper (in `frontend/src/utils/`) mapping currency code → display marker using `Intl.NumberFormat` currency parts (fallback to the code when Intl has no distinct symbol or the code is not a valid ISO currency, including all `C::` crypto codes)
- [x] Apply it at every display-amount site: `frontend/src/features/ledger/amount-text.tsx:53-55`, `compactAmountsText` (`transaction-browser.tsx:131-140`), and the records subtable currency rendering; entry-form currency comboboxes keep ISO codes (inputs deal in codes)
- [x] Update e2e assertions that expect `USD` text in display amounts; assert `$` marker for USD and code fallback for a non-symbol currency
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue fe08
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Transaction table foundation bug fixes: unified flat tooltip treatment per arcade-cabinet theme doc; tag lifting correctness incl hidden/tombstoned resolution and ellipsis overflow; consistent bottom insets; amount containment without truncation; currency symbol markers per webui-design.md. Frontend-only; docs/webui-design.md and docs/webui-theme-arcade-cabinet.md are ground truth and must not be edited."`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata issue fe08 with commit and test evidence
