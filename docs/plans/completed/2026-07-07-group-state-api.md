# Plan: Group-state services and API — derived hidden state, bulk hide/unhide by path (Kata j494)

Expose derived group hidden state and add path-addressed bulk hide/unhide for accounts, categories, and tags, per `docs/hierarchy-semantics.md` (Hidden and Featured State): a group is hidden when every active leaf at or under it is hidden; hiding a group means bulk-hiding its leaves. Templates have no hidden flag and members are flat — both out of scope.

## Plan Context

- Owning doc: `docs/hierarchy-semantics.md` (Model, Hidden and Featured State). Groups are implicit path prefixes of active leaf FQNs; they have no rows and no stored flags; derived hidden state must be computed from active leaves (hidden included). A group with mixed hidden/visible leaves is visible.
- New read endpoints: `GET /api/accounts/groups`, `GET /api/categories/groups`, `GET /api/tags/groups`. Each returns every implicit group derived from active leaves of that entity type — one item per distinct proper FQN prefix — with `fqn`, `parent_fqn` (nullable), `level`, and derived `is_hidden`. Sorted by `fqn`, unpaginated (group count is bounded by leaf count; mirror the accounts balances list response conventions). Query param `include_hidden` (default false): by default groups whose derived state is hidden are excluded, matching the repo REST rule that hidden resources are excluded by default (`docs/architecture.md`).
- New command endpoints: `POST /api/accounts/set-hidden`, `POST /api/categories/set-hidden`, `POST /api/tags/set-hidden` with shared request schema `SetHiddenByPathRequest { path_fqn, is_hidden }` (both required) and shared response `SetHiddenByPathResponse { updated_count }` (200). Sets `is_hidden` unconditionally on every active leaf at or under `path_fqn` (a leaf path works identically to a group path). Errors: 400 `invalid_request` (FQN validation), 404 `not_found` (no active leaf at or under the path). Idempotent: re-hiding an already hidden subtree returns the full target count.
- Service shape mirrors the merged restructure operations: whole check-then-write under `SerializeReferenceOperation`; target set computed from the refcache `Snapshot` (active states carry `fqn` and the reference's `IsHidden`); empty target set → `NotFound`; store does one bulk UPDATE; invalidate that service's reference cache after success (bulk change — do not per-row `Put`).
- Group derivation is service-owned and cache-backed: from the snapshot's active states, collect every proper `:`-prefix of each active leaf FQN as a group, and mark a group hidden when every active leaf at or under it is hidden. Put the pure prefix-expansion/derivation helper(s) in `internal/services/fqn.go` beside `FQNAtOrUnder`. Accounts/categories/tags reference states already carry hidden state in the cached `Reference`; extend the cached state only if something needed is missing.
- Store: one new method per entity, e.g. `SetHiddenByPath(ctx, path string, hidden bool) error`: `UPDATE ... SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE tombstoned_at IS NULL AND (fqn = ? OR starts_with(fqn, ? || ':'))` — same predicate as `RestructureFQNs`. Services return `updated_count` from the active target set selected under `SerializeReferenceOperation`. No store prechecks.
- Accounts keep `UpdateMutable` for single-leaf PATCH; categories/tags keep `UpdateHidden`. The bulk operation is additive; no changes to existing PATCH semantics.
- No migrations, no schema changes, no ground-truth doc edits. Regenerate API code with `just openapi` and `just frontend-openapi`; generated frontend types only — no frontend runtime changes in this task.

## Tasks

### Task/Commit 1: Group state vertical slice for accounts

Establishes the shared helpers and the full pattern: derived groups listing, bulk set-hidden, endpoints, and app-tests for accounts.

- [x] Add pure helpers to `internal/services/fqn.go`: expand an FQN into its proper `:`-boundary group prefixes, and any small predicate reuse needed for derivation
- [x] Add `accounts.Service.GroupStates(ctx, includeHidden bool)`: derive groups from the cache snapshot's active states (hidden leaves included in derivation); group `is_hidden` = every active leaf at or under it is hidden; exclude hidden groups unless `includeHidden`; sort by `fqn`
- [x] Add `SetHiddenByPath` to the account store (bulk UPDATE per Plan Context) and `accounts.Service.SetHiddenByPath(ctx, path, hidden)` under `SerializeReferenceOperation`: validate FQN (400); target set from snapshot of active states — empty is `NotFound` (404); repo bulk update; invalidate the account reference cache; return updated count
- [x] Add `GET /api/accounts/groups` and `POST /api/accounts/set-hidden` to `api/openapi.yaml` with shared schemas per Plan Context; regenerate with `just openapi` and `just frontend-openapi`; add thin strict-server handlers
- [x] App-tests (API boundary): groups listing derives nested groups from leaves; mixed hidden/visible leaves → group visible with `is_hidden` false; all leaves hidden → group hidden, excluded by default, present with `include_hidden=true`; tombstoned leaves do not create or influence groups; set-hidden hides every active leaf at and under the path including nested leaves (assert via list with `include_hidden`); unhide restores; leaf path works; already-hidden subtree re-hide returns full count; unknown path 404; invalid FQN 400; leaves created later under a hidden group default to visible
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata j494
  - [x] Commit changes

### Task/Commit 2: Categories and tags

Mirrors the accounts pattern for the other two hidden-capable dictionary entities.

- [x] Add `GroupStates` and `SetHiddenByPath` to the categories service and category store; `GET /api/categories/groups`, `POST /api/categories/set-hidden`; regenerate; handlers
- [x] Add the same to the tags service and tag store; `GET /api/tags/groups`, `POST /api/tags/set-hidden`; regenerate; handlers
- [x] App-tests per entity (lighter mirror of the accounts suite): derivation happy path with a fully-hidden group excluded by default, set-hidden subtree happy path with unhide, 404 and 400 cases
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata j494
  - [x] Commit changes

### Task/Commit 3: Project state and package docs

- [x] Add the capability to `PROJECT_STATE.md` (API capability groups): derived group listings and path-addressed bulk hide/unhide for accounts, categories, and tags
- [x] Update package docs only where implicit contracts changed, per `docs/package_doc_template.md` conventions
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata j494
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Group-state API per docs/hierarchy-semantics.md Hidden and Featured State: derived group listings (GET /api/{accounts,categories,tags}/groups, hidden groups excluded by default) and path-addressed bulk set-hidden commands under SerializeReferenceOperation with single bulk UPDATE and cache invalidation; decisions: group hidden = every active leaf at or under path hidden; empty target 404; no store prechecks; templates and members out of scope"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata j494 with evidence
