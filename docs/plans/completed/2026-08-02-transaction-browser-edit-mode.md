# Plan: Make transaction editing mode-explicit (Kata 7jfs)

## Goal

Implement the interaction contract in [`docs/transaction-browser-edit-mode.md`](../transaction-browser-edit-mode.md): transaction rows and detail stay read-only in browse mode, Edit mode owns selection-based quick changes and independent eligible amount inputs, and the full transaction editor remains the explicit path for structural changes.

## Constraints

- `docs/transaction-browser-edit-mode.md` and Kata `7jfs` are the controlling scope; do not reintroduce superseded interaction choices.
- Keep implementation and documentation evergreen: no compatibility paths, transition flags, deprecated aliases, migration commentary, or references to prior UI behavior.
- Delete superseded components, state, selectors, styles, helpers, exports, and tests as soon as their replacement lands; do not leave dead UI code.
- Preserve server ownership of classification, record roles, display amounts, and accounting validation.
- Keep browse-mode amount chips; only mechanically eligible active transactions become amount inputs in Edit mode, independent of row selection.
- Do not add a Full edit action to the Edit-mode dock; exiting Edit mode exposes the existing Edit actions.
- The new member Set/Clear capability must be one atomic journal-record bulk operation exposed through REST, CLI, and MCP.
- Preserve the read-only transaction detail and account-register peek contracts.
- Before each application-code commit, run `just pre-commit` and `just test`; additionally run `just test-integration` for API, real-network, or JSON-over-HTTP changes and `just test-frontend-e2e` for frontend runtime or browser changes.

## Success Criteria

- [ ] Transaction rows open read-only detail in every transaction-browser embedding; entity chips filter, amount chips remain read-only in browse mode, and list-level journal expansion and cell editing no longer exist.
- [ ] Edit mode provides the approved mode header and pinned in-layout dock for Category, Tags Add/Remove, Member Set/Clear, and grouped settlement/reconciliation actions, with eligibility feedback and keyboard-complete selection.
- [ ] Every mechanically eligible amount is a styled, independently editable input in Edit mode with commit, cancel, validation, refresh, and focus behavior matching the active design contract.
- [ ] The bulk member API validates active member and record references, supports nullable clear, updates atomically, and is available through generated REST, CLI, MCP, and frontend clients.
- [ ] Category, Tag, and Member drill-downs share the same Edit-mode behavior and correctly handle rows that leave the current scope after mutation.
- [ ] No source, style, export, test, package contract, or documentation retains the removed transaction expansion, floating cell-editor, row bulk-popover, or `Bulk edit` UI paths.
- [ ] Final evergreen rules live in `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, and relevant package docs; `PROJECT_STATE.md` reflects the user-visible result and `docs/transaction-browser-edit-mode.md` is removed.
- [ ] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-02-transaction-browser-edit-mode.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Close Kata `7jfs` with the implementation commits and validation evidence.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Add atomic bulk member editing

Add a journal-record bulk member Set/Clear operation alongside the existing category, tag, account, settlement, and reconciliation operations.

- Extend `api/openapi.yaml`, `api/client-surfaces.yaml`, generated Go/frontend clients, `internal/httpapi`, `internal/services/transactions`, and `internal/store` without adding a migration or parallel mutation path.
- Accept unique active record IDs plus a nullable member ID, validate active/tombstoned references in the service, and update all selected active records in one store transaction.
- Cover set, clear, empty/duplicate/missing record IDs, missing/tombstoned members, and all-or-nothing failure through `internal/apptest/runtime/record_bulk_test.go` at the REST boundary.
- Update only package contracts whose bulk-operation invariants change.
- [ ] The generated REST, CLI, MCP, and frontend operation sets are current and the boundary scenarios pass.
- [ ] Commit as `feat(api): add bulk member record updates`.

### Task 2: Replace Bulk edit with the Edit-mode dock

Make Edit mode a single shared transaction-browser workflow and replace the fixed bottom action bar and row-anchored bulk editors with the approved mode header and persistent in-layout dock.

- Rename user-facing and internal transaction edit-mode state directly; do not keep bulk-edit aliases or adapters.
- Keep selection, range selection, page selection, frozen browse controls, pagination clearing, Escape behavior, and selection retention after successful mutations.
- Present Category, Tags Add/Remove, Member Set/Clear, and grouped Status editors as ordinary labeled dock layout; reuse entity pickers and mutation refresh behavior without reusing floating cell wrappers.
- Route Member through the new bulk member operation and Tags through explicit add/remove request semantics.
- Preserve reasoned eligibility/skips, include-hidden policy, mutation errors, focus restoration, and drill-down rows leaving the current scope.
- Remove the row bulk-reference popover component, its shortcuts-to-cell behavior, fixed viewport action surface, obsolete styles, and tests that exist only for those surfaces.
- [ ] Transactions and Category/Tag/Member drill-downs expose one consistent Edit-mode dock with accessible keyboard and narrow-screen behavior.
- [ ] Commit as `feat(frontend): add transaction edit mode dock`.

### Task 3: Make browsing detail-first and amounts input-first in Edit mode

Finish the shared browser interaction change: read-only browse rows open detail, while eligible amount inputs are stable table controls whenever Edit mode is active.

- Remove transaction expansion state, expanded record rendering, structural edit escalation from expanded records, and row `aria-expanded` behavior.
- Make row click, `Enter`, and `Space` open detail in browse mode while chips and trailing actions retain their distinct behavior.
- Keep browse-mode amounts as their current prominent chips; in Edit mode replace every mechanically eligible amount with a styled input regardless of selection and leave ineligible shapes as read-only chips.
- Preserve minimal two-record single-currency eligibility and full-replacement balance semantics; implement Enter save, Tab/blur save, Escape restore, inline validation/error, pending isolation, and refresh/focus recovery.
- Delete the superseded inline-edit coordinator, record cell editors, amount popup editor, inline action wrapper, expanded-record helpers, app-shell/editor hooks, styles, exports, and test helpers once unused; extract only genuinely shared picker option logic.
- Replace obsolete expansion/inline-edit browser coverage with focused E2E scenarios for row-to-detail activation, chip filtering, selection-independent amount editing, invalid/pending input behavior, and keyboard focus across the shared embeddings.
- [ ] The browser contains no hidden fallback or dead path for removed inline/expanded behavior, and the approved browse/Edit-mode contract passes frontend E2E.
- [ ] Commit as `refactor(frontend): simplify transaction browser editing`.

### Task 4: Publish the evergreen contract and remove temporary design state

Make the owning documentation and completion evidence describe only the implemented system.

- Replace the superseded progressive-disclosure, table activation, inline-editing, bulk-operation, component-inventory, theme, and ledger package statements with the final behavior; do not narrate the redesign.
- Update `PROJECT_STATE.md` for the user-visible Edit-mode workflow.
- Remove `docs/transaction-browser-edit-mode.md` after its durable rules are owned elsewhere.
- Confirm removed component names, test hooks, styles, and old `Bulk edit` UI copy no longer appear in active source, tests, or docs.
- [ ] Evergreen docs, package contracts, and project state agree with the shipped UI and API, with no temporary or superseded design artifacts left.
- [ ] Commit as `docs(frontend): finalize transaction edit mode contract`.
