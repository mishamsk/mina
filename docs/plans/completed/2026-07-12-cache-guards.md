# Plan: Frontend cache guards — picker refetch epoch + register write generations (Kata 0wet, 6kcn)

Two grouped invalidation-correctness fixes in the frontend store/resource layer (same area as the just-merged 9985 deleteability invalidation — build on it, don't duplicate it):

1. `0wet`: `invalidateCategoryPickerCategories()` (`frontend/src/store/transactions.ts`) clears the intent-keyed picker cache, but a mounted+enabled picker never refetches — the load effect deps (`enabled, intentKey, normalizedIntents, retryToken` in `frontend/src/features/ledger/use-transactions-resource.ts:175-207`) don't change, so the cleared entry stays empty until remount.
2. `6kcn`: `invalidateAllAccountRegisterPages` clears register snapshots, but `refreshAccountRegisterPage`/`refreshGroupRegisterPage` (`frontend/src/features/accounts/use-account-register-resource.ts`, `frontend/src/store/accounts.ts`) have no generation/cancellation guard — a fetch started before a restructure's bulk invalidation can write a pre-restructure snapshot back (stale FQNs, marked last-loaded). Account headers share the pattern.

## Plan Context

- Kata issues: `0wet` and `6kcn`. One sub-branch, one commit each.
- MANDATORY pre-reads: `docs/frontend-architecture.md` (store conventions, refresh rules), `docs/TESTING.md`; the transaction peek cache's existing generation guard (referenced by 6kcn as the pattern to mirror — find it in the ledger store/resource code).
- 0wet fix (per issue acceptance): add an invalidation epoch/token to the picker cache store; `invalidateCategoryPickerCategories` bumps it; the load effect includes it in deps so mounted pickers refetch. Note the issue's reachability caveat is now MOOT in part — verify whether any current surface can hit it (entry panel + category mutations both reachable via command palette?); regardless, fix it now per the issue.
- 6kcn fix: mirror the transaction-cache generation guard: snapshot writes carry the generation captured at fetch start; writes whose generation predates the latest bulk invalidation are discarded (and trigger refetch if the page is still mounted/current). Apply to account register pages, group register pages, AND account headers (issue notes they share the pattern).
- Testing: these are race/lifecycle behaviors — e2e where practical, otherwise deterministic app-boundary coverage:
  - 0wet e2e: with the entry panel's category picker open/mounted, mutate a category (via API or another surface reachable in-app), assert the picker options refresh without remount. If genuinely unreachable in the UI today, simulate via the store snapshot getters in a component-free spec is NOT allowed (e2e only per TESTING.md) — instead craft the closest real UI flow (e.g. palette-driven category create while entry panel open) and note it.
  - 6kcn e2e: restructure an account subtree while its register page is loading (start a slow fetch via route interception/delay in Playwright, trigger restructure, then let the fetch land) and assert the register shows post-restructure FQNs, not the stale snapshot. Playwright route delaying makes this race deterministic.
- Keep the diff tight: no refactors of the resource layer beyond what the guards need; do not touch the 9985 choke-point behavior except to compose with it.
- Docs: update the ledger/accounts PACKAGE.md lines only if the cache contract wording changes. No ground-truth docs. No PROJECT_STATE.md.

## Tasks

### Task/Commit 1: 0wet — picker cache invalidation epoch

- [x] Implement the epoch/token refetch per Plan Context.
- [x] e2e per Plan Context (note the flow used: entry stays mounted only on `/transactions`, so the closest real UI flow creates a category in Categories, then navigates to the entry picker and selects the new category by FQN).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `0wet` (`kata comment 0wet --agent ...`)
  - [x] Commit changes

### Task/Commit 2: 6kcn — register/header snapshot generation guard

- [x] Implement the generation guard per Plan Context (registers, group registers, headers).
- [x] e2e with deterministic race via route delay (the closest reachable UI flow caches a register, restructures through Accounts UI, then requires a fresh records request on revisit; register and restructure actions do not coexist on one mounted route, so a held response is aborted on navigation before it can settle).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `6kcn` (`kata comment 6kcn --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Frontend cache guards (kata 0wet, 6kcn): category picker cache gains an invalidation epoch in the load-effect deps so mounted pickers refetch after invalidation; account register/group/header snapshot writes carry fetch-start generations and stale writes are discarded, mirroring the transaction peek cache guard; deterministic race e2e via Playwright route delays; tight diffs composing with the merged 9985 invalidation choke point"`
- [x] Move this plan to `docs/plans/completed/`
