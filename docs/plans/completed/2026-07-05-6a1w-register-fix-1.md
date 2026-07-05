# Plan: 6a1w account register — operator review fixes (fix plan 1) — Kata issue `6a1w`

Fix a confirmed peek-panel rendering defect plus three low audit findings. The page, register, arrow walking, Esc focus return, and links are all verified working live — do not redesign them.

## Plan Context

- Do not run review-loop.
- CONFIRMED VISUAL DEFECT (operator live test, 1680px viewport, peek open on an adjustment transaction): inside the peek panel the journal-records subtable drops into the stacked label/value reflow (the `@container (max-width: 680px)` layout from the detail-panel styles) and the AMOUNT value wraps ONE CHARACTER PER LINE ("+ / 1 / , / 0 / 0 / 0 / . / 0 / 0 / $" vertically); the ACCOUNT value is over-truncated to "c… J.". Root cause to investigate: the stacked layout's amount cell allows character wrapping (word-break/width collapse) when the container is the narrower peek panel; the amount must render on one line (mono, tabular) and the account path must truncate segment-wise like elsewhere. Fix so the peek's records read correctly at the peek's width — either by giving the stacked layout a sane min width/no-wrap amount treatment, or by sizing the peek's records container out of the stacked breakpoint; whichever keeps the transactions-page detail panel rendering unchanged.
- Audit findings to fix:
  - LOW `use-transactions-resource.ts:229-238`: `invalidateAccountRegistersForTransaction` only invalidates the SAVED transaction's record account ids — an edit that moves a record from account A to B leaves A's cached register/header stale. Invalidate the union of prior and next account ids (the pre-edit transaction is available on the edit path; delete path already has the full record set).
  - LOW `account-page.tsx` pagination handlers: drop the `record` param when page/pageSize changes (currently a dangling `?record=` survives while the peek unmounts).
  - VERY LOW `account-page.tsx:220`: `Math.min(page + 1, pageCount + 1)` → `Math.min(page + 1, pageCount)`.
  - Optional one-line comment on the benign duplicate-fetch race in `ensureTransactions` (`use-account-register-resource.ts:114-139`).
- Protect — do not regress: all 62 e2e; transactions detail panel rendering (its wider container must keep the current stacked behavior below 680px); non-modal peek semantics; arrow walking; keep-previous pagination; inbound links.
- Scope exclusions: no register filters; no changes to the accounts-list retry/optimistic-merge behavior; nothing else.

## Tasks

### Task/Commit 1: Peek records rendering + invalidation/URL fixes

- [x] Fix the peek records-subtable rendering per the defect description; add an e2e assertion that a peek record's amount renders on a single line (e.g. bounding-box height of the amount value ≈ one line height, or text content not broken across elements) and the account cell shows a truncated path, not single letters.
- [x] Cross-account invalidation fix (union of prior+next account ids on transaction save).
- [x] Drop `record` on page/pageSize change; fix the pagination `+1`; optional race comment.
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
