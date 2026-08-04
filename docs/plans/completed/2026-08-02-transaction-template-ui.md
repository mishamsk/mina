# Plan: Add transaction template management and transaction capture

## Goal

Give Mina a complete transaction-template UI: operators can browse and manage hierarchical templates on `/templates`, create or edit date-free partial record defaults in a dedicated modal, use a template to start transaction entry, and save an existing transaction's reusable shape as a new template. As a related cleanup, generic New transaction buttons remain only on the Transactions page while keyboard and contextual entry paths stay available.

## Constraints

- Use the existing transaction-template REST contract and generated frontend operations; no backend, storage, or OpenAPI change is needed.
- Templates remain partial, date-free defaults: at least one record is required, every supported record field is independently optional, records need not balance, and the editor must not expose transaction dates, lifecycle, settlement, source/import metadata, USD conversion, or derived accounting values.
- The template editor is a dedicated route-independent modal with the transaction editor's stage-modal interaction quality, not a mode of `EntryModal`; it must not inherit transaction-only balance, classification, shorthand, batching, or draft-persistence behavior.
- Creating from a transaction copies account, category, member, currency, native amount, tags, memo, and reconciliation status for every returned record. The template FQN starts blank and focused; IDs, all dates/timestamps, lifecycle/settlement, source/external fields, `amount_usd`, and server-derived roles/classes/shapes are omitted.
- Active and cancelled transactions may be saved as templates. Expected occurrences retain only their existing Confirm/Dismiss workflow.
- Generic New transaction buttons remain in the Transactions page header and Transactions empty state only. Remove them from the sidebar, other page headers, reference drill-down empty states, and account/group register empty states; retain `Cmd/Ctrl+K`, the global `n` shortcut, template Use actions, and contextual Edit/Duplicate/Split actions.
- Template/accounting payloads remain transient REST-backed state and must not be persisted to IndexedDB or other browser storage.

## Success Criteria

- [ ] `/templates` is enabled in routing, sidebar navigation, and command-palette page navigation and presents a searchable hierarchical template tree with record-default summaries and working Use, create, edit, move/rename, and delete workflows.
- [ ] The template editor supports keyboard-accessible create/edit flows for all API-supported optional record defaults, accepts incomplete or unbalanced shapes, protects dirty work on close, restores focus, maps API errors without losing input, and refreshes every template consumer after mutations.
- [ ] Saving an active or cancelled transaction as a template opens the editor in place with the complete supported record shape prefilled and no transaction-specific or date-bearing data; expected occurrences do not expose the action.
- [ ] Generic New transaction buttons appear only on `/transactions`, while palette, shortcut, template Use, and saved-transaction actions continue to work from their documented contexts.
- [ ] `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, relevant frontend package docs, and `PROJECT_STATE.md` describe the delivered behavior without retaining the superseded global-button or side-panel-editor rules.
- [ ] `just pre-commit`, `just test`, and `just test-frontend-e2e` pass.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-02-transaction-template-ui.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Concentrate generic transaction entry on the Transactions page

Update the UX ground truth and frontend composition so `PageHeader` no longer injects ledger behavior, the Transactions page supplies its explicit New transaction action, and generic entry buttons disappear from the app shell and non-Transactions empty states. Preserve the global palette/shortcut and contextual transaction/template launchers, and update affected e2e helpers and focus expectations to use an entry point that remains valid in that scenario.

- [ ] The sidebar and every non-Transactions route render no generic New transaction button; `/transactions` retains its header and empty-state actions, including correct modal focus restoration.
- [ ] Browser e2e evidence covers the visibility boundary and proves palette and `n` shortcut entry still work away from Transactions.
- [ ] Commit as `refactor(frontend): concentrate transaction entry actions`.

### Task 2: Add the Templates management page

Create the `frontend/src/features/templates` feature and `/templates` page using the existing reference-tree, FQN, row-action, restructure, confirmation, loading, error, empty-state, and toast patterns. Fetch the complete active template list through generated operations into one explicit in-memory resource snapshot shared by the page, entry template picker, and command palette; mutations must invalidate/refetch that snapshot so no consumer keeps stale names or records. Rows show concise record-default summaries, activate Edit for leaves, and expose Use, move/rename, and delete actions; groups expose only applicable hierarchy actions. Use opens the existing transaction entry modal with the selected template.

- [ ] Sidebar and command-palette navigation reach `/templates`; search filters full FQNs and the client derives groups under the existing prefix-free hierarchy contract.
- [ ] Use, restructure, and named-confirmation delete succeed through generated operations, preserve focus, report API failures, and refresh the tree plus every template-selection surface.
- [ ] A focused `frontend/tests/e2e/templates-page.spec.ts` scenario covers route/navigation, tree summaries/search, Use prefill, restructure, delete, and loading/error/empty behavior without duplicating REST-domain tests.
- [ ] Commit as `feat(templates): add the template management page`.

### Task 3: Add the route-independent template editor modal

Add app-shell-owned, in-memory launch state and a `TemplateEditorModal` that opens over the current page for New template and Edit template. Reuse shared visual primitives and Mina entity pickers where their contracts fit, while keeping a template-specific partial-record draft and write mapping. Create mode requires an FQN; edit mode preserves the FQN and directs rename/move through restructure. Active hidden references remain resolvable with clear hidden treatment, tombstoned references are unavailable, and at least one partial record remains required. Successful create/replace/delete refreshes the shared template snapshot; close/Escape uses discard protection for dirty drafts and restores the invoking control.

- [ ] Every API-supported record default can be independently set or cleared, and incomplete/unbalanced template records save without transaction-only validation.
- [ ] Modal semantics include focus trapping/restoration, nested picker and confirmation Escape ordering, responsive stage layout, inline/API validation, disabled-in-flight actions, and retained input after errors.
- [ ] Template-page e2e covers create, edit, optional/cleared fields, unbalanced records, discard protection, focus restoration, and mutation refresh into EntryModal and command-palette template choices.
- [ ] Commit as `feat(templates): add the template editor modal`.

### Task 4: Save existing transactions as templates

Add a shared frontend mapper from the REST `Transaction` snapshot to a template create draft and wire a Create template action into ordinary transaction row actions and the full transaction detail footer across shared transaction-browser embeddings. Launch the global template editor over the current list/detail context, preserve the underlying panel, and restore focus on close. Keep the action unavailable for expected occurrences and in bulk-edit mode, consistent with the existing action rules.

- [ ] A complex multi-record transaction prefills records in response order with exactly the supported reusable fields, opens with a blank focused FQN, and saves through `createTransactionTemplate` without any copied date or transaction-only metadata.
- [ ] Active and cancelled rows/details expose the action; expected occurrences and account-register peeks do not; row-action overflow and detail layout remain usable at narrow widths.
- [ ] Transaction e2e covers row and detail launches, the copied payload/visible fields, date stripping, expected-occurrence exclusion, focus restoration, and immediate appearance/use of the saved template.
- [ ] Update `PROJECT_STATE.md` and relevant package contracts for the delivered page, modal ownership, shared template refresh behavior, transaction capture mapping, and final entry-button boundary.
- [ ] Commit as `feat(templates): save transactions as templates`.
