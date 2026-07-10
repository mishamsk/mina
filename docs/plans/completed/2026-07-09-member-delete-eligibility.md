# Plan: Expose member delete eligibility through the API (`hafw`)

Add an optional `deletable` capability to Member list responses so frontend consumers can disable unsupported deletion before confirmation. Derive the value in the member service from the same active-resource usage rule that guards deletion, while preserving DELETE conflict behavior as the authoritative fallback.

## Plan Context

- Scope is the existing member contract and list flow only; do not add endpoints, migrations, or frontend UI behavior.
- Match the existing Account contract: `deletable` is populated on list responses for active and explicitly included tombstoned members, and transport code only maps the service-owned value.
- Reuse `members.ActiveUsage.HasActiveDependents` for both proactive capability derivation and delete enforcement; do not duplicate dependency rules in HTTP mapping or tests.
- Follow `docs/TESTING.md`: cover behavior at the app boundary through the generated REST client, with no unit tests or direct store/service assertions.
- Kata issue: `hafw`.

## Tasks

### Task/Commit 1: Add and verify the member deleteability contract

Extend the member domain result and list use case with service-owned deleteability, then expose it through OpenAPI and all generated clients. Cover a clear member and active dependent-resource cases without weakening the existing DELETE conflict response.

- [x] Add an optional deleteability value to the member service model and populate it during `members.Service.List` from existing active usage and tombstone state, using `HasActiveDependents` as the sole eligibility rule.
- [x] Map the service-owned value in `internal/httpapi` without re-evaluating dependency rules in the transport layer.
- [x] Extend `api/openapi.yaml` with the optional Member `deletable` field, documented as list-response capability parity with Account.
- [x] Regenerate the Go server/client and frontend TypeScript client through `just openapi` and `just frontend-openapi`; do not hand-edit generated output.
- [x] Add app-boundary coverage through the generated REST client for deletable active members, non-deletable members referenced by active resources, and tombstoned members returned through explicit inclusion; retain coverage that DELETE returns conflict for active dependents.
- [x] Update `internal/services/members/PACKAGE.md` only as needed to document the service-owned capability contract.
- [x] Update `PROJECT_STATE.md` concisely to include member delete eligibility among implemented API behavior.
- [x] Update Kata `hafw` with implementation progress and verification evidence.
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
- [x] Run `just review-loop "Expose member delete eligibility through the existing API contract; service owns eligibility via active usage; transport must not duplicate member deletion rules"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `hafw` only after the plan is moved to completed
