# Plan: Reference-table rows open read-only detail (Kata 6pdf)

Change reference/dictionary row activation from edit-first to detail-first, per the operator-amended `docs/webui-design.md` rule ("Reference/dictionary row activation … opens the entity's read-only detail/register page"; read it plus the always-visible row-actions rules first; do not edit ground-truth docs). Edit moves to a compact trailing row action.

## Plan Context

- Kata issue: `6pdf`. Coordinates with merged `r4yb` (always-visible RowActions — edit joins the trailing cluster).
- MANDATORY pre-reads: the amended `docs/webui-design.md` bullets (row activation, row actions), `docs/frontend-architecture.md`, `docs/TESTING.md`.
- Acceptance mapping (from the issue):
  - `accounts-tree-row` leaf → `/accounts/:accountId`; account group rows → `/accounts/group?prefix=...`.
  - `categories-tree-row` leaf → `/categories/:categoryId`; derived groups → `/categories/group?prefix=...` if that route exists (check the drill-down routes; if there is no category/tag group route, group rows keep their current activation and note it in the kata close).
  - `tags-tree-row` leaf → `/tags/:tagId`; groups per the same rule.
  - `members-list-row` → `/members/:memberId`.
  - Edit becomes a compact trailing action (icon button, tooltip "Edit …") in the RowActions cluster; ALL action buttons (edit, delete, hide, star, overflow) stop propagation so they never trigger row activation.
  - Remove the account-name-only hover underline as the primary affordance (the row is the affordance now).
  - Enter/Space on a focused row navigates (update the rows' `aria-keyshortcuts`/`aria-label` hints accordingly — they currently say "Press Enter or Space to edit.").
  - TransactionBrowser row activation is the explicit exception and stays unchanged (expand records).
- Interaction details:
  - Keep rows keyboard-focusable; activation = navigate. The edit side panel opens ONLY from the edit action now.
  - The close-on-delete behavior (editor auto-close when the edited entity is row-deleted) must keep working with the edit action as the panel opener.
  - Navigation should preserve the browser back behavior (client-side navigate).
- e2e impact (update deliberately, preserving each spec's intent):
  - Every spec that opens the editor via row click (categories/tags/members/accounts specs, incl. the close-on-delete and Escape-priority specs) switches to the edit row action as the opener.
  - Row-activation specs now assert navigation to the detail/register routes (leaf + group + member) — add coverage for click AND Enter/Space activation, and for action-button propagation stopping (clicking delete/edit must NOT navigate).
  - `reference-drilldowns.spec.ts` direct-navigation specs remain valid; extend with row-activated navigation entry.
- Docs: no further ground-truth edits. Update feature PACKAGE.md files only if documented contracts change. No PROJECT_STATE.md change (interaction refinement).

## Tasks

### Task/Commit 1: Row activation navigates; edit becomes a trailing action

- [x] Rework the reference tables (accounts tree, categories/tags trees, members list) per Plan Context: activation navigates to detail/register routes, edit joins the RowActions cluster, propagation stopped on all action buttons, hover-underline-as-primary-affordance removed, aria hints updated.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `6pdf` (`kata comment 6pdf --agent ...`)
  - [x] Commit changes

### Task/Commit 2: e2e migration and new activation coverage

- [x] Update all editor-opening specs to the edit row action; add row-activation navigation coverage (click + keyboard, leaf/group/member, propagation stops) per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (single unrelated WebKit flake on retry)
  - [x] Update progress in Kata issue `6pdf`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Reference rows open read-only detail (kata 6pdf): row activation (click/Enter/Space) navigates to detail/register routes per operator-amended webui-design; edit is a compact trailing RowActions action; all action buttons stop propagation; account-name hover underline removed as primary affordance; transactions browser stays the expand exception; editor-opening e2e migrated to the edit action with new activation/propagation coverage; ground-truth doc edits operator-owned and already committed"`
- [x] Move this plan to `docs/plans/completed/`
