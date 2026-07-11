# Plan: Neutral styling for income amount chips (`r725`)

Render income (money-in) amount chips in transaction lines with the standard white/ink chip treatment instead of the mint bright fill. Income stays distinguishable through the explicit plus sign and the transaction-class icon — meaning is no longer carried primarily by color.

## Plan Context

- Ground truth (already amended by the operator — do not edit docs): `docs/webui-theme-arcade-cabinet.md` — amount chips use the standard white fill with ink text for every class; money-in is distinguished by the explicit plus sign and the class icon, never by chip color. `docs/webui-design.md:82-83` — meaning never carried by color alone; money-in still reads differently from spend (the sign and class icon carry that).
- Scope: the amount CHIP fill/text in transaction lines (`frontend/src/features/ledger/amount-text.tsx` — the `data-testid="amount-chip"` rendering and any money-in variant classes). Out of scope: mint/teal ink TEXT forms of income/refund amounts outside chips (registers, detail views), the class icon colors, status chips, toasts, BalanceMeter — all keep their current treatment.
- Preserve: the explicit `+` sign on money-in display amounts; the class icon column; chip geometry/border/shadow; right alignment; the e1ke containment behavior (chip layout must not change size in a way that breaks the new containment e2e).
- Protect — do not regress: all other amount classes' rendering (spend negative, transfer/exchange neutral, mixed component chips); transactions e2e including the mixed-amount containment test and column-collapse ordering; overview/register amount rendering.
- e2e: update whatever assertions referenced the mint income treatment (e.g., color/class assertions if any); add/adjust a check that an income row's amount chip carries the standard chip treatment and the `+` sign — keep assertions at computed-style/behavior level consistent with existing conventions (the existing spec asserts chip text like `+3,250.00 $`).
- Follow `docs/TESTING.md`.
- Kata issue: `r725`.

## Tasks

### Task/Commit 1: Neutral income amount chips

- [x] Change the money-in amount-chip rendering to the standard white/ink chip treatment (all classes share one chip treatment); keep the `+` sign and class icon untouched.
- [x] Sweep for other money-in chip styling (mixed-transaction positive components, if styled) and align them; leave non-chip mint text forms alone.
- [x] Update/extend e2e: income amount chip shows the standard treatment (no mint fill) and keeps the `+` sign; existing amount assertions stay green.
- [x] Update `PROJECT_STATE.md` only if it mentions income chip styling (likely no change).
- [x] Add Kata `r725` progress and verification evidence.
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
- [x] Run `just review-loop "Neutral white/ink treatment for income amount chips per the amended arcade theme doc; plus sign and class icon carry the money-in meaning; all other amount classes and non-chip mint text forms unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `r725` only after the plan is moved to completed
