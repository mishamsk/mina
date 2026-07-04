# Plan: Support APIs — review findings (Kata f9yj, qfbz follow-up)

Implementation-only fix pass from the operator review of the support-APIs branch. Both APIs verified live; this plan fixes a semantics deviation in month totals and reverts an out-of-scope rewrite of the merged title derivation.

## Plan Context

- Do not run review-loop. This is a review-fix pass; the operator reviews the result directly.
- Mandatory reading: `docs/accounting-semantics.md` (spending/income/refund total definitions), `docs/architecture.md`.
- Do not edit any file under `docs/` except moving this plan to `docs/plans/completed/` when done. Ground-truth docs are reviewer-owned.
- Protect — do not regress (verified live and by integration tests): category `economic_intent` filter (single, multi, allowlist 400, include_hidden composition); month-totals month boundaries, exclusion of transfers/exchange/cancelled/tombstoned, unconverted counts, empty-month zeros, invalid-month 400; merged `display_title` and `anchor_date` behavior on `GET /api/transactions`.
- Kata issues: f9yj, qfbz — comment progress only; the operator closes at merge.

## Tasks

### Task/Commit 1: Month totals — follow the accounting-semantics refund rule

Review finding (major): refund records are netted into the spend total (`internal/store/transactions.go` maps refund/flow rows to `total_kind = 'spend'`), but `docs/accounting-semantics.md` defines spending totals as expense + fee and puts refunds in their own refund totals, excluded from gross income. The netting rule was invented; the plan required following the doc.

- [x] Change the month-totals aggregation so the spend total is gross expense + fee only and refund records are excluded from both spend and income totals, exactly per `docs/accounting-semantics.md`
- [x] Update the `api/openapi.yaml` descriptions for the month-totals endpoint to state the definitions in the doc's terms (no "refunds reduce spend" language); regenerate contracts/clients via the Justfile codegen recipes
- [x] Update the integration tests' expected totals accordingly, and add the missing exclusion coverage: a month containing adjustment and fx_gain_loss activity contributes nothing to either total
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue qfbz (comment only)
  - [x] Commit changes

### Task/Commit 2: Revert the out-of-scope title-derivation rewrite

Review finding (major): commit `9219a34` ("Derive transaction titles from components", pre-rebase `4b5acaa`) rewrote the already-merged `display_title` derivation in `internal/services/transactions/classification.go` and changes fallback behavior on uncovered edge paths (exchange-provider flow records no longer title candidates; system fee records can win the counterparty fallback; narrowed final fallbacks). This branch's scope was two new APIs; the merged feature must keep its behavior.

- [x] Revert commit `9219a34` (`git revert`), restoring the merged title-derivation behavior byte-for-byte in `internal/services/transactions/classification.go`; resolve any mechanical conflicts with this branch's other commits without changing title behavior
- [x] If the revert breaks nothing else (expected — month totals live in store SQL and do not use the title code), do not compensate with new abstractions; leave the previously merged implementation as is
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
