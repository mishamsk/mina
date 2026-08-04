# Plan: Make transaction templates manual-entry native

## Goal

Correct the transaction-template model and entry workflow so templates contain only reusable manual-entry defaults, the server derives compatible shorthand types, and transaction entry presents templates through Mina's hierarchical picker while every unsaved create draft can be cleared explicitly.

## Constraints

- Mina is evergreen and has no compatibility obligation. Remove template reconciliation from the original schema, domain types, REST contract, generated clients, docs, tests, and UI outright; add no upgrade migration, data conversion, deprecated field, dual-read/write path, or compatibility adapter.
- This removal is scoped to transaction templates. Journal-record reconciliation and its import/reconciliation workflows remain intact; applying a template uses the ordinary manual-entry reconciliation defaults rather than carrying template state.
- Templates remain date-free partial defaults with at least one record. Account, category, member, currency, amount, tags, and memo remain independently optional; records need not balance or match a shorthand.
- Shorthand compatibility is server-derived and never persisted. Complete amounts distinguish exact Spend, Refund, Income, or directional Transfer shapes; missing or partial amounts are ignored together for structural Spend, Refund, and Income compatibility. Exchange remains Advanced-only, and semantically invalid shapes remain valid templates with no shorthand match.
- The derived API result is the list of compatible shorthand types returned with template create/get/list/replace responses. The browser mechanically projects supplied raw defaults into a selected compatible form and leaves missing fields blank.
- The transaction-entry template control reuses the shared hierarchical `EntityPicker` behavior and visual contract. Do not create a separate native datalist or template-only hierarchy implementation.
- Applying a template is a one-time write into the ordinary create draft. Once its values are copied, the draft carries no template identity or provenance and behaves exactly like values entered by hand.
- Create mode has one current draft envelope, whether its values were typed, restored, or template-prefilled. Do not add an undo stack, draft history, layered template state, or pre-application snapshot.
- Clearing is a generic create-draft action, never a template-specific dismissal. After confirmation it permanently resets the current draft to canonical blank defaults and removes its persisted data; there is no undo. Saved session entries remain intact, and existing edit/split discard protection remains the owner of changes to persisted transactions.
- Follow `docs/TESTING.md`: REST/domain scenarios belong in app-tests and browser interaction belongs in focused Playwright coverage; add no unit tests or direct service/store tests.

## Success Criteria

- [x] Transaction-template storage, services, REST requests/responses, generated clients, editors, capture mapping, docs, fixtures, and tests contain no reconciliation-status field or compatibility remnant.
- [x] Every template response carries server-derived compatible shorthand types. Amountless expense templates can appear under both Spend and Refund, amountless income templates appear under Income, Transfer requires complete directional amounts, and Exchange remains Advanced-only.
- [x] The transaction-entry template picker uses the shared hierarchical picker, searches and renders complete FQN paths, shows all templates on Advanced, and shows only templates matching the active shorthand tab on Spend, Income, Refund, Transfer, or Exchange.
- [x] Template Use actions and command-palette launches open a sole compatible shorthand and fall back to Advanced for ambiguous or unmatched templates, without client-side accounting classification.
- [x] Create mode exposes one clear-draft action for any unsaved input, whether typed, restored, template-prefilled, or launched from another surface. It confirms before discarding nonblank work, resets the entire draft envelope—including all tab-local fields and the template chooser—to canonical defaults, removes persisted draft data, preserves saved session history, and restores useful focus.
- [x] After a template prefill is copied, there is no selected-template state, template-specific clear path, pre-application snapshot, undo/history layer, or behavior difference between those values and manual input.
- [x] Evergreen owning docs and `PROJECT_STATE.md` describe the final model and workflow without retaining superseded reconciliation, native-datalist, Advanced-only, template-provenance, or unclearable-draft rules.
- [x] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-02-transaction-template-follow-up.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Remove reconciliation from the template contract

Delete template-record reconciliation end to end. Edit `internal/store/migrations/00010_create_transaction_template.sql` in place, align `docs/data-model.md`, re-pin `internal/store.PinnedMigrationContentHash`, simplify template store/service/http mappings, remove the OpenAPI request/response property, and regenerate repository-owned Go, TypeScript, CLI, and MCP artifacts through Justfile recipes. Update transaction capture and recurring template-copy paths so manual transaction defaults are chosen by their owning transaction/recurring workflows rather than copied from a template.

