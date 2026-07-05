# Plan: vp80 Overview — operator review fixes (fix plan 1) — Kata issue `vp80`

Move the Overview page's data-shaping into the feature and deduplicate decimal helpers. Implementation-only; the page is verified live against the design spec — zero visual/behavior change. Existing e2e must pass unmodified.

## Plan Context

- Do not run review-loop.
- Accepted as-is (do not change): the hand-rolled `Date` clock mock in the e2e (sound, scoped), `include_tombstoned: true` account resolution, stale-while-error snapshot behavior, `text-[10px]/[11px]` sizes.
- Protect — do not regress: all 44 e2e; ≈-USD rendering; featured-first grouping; remaining-credit rows; refresh after save/delete; StrictMode/generation guards; keyboard picker helper (arrow keys + Enter).
- Scope exclusions: nothing beyond the items below.

## Tasks

### Task/Commit 1: Extract Overview derivation into the feature; dedupe decimal code

- [x] Move from `pages/overview-page.tsx` into `features/overview`: the FQN-root grouping + featured-first sort + USD subtotal + unconverted aggregation (`groupedBalances`, `:68-99`), the `remainingCredit` computation (`:193-199`), the lookups fallback assembly (`:456-466`), and the presentational section components (`BalanceGroups`/`BalanceRow`/`PulseTile`/`RecentActivityLine` and their skeletons) — leaving the route page as thin composition. Update `features/overview/PACKAGE.md` so its ownership statement matches reality.
- [x] Replace the page's bespoke decimal codec (`decimalUnits`/`decimalString`/`addDecimalStrings`/`decimalFactor`, `:40-64`) with a summation helper added to the shared decimal module (`features/ledger/format.ts` BigInt scale-8 handling) reused by the feature. Leave the e2e spec's local copy alone (test isolation).
- [x] Drop the identity `rootLabel` function (`:66`); add a one-line comment on the resource effect's `[month, overview.snapshot]` dependency explaining the post-commit re-run/early-return.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (unmodified tests)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
