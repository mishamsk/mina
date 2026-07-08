# Plan: Accounts listing deleteability info and path-scoped tombstone delete — Kata issue `jrdt`

Expose per-node deleteability in the accounts listing (accounts and implicit groups) and add a path-scoped tombstone delete endpoint mirroring `set-hidden`, so the chart-of-accounts UI (kata `gm9d`, blocked by this issue) can render delete quick actions disabled with an explanatory tooltip and delete whole groups.

## Plan Context

- Ground truth: `docs/architecture.md` (read first), `api/openapi.yaml` (API contracts), `docs/business-requirements.md` (product scope). API-only scope — no frontend behavior changes beyond regenerated client code.
- Current state (line numbers as of this plan's commit):
  - Delete guard: `internal/services/accounts/accounts.go` `Delete` (`:491-523`) rejects with 409 when `ActiveUsage.HasActiveDependents()` (`:117-127`) — usage = journal records, transaction-template records, credit-limit history, fetched per-account via `internal/store/dictionary_usage.go:14-33`. This information is service-internal; the `Account` schema (`api/openapi.yaml:2239-2291`) and `GroupState` schema (`:2308-2326`) expose nothing from which the client could compute "cannot be deleted".
  - Groups are implicit FQN prefixes (`GroupStates`, `accounts.go:292-310`, derived via `services.DeriveFQNGroupStates`); there is no group/subtree delete operation. Path-scoped mutation precedent: `POST /api/accounts/set-hidden` (`api/openapi.yaml:847-860`; service `SetHiddenByPath` `accounts.go:428-455`; store `internal/store/accounts.go:299-317`).
  - Listing endpoints used by the accounts page: `GET /api/accounts` (`listAccounts`, `api/openapi.yaml:714-...`) and `GET /api/accounts/groups` (`:826-845`, `AccountGroupStateListResponse`).
  - Single-account tombstone: store `Tombstone` (`internal/store/accounts.go:319-342`), no cascade.
- Design decisions:
  - `Account` gains an optional boolean `deletable`; it is populated on `listAccounts` responses (and may be omitted elsewhere — document this in the schema description). `AccountGroupState` gains a required boolean `deletable`; category and tag `GroupState` responses keep their prior shape.
  - An account is deletable iff it has no active dependents (same predicate as the existing `Delete` guard). A group is deletable iff every active account in its subtree is deletable — including hidden accounts, regardless of the listing's include-hidden flag (a hidden undeletable account still blocks subtree deletion).
  - Deleteability must be computed with batched queries (e.g. one query per usage source, or one union query, yielding the set of account ids with active dependents) — never a per-row usage lookup.
  - New endpoint `POST /api/accounts/delete-by-path` (`deleteAccountsByPath`) mirroring `set-hidden`'s shape: body `{path_fqn}`; tombstones every active account at or under the path in one transaction; 404 when no active accounts exist at the path; 409 with the standard machine-readable error when any account in scope has active dependents (all-or-nothing — no partial deletes); success returns the affected count like `set-hidden` does.
  - Existing single-account `deleteAccount` behavior is unchanged.
- Regenerate all generated code through the owning `just` recipes (OpenAPI server/client generation, frontend client); never hand-edit generated files.
- Update package docs only where implicit contracts change (per `docs/package_doc_template.md` rules); update `PROJECT_STATE.md` API capability notes if it tracks the accounts API surface.

## Tasks

### Task/Commit 1: Batched deleteability in the accounts listing

Adds the batched active-usage computation and exposes `deletable` on listed accounts and group states. After this commit the UI can know, from the listing alone, which nodes can be deleted.

- [x] Store: add a batched query (in `internal/store/dictionary_usage.go` or alongside) returning the set of active account ids that have active dependents (journal records, transaction-template records, credit-limit history) — one pass, no per-account queries; cover behavior through supported app-tests.
- [x] Service: populate per-account deleteability in the accounts listing path and group deleteability in `GroupStates` (all active subtree accounts deletable, hidden included). Keep the predicate shared with `Delete`'s guard so the flag can never disagree with actual delete behavior.
- [x] API: extend `Account` (optional `deletable`, description stating it is populated in listing responses) and account group responses (required `deletable`) in `api/openapi.yaml`; regenerate server and frontend clients via the `just` recipes; wire the handler mapping in `internal/httpapi`.
- [x] Tests: integration coverage asserting `listAccounts` and `/api/accounts/groups` report `deletable` correctly for a deletable leaf, an undeletable leaf (has records), a fully deletable group, and a group blocked by one undeletable (including hidden) descendant.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 2: Path-scoped tombstone delete endpoint

Adds `deleteAccountsByPath` mirroring `set-hidden`, so a fully deletable group can be deleted in one call.

- [x] Store: path-scoped tombstone (all active accounts at/under a path) executed in one transaction, mirroring `SetHiddenByPath`'s path matching (exact leaf or prefix).
- [x] Service: `DeleteByPath` — resolve active accounts in scope; 404 (not found) when none; reuse the batched dependents check and reject with the standard conflict error when any account in scope has active dependents; otherwise tombstone all and return the affected count. All-or-nothing.
- [x] API: add `POST /api/accounts/delete-by-path` to `api/openapi.yaml` with request/response shapes mirroring `set-hidden` (plus 404/409 responses); regenerate clients; thin handler in `internal/httpapi`.
- [x] Tests: integration coverage for success (count + accounts actually tombstoned, groups disappear from listings), 409 (subtree contains an account with records; nothing tombstoned), and 404 (no active accounts at path).
- [x] Update package docs where this changes implicit contracts (e.g. accounts service doc if one exists); update `PROJECT_STATE.md` if it tracks the accounts API surface.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes (regenerated frontend client is embedded in the UI build)
- [x] Commit final changes
- [x] Run `just review-loop "Accounts API (kata jrdt): expose deleteability in the accounts listing (optional Account.deletable populated by listAccounts; required AccountGroupState.deletable = all active subtree accounts deletable, hidden included) computed via batched usage queries; new POST /api/accounts/delete-by-path mirroring set-hidden with all-or-nothing tombstone, 404 when nothing in scope, 409 on active dependents. Constraints: API-only; predicate shared with the existing Delete guard; no per-row usage queries; generated code only via just recipes; single-account delete unchanged."`
- [x] Move this plan to `docs/plans/completed/`
