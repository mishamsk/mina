# Plan: Implement Arcade Cabinet theme and Transactions UX fixes

Implement the Arcade Cabinet theme per `docs/webui-theme-arcade-cabinet.md` (which replaced the Paper Arcade spec) and fix the UX defects found in MVP usage. The theme spec and the matching `docs/webui-design.md` adjustments (help-icon page pattern, leaf-only category cells, newest-first default, fixed column widths, local-time display rule) are already committed — this plan is implementation only; do not edit those requirements.

## Plan Context

- Ground truth: `docs/webui-theme-arcade-cabinet.md` (tokens, typography, chip/banding treatments, accessibility contract) and `docs/webui-design.md` (structure, display rules). Where the current code disagrees, the docs win.
- The prototype behind the theme is direction, not layout: adopt colors, chips, banding, typography; page structure stays per the design doc (no stat-card rows or duplicate toolbars).
- Pagination "Page X of Y" and the newest-first server default depend on `docs/plans/webui-support-apis.md` Tasks 1-2. If those APIs are not merged yet, implement against them last or keep the current fallback behind the same component API.
- Carry-over residuals from the MVP fix-pass review included here: `Cmd+Enter` does not submit while focus is inside a picker input; transfer line amounts show a spurious `+` (design: neutral moved amount); entry date defaults to UTC-today.
- Silkscreen is retired: remove the `@fontsource/silkscreen` dependency; headings become IBM Plex Mono bold uppercase per the theme spec.

## Tasks

### Task/Commit 1: Implement the Arcade Cabinet token and primitive layer

Token and primitive swap so all screens restyle through tokens.

- [x] Rewrite the token layer in `frontend/src/styles.css` to the theme spec: `--frame`, `--ground`, `--card`, `--band`, ink/muted, `--frame-foreground`/`--frame-muted`, accent ink/bright pairs, `--shadow-pixel` (4px) and `--shadow-chip` (2px), focus ring `#D1179E`, shadcn mapping (ink-filled primary, ground background)
- [x] Remove `@fontsource/silkscreen` and all pixel-font usage; heading utilities switch to IBM Plex Mono SemiBold/Bold uppercase per the type scale; prose stays IBM Plex Sans
- [x] Restyle shell: dark `--frame` sidebar with chip nav items and ink-filled active state; content on `--ground` (optional subtle pixel-grid texture, chrome only); cards white with ink outline + pixel shadow
- [x] Restyle primitives and ledger atoms: buttons (ink-filled primary, white secondary, press-in kept), marker chips (category/status/tags/member) with ink outline + chip shadow, `ClassBadge` hues remapped to the new accents, transaction-line amount chips (white with ink text; mint bright fill for money-in), banded table rows with sky-bright header band
- [x] Verify WCAG AA for every pair in the theme spec's accessibility contract; tune only toward higher contrast
- [x] Update the closing Implementation Notes line in `docs/webui-theme-arcade-cabinet.md` from "target theme specification" back to "Arcade Cabinet is the default theme" in the same commit that makes it so
- [x] Update existing e2e where selectors/text depended on the old styling
- [ ] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Transactions table fixes

Layout stability, ordering, category display, help affordance, dates.

- [x] Fixed column widths (percentage-based, `table-layout: fixed`): columns must not shift when paging or when row content changes
- [x] Default order newest-first: request `sort_dir=desc` explicitly (server default lands with the support-APIs plan)
- [x] Pagination shows "Page X of Y" using `total_count` from the list response (depends on support-APIs Task 1; keep the current fallback if the field is absent)
- [x] Category cells render the leaf-name chip with the full FQN path on hover (per design doc dense-cell rule); records subtable keeps full paths
- [x] Replace the static page subheader with the `PageHelp` affordance (generic component in `components/`; explanation paragraph hidden by default), wired into the shared page header
- [x] All date rendering and civil-date comparisons use local time via a shared date util in `utils/`: list dates, current-year formatting, any "today" logic
- [x] Transfer/exchange line amounts render neutral (no `+` sign) per the display rules
- [x] Extend e2e: column positions stable across page switch; newest-first order; help toggle; leaf-category tooltip
- [ ] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Entry panel — shorthand type tabs and viewport fit

The panel currently opens spend-only and overflows the viewport.

- [x] Add type tabs to the entry panel: Spend, Income, Refund, Transfer — each mapping to its shorthand endpoint per `docs/webui-design.md` (income: destination account + source flow + income-intent category; refund: merchant counterparty + refund-intent category; transfer: from/to accounts; the optional transfer fee row is deferred if the shorthand API lacks it — record the gap in Backend Additions instead of blocking); "New transaction" and `N` open the panel on the last-used tab
- [x] Panel fits the viewport: internal scrolling for the form body with the title and submit row always visible; opening the panel never scrolls the page viewport
- [x] Entry date defaults to local today (uses the Task 2 date util)
- [x] `Cmd+Enter` submits while focus is inside a picker input (residual from the fix pass)
- [x] Draft persistence and sticky-field behavior extended across tabs (sticky date and account per tab where it applies)
- [x] Extend e2e: create one transaction of each shorthand type through the tabs; panel does not scroll the page; keyboard-only flow still passes
- [ ] Verification
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
- [ ] Run `just review-loop "<Arcade Cabinet theme implementation + Transactions UX fixes: docs are ground truth and already committed; prototype palette with ink/bright AA discipline; Plex Mono headings, Silkscreen removed; banded fixed-% tables, chip markers, amount chips; newest-first + Page X of Y; leaf-category chips with hover path; PageHelp pattern; entry type tabs + viewport-fit panel; local-time dates everywhere>"`
- [ ] Move this plan to `docs/plans/completed/`
