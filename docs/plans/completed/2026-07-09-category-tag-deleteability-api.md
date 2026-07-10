# Plan: Expose category and tag deleteability in list APIs (`cdd0`)

Add optional per-entity `deletable` capabilities to category and tag list responses so frontend consumers can render proactive delete affordances. Keep eligibility service-owned, backed by typed batched active-usage results shared with the existing DELETE guards.

## Plan Context

- Scope is the existing category/tag entity list contracts only; do not add group deleteability, delete-by-path behavior, endpoints, migrations, or frontend UI changes.
- Mirror the corrected Account implementation with `map[int64]categories.ActiveUsage` and `map[int64]tags.ActiveUsage`; never use untyped ID sets or per-row usage queries.
- `HasActiveDependents` remains the sole eligibility predicate for both proactive capability values and authoritative DELETE conflict behavior; HTTP only maps service results.
- List responses populate `deletable` for active and explicitly included tombstoned entities; tombstoned entities are always false. Non-list create/get/update responses may omit the optional value, matching Account and Member behavior.
- Follow `docs/TESTING.md`: app behavior is covered through the generated REST client, with no unit tests or direct service/store assertions.
- Kata issue: `cdd0`; this API-only task enables frontend issue `60tx`.

## Tasks

### Task/Commit 1: Add typed batched category and tag deleteability

Batch active usage by entity ID for category and tag repositories, use those typed results in both list decoration and single-entity delete guards, then expose the service-owned values through the existing REST schemas and generated clients.

- [x] Add optional `Deletable` values to category and tag service models and populate them in `Service.List` by collecting active IDs and performing one batched usage lookup per entity type.
- [x] Replace each singular repository `ActiveUsage` contract with a typed IDs-to-usage map, including empty-input fast paths; adapt the public single-entity usage use cases and DELETE guards through the same map without duplicating predicates.
- [x] Implement bounded, parameterized store queries that map active journal, transaction-template, and recurring-definition usage sources into the existing typed `categories.ActiveUsage` and `tags.ActiveUsage` structs; tag array membership must return usage for each requested tag ID.
- [x] Preserve row close/error handling conventions and ensure missing map entries mean zero active usage.
- [x] Map `Deletable` in category/tag HTTP DTO conversion without computing eligibility in transport code.
- [x] Add optional `deletable` properties to the Category and Tag OpenAPI schemas, documented as list-response-only capabilities; do not change shared `GroupState`.
- [x] Regenerate Go server/client and frontend TypeScript clients through `just openapi` and `just frontend-openapi`; never hand-edit generated output.
- [x] Add app-boundary generated-client coverage for active clear, active dependent, and explicitly included tombstoned categories and tags; cover journal, template, and recurring dependency sources across the scenarios and retain authoritative DELETE conflict coverage.
- [x] Update `internal/services/categories/PACKAGE.md` and `internal/services/tags/PACKAGE.md` with the service-owned list capability contract.
- [x] Update `PROJECT_STATE.md` concisely to include category and tag delete eligibility among implemented API behavior.
- [x] Add Kata `cdd0` progress and verification evidence.
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
- [x] Run `just review-loop "Expose category and tag list deleteability; typed batched usage must be shared with DELETE guards; no group or delete-by-path surface"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `cdd0` only after the plan is moved to completed
