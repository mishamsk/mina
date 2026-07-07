# Plan: Restructure UI review fixes (Kata 4hmc, fix plan 1)

Operator review of branch `4hmc-restructure-ui` confirmed the feature works live (group move, leaf rename, conflict handling, theme compliance verified with screenshots) but found one regression in the new transaction-cache guard plus small UX/code defects. This plan fixes them.

## Plan Context

- Do not run review-loop.
- Protect — do not regress: the restructure side panel and its non-modal semantics (Esc closes, opener focus restored); the per-row action on leaf and group rows; conflict message shown inline under the "To" field with input preserved; bulk-safe refresh after a successful move; all existing e2e coverage; the operator commits on this branch (`docs/webui-design.md` row-action line; do not touch ground-truth docs).
- Scope exclusions: no new endpoints or backend changes; no register-page/header invalidation guards (tracked separately as kata 6kcn); no refactor of the repeated `apiErrorMessage` helpers.

## Tasks

### Task/Commit 1: Fix review findings

- [x] Transaction cache guard regression (`frontend/src/store/accounts.ts`): completions must be dropped ONLY when the cache generation has advanced since the fetch started; two in-flight fetches of the same transaction within one generation must resolve last-write-wins (currently the first completion deletes the loading entry and the guard discards the second, so a fresher post-mutation `refreshAccountTransaction` result can be thrown away in favor of a stale earlier fetch, and a duplicate error can pin while the success is dropped). Rework the guard to compare the completion's generation against the current cache generation rather than the per-id loading entry; update the now-stale comment at `frontend/src/features/accounts/use-account-register-resource.ts:181`
- [x] Panel stacking (`frontend/src/pages/accounts-page.tsx`): opening the create/edit side panel must close the restructure panel (the reverse rule already exists), so the two `fixed top-4 right-4` panels can never stack and Esc always targets the visible panel
- [x] Error announcement (`frontend/src/features/hierarchy/restructure-dialog.tsx`): submit/field error text must be announced — render the error region with `role="alert"` (or an equivalent live region), consistent with the side panel's general-error banner treatment
- [x] Icon (`frontend/src/features/accounts/accounts-tree.tsx`): the row action must not reuse the `Reload` glyph already used by the error-state Retry button on the same screen; pick a more apt pixelarticons glyph for move/rename (keep the tooltip and aria-label)
- [x] Dead code (`frontend/src/pages/accounts-page.tsx`): remove the unreachable `try/catch` around `restructureLedgerAccounts` (the client error interceptor returns failures as `{ error }` results)
- [x] Extend or adjust e2e/tests only as needed to keep suites green (e.g. icon change is invisible to role/name selectors; no new scenarios required)
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] `just test` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata 4hmc
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
