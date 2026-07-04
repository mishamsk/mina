# Plan: Transaction tag chip two-row overflow display — Kata issue `ah5b`

In transaction lines, tag chips currently render a hardcoded maximum of two chips on a single row with a "…" overflow chip. Change the tags cell to fill up to two chip rows within the standard row height and show the overflow chip only when tags genuinely do not fit — per the updated rule in `docs/webui-design.md`: "Tag chips in lines render at the micro size, showing tag leaf names only, filling up to two chip rows within the standard row height; tags that still do not fit collapse into an overflow indicator chip. Tags never increase row height."

## Plan Context

- Ground truth: `docs/webui-design.md` (rule quoted above; also "Stable column layout: fixed percentage-based column widths") and `docs/webui-theme-arcade-cabinet.md` (chip treatment, `--shadow-chip`). Read both before starting.
- Current code: `frontend/src/features/ledger/transaction-browser.tsx` — `TagChipsLine` (`:88-116`) slices to `maxVisibleTags = 2`, renders one `flex-nowrap` row, and absolutely positions a "…" overflow chip (testid `transaction-tags-overflow`, full FQN list in its tooltip). `frontend/src/features/ledger/tag-chip.tsx` renders micro chips at `h-4 max-w-20`.
- Desired behavior:
  - Chips wrap across up to two rows and use the actual available cell width (no hardcoded count).
  - The overflow chip (keep the testid and the full-FQN-list tooltip) appears only when the tag set exceeds the two-row space; it must not cover/hide a chip that would otherwise fit — reserving its slot only while overflowing is fine.
  - Overflow must be detected by measurement (e.g. comparing content size against the clipped container via a `ResizeObserver`), so it adapts when the column narrows or widens. A generic "is this element overflowing" hook belongs in `frontend/src/hooks` (per `docs/frontend-architecture.md`: generic reusable hooks live there); the Mina-specific chip-line behavior stays in the ledger feature.
  - Transaction rows must not grow: the chip area is capped at two chip rows and stays within the current standard row height (the existing e2e row-height uniformity assertion must keep passing). Chip shadows stay unclipped (existing e2e shadow assertion must keep passing).
  - Layout stays stable across narrow and wide widths: no layout shift when the overflow chip appears/disappears while paging (fixed column widths are already in place — do not change column widths).
- If two-row measurement turns out infeasible without excessive complexity, STOP and leave the plan unticked with a note instead of silently shipping a different design — the fallback is an operator decision.
- Preserve, do not regress: single-height transaction rows, micro chip size and truncation behavior inside a chip (`max-w-20` + ellipsis), tooltips (chip FQN tooltip, overflow chip full-list tooltip), records subtable rendering, keyboard row behavior.
- This is a polish change within one feature; do not update `PROJECT_STATE.md`, do not touch ground-truth docs.

## Tasks

### Task/Commit 1: Two-row tag chip layout with measured overflow

Rework `TagChipsLine` to a wrapping, measured layout; add the generic overflow-detection hook; update e2e coverage.

- [x] Add a small generic hook in `frontend/src/hooks` that reports whether an element's content overflows its clipped bounds, driven by `ResizeObserver` (and re-evaluating when children change), usable by any component.
- [x] Rework `TagChipsLine`: render all tags as micro `TagChip`s in a `flex-wrap` container capped at exactly two chip rows (max-height derived from chip height + gap, not an opaque magic number — express it in terms of the chip line box, with a code comment stating the two-row cap), `overflow-hidden`, shadow room preserved; show the overflow "…" chip (same testid, same full-label tooltip) only when the hook reports overflow.
- [x] Remove the hardcoded `maxVisibleTags` slicing so visible count is width-driven; ensure chips that fully fit are never hidden behind the overflow chip.
- [x] Extend `frontend/tests/e2e/transactions-page.spec.ts`: a many-tag transaction shows more than two chips when the cell fits them on two rows, shows the overflow chip when tags exceed the two-row space, hides the overflow chip when all tags fit, and row height stays uniform (reuse/extend the existing row-height and shadow assertions rather than duplicating them).
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
- [x] Run `just review-loop "Transaction line tag chips fill up to two rows before a measured overflow chip (kata ah5b): flex-wrap capped at two chip rows, ResizeObserver-driven overflow detection via a generic hook in frontend/src/hooks. Constraints: frontend-only; rows never grow; fixed column widths unchanged; overflow chip keeps testid and full-FQN tooltip; no ground-truth doc edits."`
- [x] Move this plan to `docs/plans/completed/`
