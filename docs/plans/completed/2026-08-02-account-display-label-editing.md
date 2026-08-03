# Plan: Add account display-label editing

## Goal

Make custom account display labels discoverable and fully editable from the
Accounts create/edit side panel, including an explicit path back to Mina's
automatic FQN-derived label.

## Constraints

- Preserve `display_label` as the required effective label in account responses
  and add the nullable stored override needed by editing clients; FQNs remain
  authoritative for identity, hierarchy, search, sorting, and selection.
- A blank label control means automatic labeling and writes `null`; the editor
  must never present an automatic fallback as though it were a custom override.
- Use the existing account side-panel form, validation/error behavior, Arcade
  Cabinet controls, mutation refresh fan-out, and fixed-system-account rules.
- Regenerate owned Go, CLI/MCP, and frontend REST clients from OpenAPI; do not
  hand-write generated contracts.
- Before each application-code commit, run `just pre-commit`, `just test`,
  `just test-integration`, and `just test-frontend-e2e`.

## Success Criteria

- [x] Account create/get/list/update responses expose the nullable custom label
  override alongside the effective label, and app-boundary coverage proves the
  override remains distinct from automatic fallback behavior.
- [x] The Accounts create/edit side panel labels the optional field clearly,
  explains the automatic fallback, initializes it from the override only, and
  supports creating, changing, and clearing a custom label.
- [x] Invalid custom labels remain in the open form with field-level feedback;
  successful changes refresh contextual labels without a page reload.
- [x] `api/openapi.yaml`, `docs/webui-design.md`, `PROJECT_STATE.md`, and owning
  package contracts describe the final API and web behavior concisely.
- [x] `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e` pass.
- [x] From a clean worktree, run
  `just review-loop --plan "docs/plans/2026-08-02-account-display-label-editing.md"`
  once, resolve its findings, and rerun affected validation. Do not run
  review-loop more than once; report any remaining findings.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the
  worktree clean.

## Tasks

### Task 1: Expose the editable label override

Extend the account response contract and transport mapping with the nullable
stored override while retaining the effective display label for presentation.
Regenerate clients and extend the existing account app-boundary scenario across
create, read, list, update, and clear behavior.

- [x] REST responses and generated clients distinguish custom and automatic
  labels without changing existing effective-label consumers.
- [x] Commit as `fix(api): expose account display label overrides`.

### Task 2: Add label editing to the account form

Add the optional label to account form state, validation, create/update payloads,
and accessible side-panel controls. Cover custom-label creation, editing,
clearing, automatic fallback, and field error recovery through the embedded UI.
Update the owning web and package documentation with the same behavior.

- [x] Browser coverage proves label mutations refresh account presentation and
  reopening the form preserves override-versus-fallback state.
- [x] Commit as `fix(accounts): add display label editing`.
