# Plan: Add contextual account display labels

## Goal

Give every account a service-derived display label that is concise enough for
transaction and balance context without weakening FQN-based hierarchy or
selection. Accounts may override the label explicitly; otherwise Mina uses the
final one or two FQN segments. Demo data proves the distinction with separate
Amazon flow and gift-card accounts.

## Constraints

- Display labels are non-unique presentation metadata only. FQNs remain the
  authoritative identity for hierarchy, grouping, search, sorting, references,
  autocomplete, and account selection.
- Account create/update REST inputs may set or clear the optional label, and
  generated CLI/MCP clients inherit that capability. Do not add or change web
  account create, edit, restructure, picker, filter, or navigation-selection
  controls; those surfaces remain FQN-based.
- Contextual account mentions use the effective display label and retain the
  full FQN in a tooltip or equivalent exact-identity context.
- Preserve the existing `name` field as the FQN leaf. Add a required effective
  `display_label` to account responses; a custom value wins, while `NULL`
  derives the final one or two FQN segments in the account service. Clearing an
  override restores the fallback, FQN restructuring recalculates only fallback
  labels, and explicit labels remain unchanged.
- Custom labels must be non-empty and free of leading or trailing whitespace;
  invalid values fail through the standard account validation error path.
- Mina is evergreen: fold the nullable stored field into
  `internal/store/migrations/00005_create_account.sql`, update the canonical
  data model and pinned migration hash, add no upgrade migration, and describe
  only current behavior in durable documentation.
- Before each application-code commit, run the repository-required relevant
  checks through `just`: `just pre-commit`, `just test`,
  `just test-integration`, and `just test-frontend-e2e`.

## Success Criteria

- [x] Account create/get/list/update responses expose the effective display
  label; app-boundary coverage proves explicit labels, one- and multi-segment
  fallbacks, clearing, validation, and restructure behavior.
- [x] Server-derived transaction titles use each account's effective display
  label for directional, adjustment, and dominant-counterparty titles without
  changing transaction classification.
- [x] Contextual web UI account mentions consistently use display labels,
  including transaction records/detail/peek, registers, account and group
  context, the Accounts tree, Overview, and featured balances; full FQNs remain
  available for disambiguation.
- [x] Account pickers, filters, inline/bulk assignment, transaction and recurring
  editors, account editing/restructuring, and account-navigation autocomplete
  continue to render and match FQNs rather than display labels.
- [x] Demo data contains `merchant:Amazon:flow` with display label `Amazon` and
  owned sibling `merchant:Amazon:gift_card`, plus balanced transfer and spend
  activity that demonstrates their distinct balances and contextual titles.
- [x] `docs/accounting-semantics.md`, `docs/data-model.md`,
  `docs/webui-design.md`, relevant package contracts, and `PROJECT_STATE.md`
  describe the implemented behavior concisely and without historical notes.
- [x] `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e` pass.
- [x] From a clean worktree, run
  `just review-loop --plan "docs/plans/2026-08-02-account-display-labels.md"`
  once, resolve its findings, and rerun affected validation. Do not run
  review-loop more than once; report any remaining findings.
- [x] After review-loop findings are resolved and affected validation passes,
  use `agent-browser` against the demo app to record concise video evidence of
  the final contextual display labels and FQN-based account selection at
  `build/account-display-labels.webm`.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the
  worktree clean.

## Tasks

### Task 1: Establish the account display-label contract

Carry the optional stored label and required effective label through the
evergreen schema, account repository/service, REST contract and generated
clients. Keep derivation and validation service-owned, preserve `name` and FQN
semantics, and make transaction classification's existing title derivation use
the effective label supplied with account metadata. Update owning semantic,
data-model, and package documentation in the same change.

- [x] App-boundary account scenarios prove create/read/list/update/clear,
  validation, fallback derivation, and restructure behavior through REST.
- [x] App-boundary transaction scenarios prove explicit and fallback labels in
  simple and fallback display-title paths while classification outputs remain
  unchanged.
- [x] Regenerate owned Go and frontend REST clients with `just openapi` and
  `just frontend-openapi`; generated CLI/MCP request surfaces accept the new
  account field without hand-written exposure logic.
- [x] Commit as `feat(accounts): add display label metadata`.

### Task 2: Use display labels in context and demonstrate them

Render the REST-provided effective label anywhere an account is contextual
prose or a contextual link, using shared ledger/account presentation code so
the full FQN remains available for disambiguation. Keep every surface that
chooses, assigns, searches, restructures, or edits an account on its existing
FQN path. Update demo fixtures with Amazon flow and owned gift-card siblings,
fund the gift card through a transfer, spend from it through the Amazon flow
account, and align user-facing and package documentation.

- [x] Frontend browser coverage proves contextual labels and full-FQN tooltips
  while representative account pickers, filters, editors, and command-palette
  account navigation remain FQN-based.
- [x] Demo app-boundary coverage proves the Amazon account types, explicit and
  fallback labels, balanced activity, resulting gift-card balance, and display
  titles.
- [x] Commit as `feat(accounts): use display labels in context`.
