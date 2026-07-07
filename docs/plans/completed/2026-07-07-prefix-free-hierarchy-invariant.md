# Plan: Enforce prefix-free hierarchy invariant on FQN write paths (Kata 5w9q)

Enforce the prefix-free hierarchy rule from `docs/hierarchy-semantics.md` on all FQN write paths (create for accounts, categories, tags, templates; template Replace fqn change) and extend `mina db validate` with hierarchy checks. Restructure endpoints are separate work (Kata mrs9, blocked by this).

## Plan Context

- Prefix-free rule: among active rows of one entity type, no FQN may be a segment-boundary path prefix of another (`Food` prefixes `Food:Dining`, not `Foodie`). Case-sensitive; tombstoned rows exempt. Owning doc: `docs/hierarchy-semantics.md`.
- Decisions: write-path rejections return 409 conflict (same as duplicate-FQN today); `db validate` prefix-free findings are Error severity; budget dangling check becomes prefix-aware and stays Warning.
- Enforcement is service-owned, under `SerializeReferenceOperation` (no DB constraint can back prefix checks, so the check-then-write must serialize; dictionary deletes already use the mutex this way).
- Conflict predicate is one shared pure helper in `internal/services/fqn.go`. Accounts/categories/tags check against their `refcache.Dictionary` snapshot (FQN added to cached reference state; loader already reads full rows). Templates have no refcache (nothing references them) and list active FQNs through the repo under the mutex.
- Store-level exact-FQN prechecks are removed as redundant (`docs/architecture.md`: services validate before writes; no store prechecks). Active-FQN unique indexes and their conflict error mapping stay as schema constraints.

## Tasks

### Task/Commit 1: Prefix-free enforcement for accounts, categories, tags

Adds the shared conflict helper and service-level enforcement for the three dictionary entities, removes the now-redundant store prechecks, and sweeps fixtures that build mixed nodes. After this task, mixed leaf/group rows can no longer be created for accounts, categories, or tags.

- [x] Add a shared path-prefix conflict helper to `internal/services/fqn.go` (candidate equals, extends, or is a path prefix of an existing FQN)
- [x] Add FQN to the cached reference state in the accounts, categories, and tags services
- [x] Wrap account, category, and tag `Create` in `SerializeReferenceOperation`; check the candidate against active cache entries; reject with 409 conflict and an entity-specific message
- [x] Remove store-level exact-FQN precheck helpers subsumed by the service check; keep unique-index conflict error mapping
- [x] Update `api/openapi.yaml` 409 descriptions on the three create operations to cover hierarchy conflicts; regenerate generated code
- [x] Sweep app-test fixtures that create mixed nodes (at least `TestRecordSearchAccountFQNPrefixBoundary`: `banks:Chase` row plus descendants); run the suite to find the rest
- [x] Add app-tests per entity: create rejected with 409 when the new FQN extends an active leaf and when it path-prefixes an active row; exact-duplicate conflict behavior unchanged
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata 5w9q
  - [x] Commit changes

### Task/Commit 2: Prefix-free enforcement for transaction templates

Applies the same rule to template create and Replace fqn changes under the mutex both already hold. Replace excludes the template's own ID so pure record replacement with an unchanged FQN is unaffected.

- [x] Check the candidate FQN in template `Create` and `Replace` against active template FQNs listed through the repo, using the shared helper; Replace excludes its own template ID; reject with 409 conflict
- [x] Remove template store FQN prechecks (create existence check, Replace uniqueness-for-other-id); keep active verification and unique-index error mapping
- [x] Update `api/openapi.yaml` 409 descriptions on template create/replace; regenerate generated code
- [x] Sweep template app-test fixtures for mixed nodes
- [x] Add app-tests: template create conflict; Replace renaming onto a conflicting path rejected; Replace with unchanged FQN still replaces records
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata 5w9q
  - [x] Commit changes

### Task/Commit 3: `mina db validate` hierarchy checks

Extends the pre-trust diagnostic so stored data violating the hierarchy rules is reported: prefix-free violations as errors, dangling budget group references as warnings.

- [x] Add an Error-severity finding per entity table for pairs of active FQNs where one is a path prefix of the other
- [x] Make the `budget.category_fqn` dangling check prefix-aware (valid while at least one active category exists at or under the path); keep Warning severity
- [x] Note the severity split in `docs/hierarchy-semantics.md` (prefix-free violations report as errors; dangling budget references as warnings)
- [x] Extend db-validate test coverage for both findings following its established test pattern
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata 5w9q
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Enforce prefix-free hierarchy invariant per docs/hierarchy-semantics.md; decisions: service-level validation under SerializeReferenceOperation, no store prechecks; 409 conflict on write paths; db validate prefix-free findings Error, budget dangling prefix-aware Warning"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata 5w9q with evidence