- [x] Template create/replace rejects the removed JSON property through the strict OpenAPI boundary, every template read omits it, and captured/edited templates expose only the remaining manual defaults.
- [x] App-tests cover create/get/list/replace and template-fed recurring behavior under the final field set; repository searches find no template-specific reconciliation column, member, mapping, UI control, fixture, or documentation statement.
- [x] Update `internal/services/transactiontemplates/PACKAGE.md`, `internal/store/PACKAGE.md`, frontend template package docs, and other owning contracts only where their final invariants change.
- [x] Commit as `refactor(templates): remove reconciliation defaults`.

### Task 2: Derive shorthand compatibility on the server

Add transaction-template-owned shorthand compatibility over date-free template records and compose it into reads and successful writes. The derived list resolves account/category semantics through owning services, uses the transaction classifier for complete amounts, applies narrow structural rules when amounts are incomplete, and never turns a valid partial or Advanced-only template into a read error.

- [x] `api/openapi.yaml` exposes compatible shorthand types on `TransactionTemplate`; generated clients represent the extensible type set and no per-template request is required to render the chooser.
- [x] App-tests prove exact complete-amount matches, amountless and partially filled structural matches, directional Transfer requirements, Exchange fallback, reference semantics, shared-default constraints, and conservative no-match behavior.
- [x] Create/get/list/replace return consistent derived results, and resource invalidation/refetch rules prevent stale matches after template or relevant reference semantics change.
- [x] Update the transaction and template service package contracts with ownership of shorthand fitting and its non-error no-match rule.
- [x] Commit as `feat(templates): derive shorthand compatibility`.

### Task 3: Make template entry hierarchical and drafts clearable

Replace the entry modal's native `input`/`datalist` with the shared hierarchical `EntityPicker`, keyed by template ID and backed by the existing shared in-memory template snapshot. Filter its leaves by the active tab's server-derived compatible types; Advanced retains every template. Applying a template mechanically copies supplied raw defaults into the selected compatible shorthand, while Advanced applies raw partial records. Template-page Use and command-palette launches choose a sole compatible shorthand automatically and otherwise use Advanced.

Treat picker activation as a one-shot write into the one current draft: clear the chooser after applying and retain no selected-template, prior-draft snapshot, or undo state. Replacing nonblank work with a template uses the standard discard confirmation, then overwrites the same draft. Add one create-mode Clear draft action outside the picker that works identically for hand-entered, restored, and template-populated values. When the draft contains user input, confirm before permanently resetting the whole draft envelope, deleting its IndexedDB data, and focusing the template chooser or first create field. Clearing does not erase already saved THIS SESSION entries or the session tally; ordinary modal close continues to persist an uncleared create draft. Edit/split keeps its existing close-and-discard-changes workflow rather than gaining an empty-transaction action.

- [x] Hierarchical browsing, breadcrumb/back-out, full-FQN search, keyboard selection, overflow treatment, focus restoration, loading/error behavior, and hidden selected-state conventions come from `EntityPicker` without a parallel template picker.
- [x] Switching tabs updates available template leaves without silently applying, clearing, or reclassifying a draft; applying from any tab leaves the chooser empty and the resulting values indistinguishable from manual input.
- [x] Focused Playwright coverage proves tab-specific filtering, all-template Advanced behavior, amountless Spend/Refund projection, matched and fallback Use/palette launches, picker keyboard/focus behavior, destructive template replacement confirmation, and generic clear behavior for hand-entered, restored, and template-populated drafts, including persisted-draft deletion, no undo, focus, and saved-session preservation.
- [x] Update `docs/webui-design.md`, relevant frontend package docs, and `PROJECT_STATE.md` with the final server-derived, hierarchical, provenance-free template workflow and generic create-draft clearing behavior.
- [x] Commit as `feat(webui): make entry drafts clearable`.

### Task 4: Remove superseded paths and verify the final workflow

Audit source, generated artifacts, documentation, fixtures, and tests for the old template reconciliation field, native datalist control, unconditional template list, client-side Advanced-only application, template-provenance state, and absence of a generic create-draft clear path. Delete dead fitting/mapping helpers that the server-owned prefill replaces; retain client logic still required for editing saved transactions unless the new shared server capability cleanly owns it too.

- [x] Repository searches and generated-contract review show one template field model, one server-owned shorthand-fit rule set, one hierarchical picker implementation, one provenance-free create draft, one generic clear action, and no template-specific reconciliation or compatibility code.
- [x] Run the plan-wide validation and review-loop criteria, then commit any focused cleanup as `refactor(templates): remove obsolete application paths`.
