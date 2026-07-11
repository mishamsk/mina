# Plan: Neutral styling for transaction member chips (`4fxe`)

Render member initial chips with the ordinary neutral entity-chip treatment (white fill, ink outline, ink initials) instead of the yellow adjustment fill, keeping yellow reserved for its semantic uses (adjustment class, in-flight states).

## Plan Context

- Ground truth (already amended by the operator — do not edit docs): `docs/webui-theme-arcade-cabinet.md` — member and merchant initial tiles are square neutral entity-chip tiles: white fill, ink outline, ink initials; yellow reserved for semantic uses. `docs/webui-design.md` — entity chips read as one family, visually distinct from indicators and actions; meaning never by color alone.
- Current defect (TX-4 audit, Kata `4fxe`): `frontend/src/features/ledger/member-chip.tsx:11,21` uses `--color-class-adjustment-bright` (yellow) for the fill and its hover mix.
- Change: swap the chip fill to the standard entity-chip surface (`bg-card`/white with ink outline + `--shadow-chip`) and give hover the standard entity-chip hover step used by category/tag chips (see `frontend/src/features/ledger/tag-chip.tsx` / category chip for the family treatment); initials stay ink, size and square shape unchanged; interactive variant keeps its press-in behavior.
- Sweep: member initial tiles rendered anywhere else (pickers, detail panels, drill-ins) that use the same yellow token for member identity — align them; leave genuine semantic yellow (adjustment class badge, in-flight status) untouched.
- Legibility: ink-on-white matches every other entity chip; nothing else to prove beyond the standard treatment.
- Protect — do not regress: member chip click-to-filter behavior; chip sizing/rows (member column layout, e1ke containment); tags/category chips; transactions e2e.
- e2e: adjust/extend an assertion that the member chip carries the neutral entity-chip treatment (computed background white / no yellow token) while remaining visible and clickable; keep conventions.
- Follow `docs/TESTING.md`.
- Kata issue: `4fxe`.

## Tasks

### Task/Commit 1: Neutral member chips

- [x] Swap the member chip fill and hover to the standard entity-chip treatment in `member-chip.tsx`; initials/ink/outline/shadow/size unchanged.
- [x] Sweep other member-identity tiles using the yellow token and align them; leave semantic yellow uses untouched.
- [x] Update/extend e2e: member chip renders the neutral treatment and stays clickable (filter behavior intact).
- [x] Update `PROJECT_STATE.md` only if it mentions member chip styling (likely no change).
- [x] Add Kata `4fxe` progress and verification evidence.
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
- [x] Run `just review-loop "Neutral entity-chip treatment for member initial chips per the amended arcade theme doc; yellow reserved for semantic uses; chip interactivity and layout unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `4fxe` only after the plan is moved to completed
