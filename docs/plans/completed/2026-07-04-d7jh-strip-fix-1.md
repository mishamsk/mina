# Plan: d7jh balance strip — operator review fixes (fix plan 1) — Kata issue `d7jh`

Two cleanups from the operator audit. Implementation-only; the strip is verified live (expanded rows, collapsed icon, both routes) — no visual/behavior change.

## Plan Context

- Do not run review-loop.
- Accepted as-is (do not change): non-link rows (deferred until account pages exist), the 3-row skeleton reserve, the e2e hardening tweaks in transactions-page.spec.ts.
- Protect — do not regress: all suites; strip refresh after save/delete; StrictMode/generation guards; hide-when-empty.
- Scope exclusions: nothing beyond the two items below.

## Tasks

### Task/Commit 1: Batch the balances call; drop dead export

- [x] `frontend/src/api/ledger.ts:114-126` (`fetchFeaturedAccountBalances`): replace the per-account `listAccountBalances` calls with ONE batched call passing all `account_ids` (the endpoint accepts the array — that batching is exactly why the API was extended). Preserve the current row ordering (re-order client-side by the fetched accounts' fqn order) and simplify the partial-failure handling accordingly.
- [x] Remove the unused `invalidateFeaturedBalances` action (`frontend/src/store/transactions.ts:316`, re-export `store/index.ts:37`) — mutation paths use `refreshFeaturedBalances`; add it back only when a real consumer appears.
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
- [x] Move this plan to `docs/plans/completed/`
