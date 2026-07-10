# Plan: Add Edit and Delete row actions to member rows (`0jg6`)

Give Members rows the same trailing row-action affordances as the other reference tables: a hover/focus-revealed Edit action that opens the existing member editor and a Delete action that opens the standard named confirmation and calls the existing delete API. Covers only currently supported capabilities — no hide/unhide, no proactive eligibility-based disabling (those are separate follow-ups).

## Plan Context

- Ground truth: `docs/webui-design.md` — per-row actions live in one narrow trailing actions column; button-class actions are compact icon buttons with tooltips revealed on row hover and row focus; button-class actions fold per row when the actions cell cannot fit the row's full cluster (shared `RowActions` mechanism, already in place); reference data uses tombstone delete with confirmation. `docs/webui-theme-arcade-cabinet.md` — icon-button affordance treatment.
- Implementation baseline: Before Task/Commit 1, `frontend/src/features/members/members-page-content.tsx` rendered a single Name column with whole-row click/Enter/Space opening the editor via `onEditMember`; no actions column. The member delete flow existed in `frontend/src/features/members/members-side-panel.tsx` (`deleteLedgerMemberById`, named confirmation copy "Delete <name>? This tombstones the member…", refresh via `refreshMembersAfterMutation`, notice "Member deleted."). Accounts showed the row-level pattern to mirror: `RowActions` in the trailing cell plus a page-level delete-confirmation dialog (`frontend/src/features/accounts/accounts-tree.tsx`, `deleteTarget` state and fixed-position dialog).
- Approach: add a trailing Actions column to the members table with the shared `RowActions` component (foldable; two button actions, no toggles). Edit invokes the existing `onEditMember` handler with the action button as opener. Delete opens a members-owned named confirmation dialog (same copy and destructive-button treatment as the side-panel confirmation), calls the existing `DELETE /api/members/{id}` client function, refreshes the member list, and shows the normal success notice; API errors render in the dialog like the side-panel flow. Reuse existing members feature helpers; do not duplicate validation or API mapping.
- Row activation: `RowActions` already stops click propagation; keep whole-row click/Enter/Space edit working, and keep action buttons reachable by keyboard through row focus without triggering row activation.
- Protect — do not regress: whole-row edit activation and its aria affordances; the side-panel create/rename/delete workflows and their e2e coverage (`frontend/tests/e2e/members-page.spec.ts`); the fit-based fold contract and centered folded cluster from the shared `RowActions` (`frontend/tests/e2e/reference-row-actions.spec.ts`); internal table scrolling and full-height frame (`frontend/tests/e2e/reference-table-layout.spec.ts`); search filtering; skeleton/empty/error states (skeleton grid must match any column changes).
- The delete confirmation is the standard named confirmation (entity name shown in the dialog); no typed-name input exists in this pattern — match the existing member confirmation copy.
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `0jg6`.

## Tasks

### Task/Commit 1: Member row Edit/Delete actions with named delete confirmation

Add the trailing actions column with shared RowActions, wire Edit to the existing editor and Delete to a page-level named confirmation using the existing delete client call, and cover the behavior in the members e2e spec.

- [x] Add a trailing Actions column to the members list table: `RowActions` (foldable) with Edit (opens the existing member editor via `onEditMember`, opener = the action button) and Delete (opens the named confirmation dialog); adjust column widths and the loading-skeleton grid consistently; header labeled like the other reference tables.
- [x] Implement the members row-delete confirmation dialog: standard named confirmation copy matching the side-panel flow, destructive confirm button, cancel restores focus sensibly, in-dialog error rendering on API failure; on success refresh the members list and show the "Member deleted." notice.
- [x] Ensure action controls stop row-activation propagation (click and keyboard) and are keyboard accessible through row focus; whole-row click/Enter/Space still opens the editor.
- [x] Extend `frontend/tests/e2e/members-page.spec.ts`: hovered/focused member row reveals Edit and Delete with tooltips; Edit opens the side panel for that member; Delete opens the named confirmation, confirming deletes the member (row disappears, notice shown); cancel keeps the member; clicking Delete does not open the editor; keyboard path (focus row, reach actions, activate) works.
- [x] Update `PROJECT_STATE.md` with a one-line note that member rows carry Edit/Delete row actions.
- [x] Update the members feature package doc only if this introduces a non-obvious implicit contract (e.g., ownership of the row-delete dialog vs the side panel).
- [x] Add Kata `0jg6` progress and verification evidence.
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
- [x] Run `just review-loop "Add Edit and Delete row actions to member rows reusing the existing editor, delete API, and named-confirmation pattern; keep whole-row edit activation, shared RowActions fold contract, and side-panel workflows intact"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `0jg6` only after the plan is moved to completed
