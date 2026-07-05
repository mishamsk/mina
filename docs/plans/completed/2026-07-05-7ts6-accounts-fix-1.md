# Plan: 7ts6 Accounts page — operator review fixes (fix plan 1) — Kata issue `7ts6`

Fix field-error clearing and small polish items from the operator audit. The page is verified live (tree, filters, side panel, credit limits). No design changes.

## Plan Context

- Do not run review-loop.
- Accepted as-is (do not change): neutral `AccountTypeBadge` treatment; row-click-opens-edit affordance; rows non-links; side-panel component structure; `FqnPath` truncation change (tooltip carries the full path).
- Protect — do not regress: all 56 e2e; PATCH-constrained edit mode; Esc coordination; load-cancellation/retry semantics; URL state.
- Scope exclusions: nothing beyond the items below.

## Tasks

### Task/Commit 1: Field-error lifecycle + polish

- [x] `accounts-side-panel.tsx:650-655,695-700` (+ API-error path `:514,551`): stale errors persist after the user fixes a field — blur currently merges `validateForm` output via object spread (never deletes), and API field errors are never cleared by editing. Make blur set/delete the specific field's key (and clear that field's API error on change), per the design rule "forms validate inline on blur"; add on-blur validation for the credit-limit amount (`:804-819`); keep credit-limit errors from wiping form-field errors and vice versa (merge by key, `:523,551`).
- [x] e2e: cover the fix — submit or blur an invalid FQN (error shown), fix the value, blur → error gone; and an API field-error mapping case (duplicate FQN → error on the FQN field, cleared after editing).
- [x] `accounts-tree.tsx:153,247`: use the semantic `var(--table-header)` token for the header band instead of `--color-class-transfer-bright`.
- [x] `accounts-tree.tsx:203-209`: error state gains the design-mandated expandable machine-readable detail and a retry affordance (wire retry to the resource load; the resource already supports re-triggering after `clearAccountsPageLoading`).
- [x] `accounts-side-panel.tsx:517-598`: apply the `panelSessionActiveRef` guard consistently after awaits in `addCreditLimit`/`deleteCreditLimit`/`deleteAccount` (same pattern as `submitForm`).
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
