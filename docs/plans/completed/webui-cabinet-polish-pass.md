# Plan: Arcade Cabinet polish pass — review findings and transaction-line rework

Fix defects found in the post-implementation review of the Arcade Cabinet theme (code audits + live Playwright testing against `mina serve --demo`) and implement the transaction-line rework from user feedback. All governing rules are already committed to `docs/webui-design.md` (transaction summary line composition, From → To titles, lifted values with the Mixed sentinel, class/status icon encoding, exchange sell-side-only lines) and `docs/webui-theme-arcade-cabinet.md` (ClassIcon/StatusIcon treatments, tag micro-wrap, plain undecorated records subtables) — this plan is implementation only; the docs win over code wherever they disagree.

## Plan Context

- Live-verified defect evidence: amount chips render `-43.98USD` with no space before the currency code; the mixed-class line shows an empty amount cell; the page-help popover cannot be dismissed by `Esc` or outside click; the status page shows "Server time … GMT" and its "Details" toggle label is unreadable on the new background; refund amount chips fill teal; the "Reference" sidebar label renders at 8px; the records-subtable memo column overflows its container without a scrollbar; the entry panel scrolls both internally and the page (its height appears viewport-based while the panel sits below the page header).
- The previous plan `docs/plans/webui-arcade-cabinet-theme-and-fixes.md` completed implementation and all suites, but its final `just review-loop` failed on an external Codex usage limit; this plan's final review-loop covers that gap, and this plan archives the previous plan file.
- Protect what was live-verified working — do not regress: keyboard entry across all four tabs, per-tab drafts, intent-filtered pickers, fixed columns, Page X of Y, local-today entry date, Cmd+Enter from picker inputs, panel layout reflow.
- Date-based list navigation synchronized with the entry-panel date picker is a follow-up tracked in Kata (`4tf4`), not this plan.

## Tasks

### Task/Commit 1: Bookkeeping (docs only)

