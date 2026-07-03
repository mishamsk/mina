# Plan: Guard Dictionary Deletes For Active References arrf

Add service-owned delete guards so account, category, tag, and household-member delete commands cannot tombstone dictionary rows that are still referenced by active resources. Blocked deletes return the existing `409 conflict` API error. Cascade tombstone APIs are out of scope and tracked separately by Kata `xw0x`.

## Plan Context

- Kata `arrf` owns blocked dictionary deletes after `088t` moved write-time reference validation into service-owned dictionary APIs.
- Store code reports active dependency facts only; services own the blocked-delete decision and public error mapping.
- Active dependents are active journal records, active transaction template record defaults, and active credit-limit history for account deletes.
- This plan intentionally allows Tasks 1 and 2 to commit a temporary red state. The only accepted failures are the new blocked-delete app tests failing for the expected pre-implementation reason. Task 3 must restore green validation.
- Guarding deletes must not become an RDBMS-style foreign-key engine. If in-process concurrency can let cached reference validation race with a delete, add a small explicit runtime-wired reference-integrity guard that serializes dictionary delete checks with dependent writes.

## Tasks

### Task/Commit 1: Add API Contract And Red App Tests

This commit defines the desired REST behavior before implementation. The API contract exposes typed `409 conflict` responses for dictionary deletes, and app tests assert that unsafe deletes are blocked and leave referenced dictionary rows active. This commit is expected to make `just test` partially fail until Task 3.

- [x] Add `409 Conflict` responses to account, category, tag, and member delete operations in `api/openapi.yaml`.
- [x] Regenerate generated REST artifacts with `just openapi`.
- [x] Regenerate generated frontend REST artifacts with `just frontend-openapi` if the OpenAPI change affects frontend generated output.
- [x] Add REST-boundary app tests under `internal/apptest/runtime` for deleting an account referenced by an active journal record.
- [x] Add REST-boundary app tests for deleting an account referenced by active credit-limit history.
- [x] Add REST-boundary app tests for deleting an account referenced by an active transaction template record.
- [x] Add REST-boundary app tests for deleting a category referenced by an active journal record and by an active transaction template record.
- [x] Add REST-boundary app tests for deleting a tag referenced by an active journal record and by an active transaction template record.
- [x] Add REST-boundary app tests for deleting a member referenced by an active journal record and by an active transaction template record.
- [x] Assert blocked deletes return typed `409 conflict` responses with stable resource-specific messages.
- [x] Assert the referenced dictionary row remains active after each blocked delete.
- [x] Verification
  - [x] `just test` runs and fails only because the new blocked-delete tests still observe the current pre-implementation behavior.
  - [x] `just pre-commit` may fail only because the intentionally red tests fail.
  - [x] Update progress in Kata `arrf`, noting that the red tests are intentionally committed.
  - [x] Commit changes and document the expected failing-test state in the commit message.

### Task/Commit 2: Add Dictionary Usage APIs

This commit adds the reusable dependency-usage path while keeping delete behavior unchanged. Dictionary services expose narrow usage APIs for a given ID, and store code answers factual active-usage queries. The existing red tests are still expected to fail after this task.

- [x] Define small service-owned active usage summary types for dictionary resources.
- [x] Add account, category, tag, and member service APIs that report whether a given ID is used by active dependents.
- [x] Add repository contracts required by those service APIs.
- [x] Implement store usage queries for account references in active journal records, active transaction template records, and active credit-limit history.
- [x] Implement store usage queries for category references in active journal records and active transaction template records.
- [x] Implement store usage queries for tag references in active journal-record `tag_ids` arrays and transaction-template-record `tag_ids` arrays using DuckDB array predicates, not string matching.
- [x] Implement store usage queries for member references in active journal records and active transaction template records.
- [x] If needed for correctness with cached reference validation, add a small explicit reference-integrity guard that can be shared by dictionary deletes and dependent writes.
- [x] Keep account, category, tag, and member delete methods behaviorally unchanged in this task.
- [x] Verification
  - [x] `just test` is expected to partially fail only because Task 1's red delete-protection tests still fail.
  - [x] `just pre-commit` may fail only because the intentionally red tests fail.
  - [x] Update progress in Kata `arrf`.
  - [x] Commit changes and document the expected failing-test state in the commit message.

### Task/Commit 3: Wire Delete Guards Into Dictionary Tombstones

This commit turns the red tests green. Dictionary delete flows check active dependency usage before tombstoning and return `409 conflict` when the target is still used. Unreferenced dictionary deletes keep their current tombstone behavior.

- [x] Update account, category, tag, and member `Delete` methods to preserve positive-ID validation.
- [x] Preserve `404 not_found` for missing or already tombstoned delete targets.
- [x] Check active dependency usage before tombstoning active targets.
- [x] Return `services.Conflict(...)` for blocked deletes with stable messages such as `account is referenced by active resources`.
- [x] Invalidate dictionary reference caches only after successful tombstone operations.
- [x] If a reference-integrity guard was added in Task 2, use it so dictionary delete checks, tombstones, cache invalidation, and dependent writes cannot interleave into a broken active-reference state.
- [x] Ensure tombstoned dependents do not block deletes:
  - [x] Tombstoned transactions and journal records do not block.
  - [x] Tombstoned transaction templates and template records do not block.
  - [x] Tombstoned credit-limit history does not block account deletes.
- [x] Update runtime composition for new usage repositories or reference-integrity guard dependencies.
- [x] Verification
  - [x] `just test` passes.
  - [x] `just pre-commit` passes.
  - [x] Update progress in Kata `arrf`.
  - [x] Commit changes.

### Task/Commit 4: Update Docs, Kata, And Final Validation

This task records the new ownership and behavior contract after implementation is green. It should not introduce new behavior.

- [x] Update affected package docs only where implicit contracts changed:
  - [x] Dictionary services own blocked-delete decisions.
  - [x] Store usage queries report active dependency facts only.
  - [x] Cascade deletes are deferred to Kata `xw0x`.
- [x] Update Kata `arrf` with implementation evidence and mention related follow-up `xw0x`.
- [x] Verification
  - [x] `just test` passes.
  - [x] `just test-integration` passes because JSON-over-HTTP delete behavior changed.
  - [x] `just pre-commit` passes.
  - [x] Commit changes.
  - [x] Run `just review-loop "arrf blocked dictionary deletes; service-owned delete guards; store only reports active dependency usage; cascade APIs deferred to xw0x"`.

## Final Verification

- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just pre-commit` passes.
- [x] Commit final changes.
- [x] Run `just review-loop "arrf blocked dictionary deletes; service-owned delete guards; store only reports active dependency usage; cascade APIs deferred to xw0x"`.
- [x] Move this plan to `docs/plans/completed/`.
- [x] Close Kata `arrf` after the plan is moved to completed.
