# Plan: Hierarchy restructuring API with subtree FQN rewrite (Kata mrs9)

Add per-entity restructure (rename/move) command endpoints that atomically rewrite the FQN path prefix `from` to `to` across active rows for accounts, categories, tags, and transaction templates, per `docs/hierarchy-semantics.md` (Rename and Move, Leaf-to-Group, Group Path References). Categories rewrite active `budget.category_fqn` references in the same transaction. Template PUT Replace is unified with this design: PUT no longer changes `fqn`; renames go through restructure.

## Plan Context

- Owning doc: `docs/hierarchy-semantics.md`. Settled decisions (kata mrs9 comments): dedicated command endpoints, prefix-addressed per entity; category/tag PATCH stay `is_hidden`-only; destination must be fully unoccupied (409 conflict); whole op atomic in one DB transaction; empty moved set is 404; hidden leaves follow; tombstoned rows never rewritten; budget `(category_fqn, month)` collision rejects the whole op with 409.
- Self-subtree rule (clarified in the doc): `to` must differ from `from` (400). When the moved set is more than the single leaf at `from`, `to` must not lie under `from` (400). When the moved set is exactly the single leaf at `from`, `to` under `from` is allowed — that is the leaf-to-group transition.
- Endpoints: `POST /api/accounts/restructure`, `POST /api/categories/restructure`, `POST /api/tags/restructure`, `POST /api/transaction-templates/restructure`. Shared request schema `RestructureRequest { from_fqn, to_fqn }` (both required), shared response `RestructureResponse { moved_count }` (200). Errors: 400 `invalid_request` (FQN validation, `to` == `from`, group moved into own subtree), 404 `not_found` (empty moved set), 409 `conflict` (destination occupied; budget collision) reusing the per-entity FQNConflict response components.
- Service shape mirrors Create enforcement from 5w9q: whole check-then-write runs under `SerializeReferenceOperation`. Accounts/categories/tags compute the moved set and destination check from the refcache `Snapshot` (active rows only — hidden rows are in the cache and move with the subtree); templates list active FQNs through the repo under the mutex. Destination check: reject when `services.FQNPathConflict(to, fqn)` holds for any non-moved active FQN. After a successful store write, invalidate that service's reference cache (`InvalidateReferenceCache` pattern); the loader rebuilds lazily.
- Store: one new repo method per entity, e.g. `RestructureFQNs(ctx, from, to string) (int64, error)`: single `UPDATE ... SET fqn = ? || substr(fqn, length(?) + 1), updated_at = CURRENT_TIMESTAMP WHERE tombstoned_at IS NULL AND (fqn = ? OR starts_with(fqn, ? || ':'))` returning affected row count. `parent_fqn`/`name`/`level` are generated columns and recompute automatically. Map active-unique-index violations to `services.ErrConflict` (schema constraint backstop, not a precheck — do not add store prechecks).
- Category restructure is the only cross-table write: the category store method wraps its own transaction (`withTx`) around the category UPDATE plus a budget rewrite `UPDATE budget SET category_fqn = <rewritten> WHERE tombstoned_at IS NULL AND (category_fqn = ? OR starts_with(category_fqn, ? || ':'))`. A violation of `budget_active_category_month_unique` maps to `services.ErrConflict` and aborts the whole transaction. This is the first budget write path; there is no budget REST API — seed and inspect budget rows in tests via direct SQL through the apptest process DB handle.
- Template PUT unification: `Replace` rejects a body `fqn` that differs from the stored active template's `fqn` with `services.InvalidRequest` (renames go through restructure); the prefix-free availability check in Replace becomes unnecessary and is removed. Records replacement semantics are unchanged.
- No new migrations and no schema changes. Regenerate API code with `just openapi` and `just frontend-openapi`; no frontend runtime behavior changes in this task (generated types only).

## Tasks

### Task/Commit 1: Restructure primitive and accounts endpoint

Establishes the full vertical slice: shared FQN rewrite helpers, the store bulk-rewrite method, the service operation, the REST endpoint, and app-tests. After this commit accounts support rename/move with subtree follow.

