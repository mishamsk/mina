# Phase 1 Stage 1 REST API Implementation

## Plan Context

Stage 1 builds the Go REST API only. The repository has a Go module, repeatable developer recipes, package placeholders, and a minimal runnable CLI. Continue by adding model-owned API/store/controller/router slices with boundary scenario tests. Keep transactions last because balanced journal records depend on accounts, members, categories, tags, statuses, and database transaction support.

## Tasks

### Commit 1: Bootstrap Go module and developer recipes
- [x] Create the Go module with the module path chosen for this repository.
- [x] Add the initial package layout for models, store, controllers, routers, app composition, and CLI entrypoint without implementing domain behavior.
- [x] Add a minimal `cmd/mina` command that can print version/help and exit successfully.
- [x] Add `Justfile` recipes as the sole developer entrypoints: `fmt`, `test`, `test-boundary`, `pre-commit`, and placeholders for later `test-cli`, `test-rest`, and `smoke`.
- [x] Pin the minimum Go version and document any required local tools in the recipe comments.
- [x] Update `PROJECT_STATE.md` with the new module, package inventory, and available recipes.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 2: Add linting, hooks, and generated-contract scaffolding
- [x] Add `prek` configuration and wire `just pre-commit` to run it when hooks exist.
- [x] Add Go linting through a pinned tool path owned by `just`, likely `golangci-lint`.
- [x] Add OpenAPI generation dependencies and a `just openapi` recipe, choosing one generator path before handlers are built.
- [x] Add `testscript` dependency and a small CLI smoke test using the minimal command from commit 1.
- [x] Add a generated-files policy for OpenAPI output and ensure generated artifacts are deterministic.
- [x] Update `PROJECT_STATE.md` with the toolchain and recipe inventory.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 3: Add app composition, database open, and migrations
- [ ] Choose and add the local database driver dependency for a portable single-file database.
- [ ] Add app composition that wires config, database open/create/migrate policy, controllers, and routers.
- [ ] Add versioned upgrade-only migrations and a schema-version table.
- [ ] Add store helpers for connection use, transaction boundaries, migration application, and temporary test databases.
- [ ] Add stable machine-readable API error response models and HTTP error mapping.
- [ ] Add boundary test harness helpers that send typed requests through the in-process app.
- [ ] Update `PROJECT_STATE.md` with database and app composition behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 4: Add category CRUD API
- [ ] Add category model, validation, store operations, controller, router, and OpenAPI contract.
- [ ] Implement create, get, list, update hidden state, and tombstone delete behavior.
- [ ] Derive or expose category `parent_fqn`, `name`, and `level` from colon-separated `fqn`.
- [ ] Exclude hidden and tombstoned categories from default list responses unless explicitly requested.
- [ ] Add boundary tests covering create/read/list/update/delete, hidden filtering, duplicate active `fqn`, and hierarchy-derived fields.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with category behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 5: Add tag CRUD API
- [ ] Add tag model, validation, store operations, controller, router, and OpenAPI contract.
- [ ] Implement create, get, list, update hidden state, and tombstone delete behavior.
- [ ] Derive or expose tag `parent_fqn`, `name`, and `level` from colon-separated `fqn`.
- [ ] Exclude hidden and tombstoned tags from default list responses unless explicitly requested.
- [ ] Add boundary tests covering create/read/list/update/delete, hidden filtering, duplicate active `fqn`, and hierarchy-derived fields.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with tag behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 6: Add household member CRUD API
- [ ] Add member model, validation, store operations, controller, router, and OpenAPI contract.
- [ ] Implement create, get, list, update name if supported by the chosen API contract, and tombstone delete behavior.
- [ ] Keep members available for transaction record attribution and exclude tombstoned members from default list responses.
- [ ] Add boundary tests covering create/read/list/update/delete, duplicate or blank names per chosen validation, and tombstone behavior.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with member behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 7: Add account CRUD API
- [ ] Add account model, validation, store operations, controller, router, and OpenAPI contract.
- [ ] Implement create, get, list, update hidden state and external identifiers, and tombstone delete behavior.
- [ ] Derive or expose account `kind`, `parent_fqn`, `name`, and `level` from colon-separated `fqn`.
- [ ] Validate currency and external identifier fields without requiring local config to interpret the database.
- [ ] Exclude hidden and tombstoned accounts from default list responses unless explicitly requested.
- [ ] Add boundary tests covering create/read/list/update/delete, hidden filtering, duplicate active `fqn`, hierarchy-derived fields, and currency validation.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with account behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 8: Add credit limit history API
- [ ] Add credit limit history model, validation, store operations, controller, router, and OpenAPI contract.
- [ ] Implement create, get, list by account, and tombstone delete behavior.
- [ ] Validate referenced accounts, effective dates, and non-negative credit limits.
- [ ] Preserve history instead of overwriting earlier limits.
- [ ] Add boundary tests covering account linkage, duplicate account/effective-date conflicts, tombstone behavior, and list ordering.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with credit limit behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 9: Add exchange rate CRUD API
- [ ] Add exchange rate model, validation, store operations, controller, router, and OpenAPI contract.
- [ ] Implement create, get, list/filter by currency pair and effective date, update if supported by the chosen API contract, and tombstone delete behavior.
- [ ] Validate currency codes, positive rates, and effective dates.
- [ ] Add boundary tests covering create/read/list/update/delete, duplicate active currency-pair/date conflicts, and filter allowlists.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with exchange rate behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 10: Add shared list, filter, sort, and pagination contracts
- [ ] Add typed allowlists for filter fields, sort keys, and sort directions used by Stage 1 list endpoints.
- [ ] Add shared request parsing and validation for pagination and include-hidden/include-tombstoned options.
- [ ] Ensure all dynamic SQL identifiers are selected from typed allowlists and all values use parameter binding.
- [ ] Add boundary tests for unsupported filters, unsupported sort keys, default hidden exclusion, and deterministic pagination.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with shared list/query behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 11: Add transaction and journal record create/read API
- [ ] Add transaction, journal record, posting status, reconciliation status, and source models.
- [ ] Add transaction store operations that persist transaction metadata and journal records atomically.
- [ ] Add controller validation for referenced accounts, members, categories, tags, dates, statuses, source, currency, amount, and amount USD.
- [ ] Enforce double-entry balance before writing records.
- [ ] Implement create transaction, get transaction with records, and list transactions with nested records.
- [ ] Add boundary tests covering a balanced manual transaction, imbalance rejection, missing references, status validation, and persisted read-after-write behavior.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with transaction create/read behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 12: Add transaction update, delete, and record search API
- [ ] Implement full historical transaction replacement or patch semantics, choosing one stable contract and documenting it in API docs.
- [ ] Ensure transaction updates run atomically and re-check double-entry balance.
- [ ] Implement transaction tombstone delete behavior.
- [ ] Add record search/filter endpoints for amount ranges, date ranges, memo text, account, category, tags, member, posting status, and reconciliation status.
- [ ] Add account-record view behavior that returns matching records while preserving containing transaction identity.
- [ ] Add boundary tests covering update balance checks, delete/tombstone behavior, each supported record filter, combined filters, and SQL allowlist rejection.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with transaction update/delete/search behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 13: Add Stage 1 bulk operations
- [ ] Add bulk categorization for selected records.
- [ ] Add bulk tagging and untagging for selected records.
- [ ] Add bulk account reassignment for selected records.
- [ ] Add bulk posting/reconciliation status updates.
- [ ] Ensure each bulk operation runs in a database transaction and validates every referenced row before writing.
- [ ] Add boundary tests for all-or-nothing behavior, empty selections, missing references, and read-after-write through record search.
- [ ] Regenerate OpenAPI artifacts.
- [ ] Update `PROJECT_STATE.md` with bulk operation behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 14: Finish Stage 1 CLI server and process-level REST tests
- [ ] Add CLI flags for explicit database path, host, port, and migration/open behavior.
- [ ] Start the REST API server through app composition with no hidden global database, config, clock, or listener state.
- [ ] Add process-level CLI tests for help, bad flags, database creation/opening, and server startup failure cases.
- [ ] Add process-level REST smoke tests for real JSON request/response behavior against a temporary database.
- [ ] Add `just test-cli`, `just test-rest`, and `just smoke` recipes if they were placeholders.
- [ ] Regenerate OpenAPI artifacts and verify generated contract is current.
- [ ] Update `PROJECT_STATE.md` with the completed Stage 1 operator-visible workflow.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

## Deferred Verification

- [ ] `just test-cli` passes when relevant
- [ ] `just test-rest` passes when relevant
- [ ] `just smoke` passes for release or risky changes

## Final Verification

- [ ] `just test-boundary` passes
- [ ] `just test` passes
- [ ] `just pre-commit` passes
- [ ] Deferred verification completed or explicitly marked not relevant
