# Plan: Arcade Cabinet wrap-up — final feedback on the Transactions slice

Narrowly address the final user feedback on the Transactions page before this branch wraps. All governing rules are already committed to `docs/webui-design.md` (compact two-line date, headerless status marker after the date, "Description" header, single-line leaf-name tags with ellipsis, responsive column-collapse priority, keep-previous-page loading, full-height browser) and `docs/webui-theme-arcade-cabinet.md`. Implementation only — do not edit `docs/webui-design.md` or the theme doc; if a doc seems wrong, note it in the final summary instead of changing it.

## Plan Context

- Ground truth: the two docs above win over code. Follow-ups already tracked in Kata, not here: category-intent filtering as an API capability (`f9yj`), full transaction detail view (`5039`).
- Live evidence: navigating to an uncached page flashes skeletons instead of keeping the current rows (visible flicker); the table card ends mid-viewport instead of flush with the sidebar bottom; at narrow widths the table grows a horizontal scrollbar.
- Protect (verified working, do not regress): From→To descriptions with memo second lines, uniformity sentinels (member ignores unattributed records), single-height rows incl. mixed inline amounts, spaced amount chips, banding by index, sticky header, keyboard row toggle, entry tabs with per-tab drafts, currency datalist + inline validation, Page X of Y.

## Tasks

### Task/Commit 1: Browser layout, loading, and responsive columns

- [x] Full-height browser: the transactions region fills the available viewport height — table body flexes, the pagination footer sits flush with the viewport bottom, aligned with the sidebar's bottom (collapse button)
- [x] No pagination flicker: moving between pages keeps the current rows rendered (with a subtle busy affordance at most) until the next page's data arrives; skeleton rows appear only on first load with no cached page
- [x] Responsive column collapse instead of a horizontal scrollbar, in priority order as space shrinks: hide status marker first, then member, then tags, then category
- [x] Extend e2e: page navigation does not clear rows before new data renders; at a narrow viewport the horizontal scrollbar is absent and the category column still renders while status/member are hidden
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Line composition tweaks

- [x] Date column tightened: day (`May 31`) with the year as a de-emphasized second line on every row
- [x] Status marker becomes a very narrow, headerless column tight after the date: a marker icon (clock for pending) with tooltip only when the transaction is not simply posted; posted rows show nothing; keep the pending de-emphasized amount treatment
- [x] Column header renamed "Title" → "Description"
- [x] Tag chips: leaf names only (never full FQNs), micro size, single line truncated with an ellipsis; row height never grows from tags (full sets arrive with the Kata-tracked detail view)
- [x] Extend e2e: year renders as the date's second line; a many-tag transaction keeps standard row height; tag chip shows leaf name for a hierarchical tag
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
- [x] Run `just review-loop "<Arcade Cabinet wrap-up: full-height browser, keep-previous-page pagination (no flicker), responsive column-collapse priority (status, member, tags, category), compact two-line date, headerless status marker, Description header, single-line leaf-name tags; docs are ground truth and must not be edited by this task; no regressions to protected line-rework behaviors>"` — failed after 3 internal iterations with remaining branch-scope review findings in `build/review-loop/review-progress-full-branch-ui-design-head-aecd46307cad.md`; no task-owned code changes remained to address.
- [x] Move this plan to `docs/plans/completed/`
