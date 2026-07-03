# Plan: Amount column clipped by the card edge after responsive collapse

Follow-up defect exposed by the member-collapse fix (live evidence at a 1000px viewport): hidden columns' widths are not redistributed, so the amount column extends past the table card's right edge and amount chips render truncated ("-43.98 US", "+3,250.00" cut off). Amounts must never clip or truncate at any width. Implementation only; do not edit any docs, and per this task do not run `just review-loop` (the branch review already ran; this is a review-finding fix).

## Tasks

### Task/Commit 1: Redistribute column widths per visible-column set

- [x] When responsive collapse hides columns, the remaining columns' percentage widths must sum to the full table width so the amount column (and every other column) stays fully inside the card at all widths from 700px to 1600px
- [x] The amount column never clips or truncates its content at any supported width; if space is insufficient after all collapse steps (status, member, tags, category hidden), the description column shrinks first
- [x] Extend e2e: sweep 820px / 1000px / 1440px asserting the amount cell's right edge is within the table container and the rendered amount text matches the full formatted value (no truncation)
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
