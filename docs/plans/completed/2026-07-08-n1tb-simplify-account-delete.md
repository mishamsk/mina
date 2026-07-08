# Plan: Simplify account delete — drop delete-by-path, keep per-account deleteability — Kata issue `n1tb`

Remove the group/path account-delete surface (product decision: group subtree delete is unrealistic — almost always blocked by existing dependents — and belongs to future bulk actions if ever needed), reverting to plain CRUD delete on single accounts. Per-account deleteability in the listing stays. Ordered so the UI consumer is removed first and the API loses all users before it is simplified.

## Plan Context

- Ground truth: `docs/webui-design.md` §5 Accounts (row actions; "Leaf and group rows carry the actions that apply to them" — with no group-delete operation, group rows simply carry no delete; no doc edit needed), `docs/frontend-architecture.md`, `docs/architecture.md`.
- This plan intentionally mixes FE and API in ONE branch with strictly ordered commits (FE first, then API), per Misha's explicit instruction — the usual API/FE branch split does not apply here.
- KEEP (do not touch): `Account.deletable` populated by `listAccounts`; the batched `ActiveDependentAccountIDs` dependents query shared by the listing and the `Delete` guard; the leaf-row delete quick action driven by `account.deletable` calling CRUD `deleteAccount`; the side-panel delete; group hide/unhide and move/rename actions; all hide/feature/restructure behavior.
- REMOVE (current anchors, as of this plan's commit):
  - Frontend consumer: `deleteLedgerAccountsByPath` wrapper (`frontend/src/api/ledger.ts:38,595`), its use in the accounts tree group-delete flow (`frontend/src/features/accounts/accounts-tree.tsx:22,511`; group delete action gated on `group.deletable` `:678-682`; group branch of the delete confirm dialog `:906`), and the group-delete e2e coverage (`frontend/tests/e2e/accounts-page.spec.ts:1312-1346` area — the "Delete account group" flows incl. the `/api/accounts/delete-by-path` request assertions).
  - API: `POST /api/accounts/delete-by-path` (`api/openapi.yaml:869-...`, `DeleteAccountsByPathRequest`/`DeleteAccountsByPathResult` schemas `:2439-2447`), handler (`internal/httpapi/strict_entities.go:116` area), service `DeleteByPath` (`internal/services/accounts/accounts.go:486-...` + the `TombstoneByPath` repo interface entry `:132`), store `TombstoneByPath` (`internal/store/accounts.go:344-...`), and their integration tests (`internal/apptest/runtime/account_group_state_test.go` delete-by-path cases).
  - Group deleteability: `AccountGroupState.deletable` has no consumer once the group delete action is gone — remove the field and collapse the accounts groups endpoint back to the shared `GroupState`/`GroupStateListResponse` schemas (`api/openapi.yaml:2335-2367`; the accounts-specific schema split existed only to carry `deletable`), reverting the service/handler group-state mapping accordingly. Keep the integration coverage that asserts per-account `deletable` flags in `listAccounts`.
- Docs that describe the removed capability must be updated in the same commit that removes it (this is authorized): the path-scoped tombstone delete bullet in `docs/hierarchy-semantics.md:98-101`, `internal/services/accounts/PACKAGE.md` if it mentions path delete or group deleteability, and `PROJECT_STATE.md` if it mentions them. Do NOT touch `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, `docs/architecture.md`, or archived plans in `docs/plans/completed/`.
- Regenerate all generated code via the owning `just` recipes; never hand-edit generated files.
- Protect — do not regress: leaf delete quick action (enabled/disabled per `deletable`, tooltip, confirm dialog, CRUD call, 409 surfacing) and its e2e; the deletable-stays-truthful-after-mutations behavior (gm9d fix); side-panel delete; hide toggles (leaf `updateAccount`, group `set-hidden-by-path` — set-hidden is NOT part of this removal); restructure; accounts page rendering; all suites green.

## Tasks

### Task/Commit 1: Frontend — remove the group delete action (no API users remain)

After this commit the chart of accounts has no group delete anywhere; leaf delete is untouched; the frontend no longer references `deleteAccountsByPath`.

- [x] Remove the group delete row action, the group branch of the delete confirm dialog, the `deleteLedgerAccountsByPath` wrapper, and all frontend reads of `group.deletable` (the field disappears from the API in Commit 2 — the UI must stop depending on it now).
- [x] Update `frontend/tests/e2e/accounts-page.spec.ts`: drop the group-delete flows (incl. the delete-by-path request assertions); keep and, if they were entangled with group cases, re-anchor the leaf-delete coverage (disabled tooltip on an undeletable leaf, successful leaf delete, deletable-after-toggle assertion).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: API — remove delete-by-path and group deleteability

After this commit the accounts API is back to CRUD-style delete plus per-account deleteability in the listing.

- [x] Remove the endpoint, schemas, handler, service method, repo interface entry, and store function per Plan Context; collapse `AccountGroupState`(+ListResponse) back to the shared `GroupState`/`GroupStateListResponse`; regenerate server and frontend clients via `just` recipes.
- [x] Remove the delete-by-path and group-deletable integration tests; keep (and adjust types for) the per-account `deletable` listing coverage.
- [x] Update the docs listed in Plan Context (hierarchy-semantics bullet, PACKAGE.md, PROJECT_STATE.md as applicable) in this commit.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Simplify account delete (kata n1tb): remove the chart-of-accounts group delete action and the POST /api/accounts/delete-by-path surface (handler/service/store/schemas/tests); collapse AccountGroupState back to shared GroupState (group deletable dropped — no consumer); KEEP Account.deletable in listAccounts, the shared batched dependents query, leaf-row delete via CRUD deleteAccount, side-panel delete, hide/restructure behavior. Constraints: ordered FE-then-API commits per product decision; generated code only via just recipes; hierarchy-semantics/PACKAGE/PROJECT_STATE updated to match removed capability; webui-design and theme docs untouched; archived plans untouched."`
- [x] Move this plan to `docs/plans/completed/`
