# Plan: z8v9 date jump — operator review fixes (fix plan 1) — Kata issue `z8v9`

Extract the date-jump workflow into a feature hook and clean up small residue from the review iterations. Implementation-only; the feature is verified working live (mid-history jump lands the right page, pre-history clamps to the oldest page, pager continues, `?transaction` preserved, control clears) — no observable behavior change.

## Plan Context

- Do not run review-loop.
- Findings from the operator architectural audit of `git diff ui-stage-3...HEAD`:
  - MEDIUM `frontend/src/pages/transactions-page.tsx:143-205`: ~90 lines of date-jump workflow (state, `activeDateJumpIdRef` race guard, async `jumpToDate`, landed-page computation, URL reconciliation) live in the route page, violating "keep route pages thin" and the `useTransactionDetail` extraction precedent.
  - LOW `frontend/src/store/index.ts:40`: orphaned `transactionPageRequestKey` barrel re-export (left behind by the removed in-flight cache) — no consumer outside its module.
  - LOW `frontend/src/features/ledger/use-transactions-resource.ts:175-178`: an abandoned jump leaves a stale anchored `loadingPageKey` (harmless but a state leak) — clear it on the `!isActive()` path or set loading only after the check.
  - LOW duplicated logic in the page: "cancel in-flight jump" repeated in `setPage` and the inline page-size handler (`:131-132`, `:284-285`); offset↔page arithmetic re-derived in the updater (`:167-180`).
  - LOW (comment only): the no-duplicate-fetch guarantee silently depends on the backend page-aligning the anchor offset — add a one-line comment where the effective page key is computed (`use-transactions-resource.ts:188` area) stating that dependency.
- Protect — do not regress: all existing e2e including the new date-jump tests; race-guard behavior (abandoned jumps never write URL or store; loading always clears); functional `setSearchParams` param preservation; no persistent anchor URL param; non-anchored snapshot behavior.
- Scope exclusions: no behavior changes, no new features, no ground-truth doc edits, no PROJECT_STATE.md change, do not touch the pre-existing busy-indicator layout nudge in `transaction-browser.tsx` (out of kata scope).

## Tasks

### Task/Commit 1: Extract `use-transaction-date-jump` feature hook and clean residue

- [x] Move the date-jump workflow from `pages/transactions-page.tsx` into a `features/ledger` hook (e.g. `use-transaction-date-jump.ts`, exported via the feature barrel) following the `useTransactionDetail` pattern: it owns `dateJumpValue`, `dateJumpLoading`, the jump id ref, `jumpToDate`, and a `cancelDateJump()` used by `setPage`/page-size changes; the page keeps only the control JSX and hook wiring. Share one offset↔page helper instead of re-deriving the arithmetic.
- [x] Remove the orphaned `transactionPageRequestKey` re-export from `frontend/src/store/index.ts`; keep the function module-internal.
- [x] Clear (or avoid setting) the anchored loading key when a jump is abandoned in `jumpToTransactionDatePage`, and add the one-line comment tying the effective-page-key caching to the backend's page-aligned anchor offset.
- [x] Optional if cheap: extend the date-jump e2e with a request counter asserting the landed page is served from the snapshot (no second `/api/transactions` request for the landed offset after the anchored response).
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
