# Plan: Batch member delete-eligibility usage lookup (`hafw` fix 1)

Remove the N+1 database query path introduced by member list deleteability while preserving the reviewed API contract and deletion semantics.

## Plan Context

- Operator review finding: `internal/services/members/members.go:243` calls the singular repository usage lookup for every active member; `internal/store/dictionary_usage.go:148` performs three queries per call. With the OpenAPI page limit of 500, one list can execute 1,500 eligibility queries.
- Follow the established batched account pattern in `internal/services/accounts/accounts.go:523` and `internal/store/dictionary_usage.go:14`; keep `ActiveUsage.HasActiveDependents` as the single eligibility predicate.
- Protect — do not regress: active demo members with dependencies return `deletable: false`; a new unused member returns `deletable: true`; explicitly included tombstoned members return `deletable: false`; DELETE still returns conflict for every active dependency type; OpenAPI and generated clients remain unchanged from the completed implementation.
- Scope exclusions: no endpoint or schema changes, no frontend UI changes, no migrations, no new eligibility rules, and no ground-truth documentation changes.
- Follow `docs/TESTING.md`; do not add unit tests or tests below the app boundary.
- Do not run review-loop.
- Kata issue: `hafw`.

## Tasks

### Task/Commit 1: Batch member active-usage reads

Change the member repository usage boundary to accept a set of member IDs and return usage keyed by ID, then use one batched lookup for list decoration. Adapt single-member service and delete callers through that same boundary so the existing dependency rule and conflict behavior remain authoritative.

- [x] Replace the singular member repository `ActiveUsage` contract with a batched IDs-to-usage map contract analogous to accounts, including an empty-input fast path.
- [x] Implement the store lookup as one bounded query over active journal, template, and recurring-definition records; use parameter binding and explicit source mapping, and preserve row close/error handling conventions.
- [x] Update member service list decoration to collect active IDs once, perform one repository call, and derive every result with `HasActiveDependents`; keep tombstoned results non-deletable without querying them.
- [x] Adapt the public single-member `ActiveUsage` use case and DELETE guard to the batched repository result without duplicating dependency predicates.
- [x] Keep existing app-boundary deleteability and delete-conflict coverage green; add app-boundary coverage only if needed to protect a missing observable dependency case.
- [x] Update package docs only if the implicit contract changes materially beyond the already documented service ownership.
- [x] Add Kata `hafw` progress and verification evidence for the performance fix.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Do not run review-loop.
- [x] Move this plan to `docs/plans/completed/`