- [x] Move `docs/plans/webui-arcade-cabinet-theme-and-fixes.md` to `docs/plans/completed/` (implementation and suites completed; review coverage lands with this plan's final review-loop)
- [x] Update `frontend/src/features/ledger/PACKAGE.md` implicit contracts: entry supports the four shorthand endpoints; drafts are per-tab with a persisted active-tab preference; transfer fee rows are not expressible via the transfer shorthand yet (tracked in Kata); refresh Testing Notes to reflect multi-type entry coverage
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Task/Commit 2: Transaction line rework

Implement the updated summary-line composition from `docs/webui-design.md` (Transaction summary line section). Lines stay single-height.

- [x] Column layout: narrow class-icon column leftmost (header hidden except on very wide screens), then date, title, category, tags, member, status icon, amount; keep fixed percentage widths stable across pages
- [x] `ClassIcon`: a distinct pixel glyph per transaction class in the class accent ink color, tooltip naming the class; replaces the `ClassBadge` chip in lines (badge remains for detail contexts)
- [x] Titles: simple two-sided transactions render `From → To` from both sides' leaf names (spend funding → merchant; income source → destination; refund merchant → destination; transfer from → to; exchange `USD → EUR`); complex/mixed fall back to memo or dominant counterparty leaf
- [x] Memo as a truncated second line under the title with the full memo in a tooltip
- [x] Lift member, status, tags (and keep category) into the line via the uniformity display rule: identical across all active records → show the value; differing → a "Mixed" sentinel indicator
- [x] `StatusIcon`: status icon-encoded with tooltip (pending, cancelled distinct; posted unmarked); pending lines keep the de-emphasized amount treatment
- [x] Tag chips in lines drop to micro size and may wrap to a second line when many tags are present
- [x] Exchange lines show only the sold-side amount (single-height row); the bought side is visible in the expansion
- [x] Mixed-class lines render compact component amounts (server `components` values; no synthetic total) instead of an empty cell
- [x] Amount chips: space before the de-emphasized currency code (`-43.98 USD`); refund chips fill mint (money-in), teal stays the refund text ink form
- [x] Hide the reconciliation status entirely until Phase 5 import data exists
- [x] Extend e2e: From → To title renders; Mixed sentinel appears for a mixed-category transaction; exchange line single amount; class icon tooltip
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Table mechanics and records subtable

- [x] Fix banding parity: band by transaction index, not CSS `odd:`/`even:` nth-child — expanding a row currently flips the alternation of all following rows (`transaction-browser.tsx:297-298,355-357`)
- [x] Make the sticky header actually stick: the `overflow-x-auto` wrapper without a height constraint swallows `position: sticky` (`transaction-browser.tsx:253,263`)
- [x] Paint the header band with a structural token (`--color-interactive-bright` or a dedicated `--table-header`), not `--color-class-transfer-bright`
- [x] Remove the chevron hover-button: whole-row click toggles expansion with a plain (non-button) disclosure indicator; keep `aria-expanded` semantics on the row control
- [x] Records subtable: plain undecorated table text for all columns (no chips, badges, or shadows) per the theme doc
- [x] Fix the records-subtable memo overflow: memo must wrap or truncate within the container instead of overflowing without a scrollbar
- [x] Raise the sidebar "Reference" group label from 8px to ≥ 12px (`features/app-shell/app-shell.tsx:174`)
- [x] Extend e2e: banding stays alternating after expanding a row; expanded records stay within the table container
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 4: PageHelp, status page, entry a11y

- [x] `PageHelp` popover dismisses on `Esc` and on outside click; swap its Lucide `CircleHelp` glyph for a pixelarticons glyph (or record the fallback as tracked debt)
- [x] Status page: render server time in the browser's local timezone per the design doc local-time rule
- [x] Status page: fix the "Details" toggle legibility on the new dark ground — its label currently fails readable contrast
- [x] Status page header gets the `PageHelp` affordance like every page
- [x] Entry panel tabs: complete the ARIA tab pattern — `role="tabpanel"` on the form linked via `aria-labelledby` to the active tab (or drop tab roles for plain buttons)
- [x] `FqnPath` and the new line tooltips (memo, class, status): use a shared styled tooltip that appears promptly on hover (keep `title` as fallback where cheap)
- [x] Extend e2e: help popover closes on Escape; status page shows local time
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 5: Entry panel height and currency combobox

- [x] Fix the double-scrollbar bug: the panel sits below the page header but its height appears computed from the full viewport, so it overflows and scrolls the page; size it to the available region so only the form body scrolls internally and the page viewport never scrolls
- [x] Currency fields become comboboxes over the currencies already present in the data (derive the bounded list from existing lookups/records), with free entry accepted for a new code
- [x] Extend e2e: with the panel open at default viewport, the page has no vertical scrollbar; currency combobox offers an existing currency and accepts a novel code
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 6: Storage naming and small cleanups

- [x] Rename the IndexedDB draft surface to match its multi-type content: `spend_entry_draft` store / `spend-entry` key / `readSpendEntryDraft`-`writeSpendEntryDraft` become transaction-entry names, with a database version bump and upgrade migration; update the import sites in `entry-panel.tsx`
- [x] Remove the dead `clearSpendEntryDraft` export (or wire it into the panel reset path if one exists)
- [x] Add the coupling comment where sort is hardcoded (`api/ledger.ts:31-32`, `store/transactions.ts:53-54`): when a user-facing sort control arrives, `sort`/`sort_dir` must join the URL state and the snapshot key
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
- [x] Run `just review-loop "<Arcade Cabinet polish pass: transaction-line rework (class/status icons, From→To titles, memo second line, Mixed sentinel, exchange sell-side, tag micro-wrap), banding/sticky/chevron fixes, plain records subtable, PageHelp dismissal, status local time + contrast, panel height fix, currency combobox, draft store rename; docs already updated and win over code; no new features>"` — stopped after 3 iterations with remaining review findings; unresolved findings fixed manually in `081b423`, then `just test`, `just test-integration`, `just pre-commit`, and `just test-frontend-e2e` passed
- [x] Move this plan to `docs/plans/completed/`
