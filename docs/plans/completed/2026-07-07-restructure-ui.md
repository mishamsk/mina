# Plan: Restructure (rename/move) UI on the accounts tree (Kata 4hmc)

Add the rename/move interaction from `docs/webui-design.md` ("rename a node or move it to a new parent from the tree; the whole subtree follows with an FQN prefix rewrite") to the Accounts page, backed by `POST /api/accounts/restructure`. The interaction is built as a reusable dialog so the Categories/Tags/Templates screens (not yet built; owned by other issues) instantiate it later.

## Plan Context

- Owning docs: `docs/frontend-architecture.md` (state, refetch-after-mutation, package boundaries), `docs/webui-design.md` (Accounts screen, overlays/dialog rules), `docs/webui-theme-arcade-cabinet.md` (dialog landmark treatment, buttons, focus, typography), `docs/hierarchy-semantics.md` (restructure semantics — leaves and groups are both prefix-addressed; conflicts are 409).
- Scope: Accounts page only. The dialog component must be reusable (entity-agnostic labels plus a submit callback) and must not be tied to account types; reference-data pages adopt it in their own issues.
- Affordance: a per-row action on BOTH leaf and group rows of the accounts tree (a small icon button following the theme's icon button conventions, e.g. an `icon-sm` outline button with a pixelarticons icon and an accessible name like "Move or rename"), opening a modal restructure dialog. It must not break existing row interactions (row click opens edit panel for leaves; links keep working via the existing `stopPropagation` pattern).
- Dialog: hand-rolled modal following the existing `alertdialog` pattern in `frontend/src/features/accounts/accounts-side-panel.tsx` (overlay, ink outline, pixel shadow, mono uppercase title, focus trap, Escape/Cancel restore focus to the opener) but `role="dialog"` with a small form: read-only "From" path, "To" path text input prefilled with the current path, Cancel + primary submit ("Move"). Show a short sans-serif hint that the whole subtree moves with the path.
- API: add thin wrappers in `frontend/src/api/ledger.ts` following the existing alias-import pattern (e.g. `restructureLedgerAccounts` wrapping the generated `restructureAccounts`), re-exported through `@/api`. Do not call the generated SDK from feature code.
- Errors: reuse the existing error pattern — `apiErrorMessage` on the `{ data, error }` result, message rendered inline under the "To" field (`FieldError`-style), general failures in a `role="alert"` banner in the dialog; the dialog stays open on error so the user can fix the path. Client-side pre-checks stay minimal (non-empty, differs from current path) — the API owns validation and conflicts; do not duplicate backend domain validation.
- Success: close the dialog, toast via the page's existing `onNotice` Toast (e.g. "Moved N account(s)." from `moved_count`), and refresh: `invalidateAccountHeaders`, full `refreshAccountsPage`, invalidate account register pages and group register pages (FQNs changed in bulk — the single-account merge helper is insufficient), plus the featured-balances/overview/lookups refresh set used by `refreshAccountsAfterMutation` in `frontend/src/features/accounts/use-accounts-resource.ts`. Prefer extending that helper with a bulk-safe path over duplicating the orchestration.
- URL/toolbar state, tree filtering, and the side panel remain unchanged. FQN stays read-only in the edit panel; the dialog is the only rename path.
- Tests: frontend e2e (Playwright, `frontend/tests/e2e/`) per existing conventions — API-seeded unique fixtures, `getByTestId("accounts-tree-row")` selectors, `waitForResponse` on the restructure call, toast assertion; conflict case mirrors the existing 409 field-error test at `frontend/tests/e2e/accounts-page.spec.ts:1043-1078`.
- No backend changes. No new npm dependencies.

## Tasks

### Task/Commit 1: Reusable restructure dialog wired to the accounts tree

- [x] Add `restructureLedgerAccounts` wrapper to `frontend/src/api/ledger.ts` (generated `restructureAccounts` aliased per the existing import pattern), re-exported via `@/api`
- [x] Add a reusable restructure dialog component (entity-agnostic: title/labels/hint via props, submit callback returning the API `{ data, error }` result; focus trap, Escape/Cancel, opener-focus restore, theme landmark treatment) in a feature module not tied to accounts so reference-data pages can reuse it
- [x] Add the per-row "Move or rename" action to leaf and group rows in `frontend/src/features/accounts/accounts-tree.tsx` without breaking row-click edit, links, or keyboard interaction; wire it through the accounts page to open the dialog with the row's path
- [x] Implement submit: call the wrapper; on error keep the dialog open and show the message under the "To" field (general banner for network failures); on success close, toast "Moved N account(s).", and run the bulk-safe refresh per Plan Context
- [x] Frontend e2e tests: rename a group with nested leaves from the tree and assert descendant rows show the new prefix and the toast reports the moved count; rename a single leaf; conflict — restructure onto an occupied destination asserts the 409 message appears in the dialog and the dialog stays open; cancel/Escape restores focus and changes nothing
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] `just test` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata 4hmc
  - [x] Commit changes

### Task/Commit 2: Project state

- [x] Add the accounts-tree rename/move capability to `PROJECT_STATE.md` (web UI behavior list, one line)
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata 4hmc
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Accounts tree rename/move UI per docs/webui-design.md backed by POST /api/accounts/restructure; decisions: reusable entity-agnostic dialog for future reference pages; per-row action on leaf and group rows; conflicts shown inline via existing message heuristic; bulk-safe refetch-after-mutation (full accounts refresh + register/group invalidation); FQN stays read-only in the edit panel; no backend changes"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata 4hmc with evidence