- [x] Add shared pure helpers to `internal/services/fqn.go`: at-or-under predicate (`fqn == path` or under `path:` at segment boundary) and prefix rewrite (`from` → `to` applied to one FQN); reuse `FQNPathConflict` for the destination check
- [x] Add `RestructureFQNs(ctx, from, to string) (int64, error)` to the account store: one UPDATE rewriting active rows at or under `from` (tombstoned rows excluded), returning the moved count; map unique-index violations to `services.ErrConflict`
- [x] Add `accounts.Service.Restructure(ctx, from, to)` under `SerializeReferenceOperation`: validate both FQNs and `to != from` (400); moved set from cache snapshot of active rows — empty is `NotFound` (404); reject `to` under `from` unless the moved set is exactly the single leaf at `from` (400); reject when any non-moved active FQN conflicts with `to` via `FQNPathConflict` (409); call the repo; invalidate the account reference cache after success; return the moved count
- [x] Add `POST /api/accounts/restructure` to `api/openapi.yaml` with shared `RestructureRequest`/`RestructureResponse` schemas and 400/404/409 responses (reuse `AccountFQNConflict`); regenerate with `just openapi` and `just frontend-openapi`; add the thin strict-server handler
- [x] App-tests (API boundary): leaf rename; group move where the whole subtree follows including a hidden leaf; leaf-to-group (`A:B` → `A:B:Other`) succeeds; group into own subtree rejected 400; `to == from` rejected 400; invalid FQNs rejected 400; unknown `from` rejected 404; destination occupied — non-moved row at/under `to` and non-moved row path-prefix of `to` — rejected 409 with nothing changed; tombstoned rows keep historical FQNs; moved account keeps its id and register/balances stay reachable under the new FQN
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata mrs9
  - [x] Commit changes

### Task/Commit 2: Category restructure with budget lockstep

Applies the same primitive to categories with the one cross-table rule: active budget group-path references at or under `from` are rewritten in the same transaction, and a `(category_fqn, month)` collision rejects the whole operation.

- [x] Add `RestructureFQNs` to the category store wrapping `withTx`: category UPDATE (as accounts) plus active `budget.category_fqn` rewrite for paths at or under `from`; map `budget_active_category_month_unique` violations to `services.ErrConflict` so the whole transaction rolls back
- [x] Add `categories.Service.Restructure` (same shape and error contract as accounts)
- [x] Add `POST /api/categories/restructure` to `api/openapi.yaml` (reuse shared schemas, `CategoryFQNConflict`); regenerate; add the handler
- [x] App-tests: category core restructure cases (rename, 404, self-subtree 400, destination occupied 409)
- [x] App-tests: category subtree move rewrites active budget rows at and under `from`; tombstoned budget rows untouched; budget `(category_fqn, month)` collision rejects the whole op 409 and leaves both category FQNs and budget rows unchanged
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata mrs9
  - [x] Commit changes

### Task/Commit 3: Tag and template restructure; template PUT unification

Completes entity coverage. Templates have no refcache: the service computes the moved set and destination check from `ListActiveFQNs` under the mutex. Template PUT stops changing `fqn` so restructure is the single rename path.

- [x] Add `RestructureFQNs` to the tag store, `tags.Service.Restructure`, and `POST /api/tags/restructure` (reuse shared schemas, `TagFQNConflict`); regenerate; handler; app-tests (rename with subtree, 404, destination occupied 409, `to == from` 400)
- [x] Add `RestructureFQNs` to the transaction template store, `transactiontemplates.Service.Restructure` (moved set and destination check from `ListActiveFQNs` under `SerializeReferenceOperation`), and `POST /api/transaction-templates/restructure`; regenerate; handler; app-tests (rename follows subtree and template records/defaults stay intact by id, 404, destination occupied 409)
- [x] Restrict template `Replace`: a body `fqn` differing from the stored active template's `fqn` is rejected with `services.InvalidRequest` (400); remove the now-unneeded prefix-free availability check (and `ensureFQNAvailable` excludeID plumbing if nothing else uses it); unchanged-`fqn` Replace still fully replaces records
- [x] Update `api/openapi.yaml` for template PUT: description states `fqn` must equal the current value and renames go through restructure; drop the PUT 409 FQN-conflict response if no conflict path remains in Replace; regenerate
- [x] Update template app-tests: the PUT rename-onto-conflicting-path test becomes PUT fqn-change-rejected 400; unchanged-fqn Replace coverage stays
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata mrs9
  - [x] Commit changes

### Task/Commit 4: Project state and package docs

Records the delivered capability and any changed implicit contracts.

- [x] Add the restructure capability to `PROJECT_STATE.md` (API capability groups): per-entity rename/move endpoints with atomic subtree FQN rewrite; category restructure rewrites budget group-path references in lockstep; template PUT no longer changes `fqn`
- [x] Update package docs where implicit contracts changed (category store restructure's cross-table budget side effect; template Replace fqn restriction) per `docs/package_doc_template.md` conventions — only where the contract is not obvious from API docs
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata mrs9
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Per-entity hierarchy restructure endpoints with atomic subtree FQN prefix rewrite per docs/hierarchy-semantics.md; decisions: check-then-write under SerializeReferenceOperation with refcache snapshot (templates via repo list); destination fully unoccupied else 409; empty moved set 404; leaf-to-group under-itself allowed, group-into-own-subtree 400; category restructure rewrites active budget.category_fqn in same tx, (path,month) collision 409 aborts all; template PUT fqn change removed in favor of restructure; no store prechecks"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata mrs9 with evidence
