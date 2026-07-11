# Plan: Yellow-filled star for the active featured-account toggle (`np9z`)

Make the featured-account star toggle visibly yellow-FILLED when active (`aria-pressed="true"`), per the theme rule. The inactive state stays unfilled and muted; accessible pressed-state semantics are unchanged.

## Plan Context

- Ground truth: `docs/webui-theme-arcade-cabinet.md` — flat toggle icons are muted when off, "the relevant accent when on (yellow-filled star for featured, ink eye-off for hidden)". The doc already requires the filled treatment; the implementation lags it. No doc edits.
- Current state (ACC-1 audit, Kata `np9z`): `frontend/src/features/accounts/accounts-tree.tsx:660-678` — the active star only gets `text-[var(--color-class-adjustment-ink)]` on an outline glyph, so pressed state reads as a thin outline color change, not a fill.
- Change: render a visibly filled star when `is_featured` — use the filled/solid star glyph if `pixelarticons` provides one, otherwise fill the existing glyph (SVG `fill`/`currentColor` technique) — in the yellow accent (pick ink vs bright form for adequate contrast on the white row surface per the theme's accent-pair rule; the tile is on `bg-card`/band rows). Inactive stays the current muted outline. Keep the 16/24px integer glyph sizing rule.
- Also check the balance-strip/sidebar or any other featured-star renderings for consistency — the toggle in the accounts tree is the primary target; align others only if they render the same toggle state.
- Preserve: `RowActions` toggle semantics (`aria-pressed`, label swap Feature/Unfeature, hover ink); toggle behavior and API call; per-row fold behavior (toggles never fold).
- e2e: extend `accounts-page.spec.ts` (or the appropriate spec) — a featured account's star toggle shows the filled treatment when `aria-pressed=true` (computed fill/color assertion consistent with existing conventions) and reverts when unfeatured; toggle semantics unchanged.
- Follow `docs/TESTING.md`.
- Kata issue: `np9z`.

## Tasks

### Task/Commit 1: Filled active star

- [x] Render the active featured star visibly yellow-filled (glyph or SVG fill), inactive unchanged muted outline; keep aria-pressed semantics and labels.
- [x] Extend e2e: pressed star shows the filled yellow treatment; unfeaturing reverts it; toggle flow still works.
- [x] Update `PROJECT_STATE.md` only if it mentions the star treatment (likely no change).
- [x] Add Kata `np9z` progress and verification evidence.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Yellow-filled active featured star per the theme doc; inactive muted outline; aria-pressed semantics, toggle flow, and glyph sizing rules unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `np9z` only after the plan is moved to completed
