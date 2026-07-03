# Plan: Arcade Cabinet final polish — iteration-3 review findings

Small, final fixes from the iteration-2 review (code audit + live Playwright testing on `mina serve --demo`). Everything structural was verified correct and must not be regressed: From→To titles, uniformity sentinels, banding by index, functional sticky header, keyboard row toggle, panel viewport fit, currency datalist, draft-store migration, Go list-ordering reuse. This is the last polish iteration for the current scope.

## Plan Context

- Ground truth: `docs/webui-design.md` (freshly updated: member uniformity ignores unattributed records; memo second line shows only a uniform memo, never a "Mixed" sentinel, and is omitted when a mixed-class title already falls back to the memo) and `docs/webui-theme-arcade-cabinet.md`.
- Live evidence for the chip-spacing item: the `{" "}` separator exists in `amount-text.tsx:52-53` but renders glued (`-43.98USD`) — whitespace-only text nodes are dropped in a flex container; use a real gap or non-flex inline layout. Records-subtable amounts render the space correctly.
- Live evidence for the member item: nearly every line shows a `MIXED` member chip because flow records carry no attribution.
- Live evidence for the memo-wrap item: the expanded records memo cell breaks words mid-word ("Househol / d supplies").

## Tasks

### Task/Commit 1: Transaction line display fixes

- [x] Member sentinel follows the refined rule (`docs/webui-design.md` Transaction summary line): ignore unattributed records — exactly one distinct member among attributed records → show it; none → blank; multiple distinct → Mixed. The demo dataset must no longer show MIXED members on ordinary spends
- [x] Memo second line follows the refined rule: show only a uniform non-empty memo; differing memos omit the line; suppress the line when a mixed-class title already falls back to the memo (`format.ts:203-227`)
- [x] Amount chips render a visible space before the de-emphasized currency code (fix the flex-swallowed whitespace with `gap-*` or inline flow); keep records-subtable formatting unchanged
- [x] Mixed-class lines render their component amounts inline in one single-height row (e.g. `-5.00 / +100.00 USD` compact form), not stacked chips — lines stay single-height per doctrine
- [x] Hide the CLASS column header below very wide viewports (e.g. show only ≥ 2xl/1920px); the icon column itself always renders
- [x] Fully-cancelled transaction lines render struck-through and de-emphasized (title included), matching the records-subtable treatment (`transaction-browser.tsx:300-301,368-371`)
- [x] Records-subtable memo cell wraps at word boundaries with a sensible column width (no mid-word breaking; long single words may still break as a last resort); keep the overflow containment
- [x] Loading skeleton mirrors the 8-column layout (`transaction-browser.tsx:64-80` still renders the old 6-column grid)
- [x] Extend e2e: no MIXED member chip on a simple attributed spend; mixed-class row height equals ordinary row height; amount chip text matches `/-43\.98 USD/`
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Entry form and cleanup

- [x] Inline currency validation on blur: `/^([A-Z]{3}|C::.+)$/` (uppercased input) so malformed codes fail before submit; server validation remains the backstop (`entry-panel.tsx:285-287`)
- [x] Replace the entry panel's magic `max-h-[calc(100svh-12rem)]` with sizing derived from the actual available region (or document why the constant is safe next to it)
- [x] Remove the unreachable `"mixed"` branch from `StatusIcon` (`line-icons.tsx:79-80`) — the Mixed sentinel owns that case
- [x] Extend e2e: entering `bitcoin` as currency shows an inline field error before submit
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
- [x] Run `just review-loop "<Arcade Cabinet final polish: member/memo uniformity refinements per updated design doc; amount chip gap fix (flex whitespace); inline mixed amounts single-height; class header breakpoint; cancelled strike-through; memo word wrap; skeleton shape; inline currency validation; no regressions to verified line rework>"` — ran once; exited after fixer iterations with remaining doc nits, addressed manually
- [x] Move this plan to `docs/plans/completed/`
