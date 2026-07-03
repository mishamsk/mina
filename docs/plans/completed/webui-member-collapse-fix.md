# Plan: Fix member-column clipping at intermediate table widths

Single defect from the wrap-up review's narrow-viewport check (live evidence at a 1000px viewport): the status column collapses correctly, but the member column enters a broken intermediate state — member initial tiles render clipped underneath the amount chips instead of being either fully visible or hidden. Columns must collapse whole per the priority rule in `docs/webui-design.md` (status → member → tags → category); no partial overlap states. Implementation only; do not edit any docs.

## Tasks

### Task/Commit 1: Whole-column collapse for member (and audit the other priority steps)

- [x] At widths where the member column no longer fits, hide it entirely (header and cells) rather than letting tiles clip under the amount column; verify the same whole-column behavior for the tags and category collapse steps
- [x] Ensure fixed percentage widths recompute per visible-column set so no column overlaps another at any viewport width between 700px and 1600px
- [x] Extend e2e: at the intermediate width that previously clipped (≈1000px), the member column is either fully visible or absent, and no cell content overlaps the amount column's bounding box
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
