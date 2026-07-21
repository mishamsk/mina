# Plan: Simplify wk80 to read-only runtime settings

Replace the branch's mutation-heavy Settings implementation with a small read-only surface that reports the configuration resolved once for the running Mina process. Preserve the settings service and HTTP boundary, config discovery/location, navigation, and manifest-driven presentation; defer runtime mutation and explicit persistence to Kata `ma8r`.

## Plan Context

- Kata `wk80` is approved and rescoped to an immutable settings viewer. Kata `ma8r` now owns in-memory mutation, safe live application, dynamic choices needed for editing, and a separate user-initiated **Save current** persistence operation.
- Data flows `appconfig startup snapshot -> settings service -> HTTP adapter -> generated frontend client -> Settings viewer`. HTTP must not import appconfig or stores.
- Configuration is loaded and resolved once at startup. The current API reports only active values, effective sources, and the resolved config-file location; it has no persisted/next value, editability, pending-restart, validation, or mutation concepts.
- Use one typed read operation returning backend-owned groups and fields. Keep only presentation metadata needed by the viewer and move it from long struct tags into a readable static metadata map whose completeness is checked during composition.
- Remove behavior that exists only for mutation: PATCH contracts, dynamic schema choices/repository, candidate validation, TOML editing, locking, private/atomic writes, symlink handling, restart state, drafts, save feedback, and mutation-specific dependencies.
- Preserve Mina's existing Arcade Cabinet visual system. The Settings page is an information-dense read surface, not a form or a redesign.
- `build/tmp_feedback.md` is a historical review artifact, not an owning contract. Review it after the read-only implementation and apply every non-mutation finding that remains relevant: lean architecture docs, narrow launched-process and Docker tests, readable metadata, black-box app tests, dependency cleanup, and correct package ownership. Record mutation/schema-option findings as inapplicable when their code is removed.
- The previous plan `docs/plans/2026-07-19-wk80-manifest-driven-settings-page.md` is superseded by this approved scope. Mark it superseded and archive it with this plan at closure so no stale active plan remains.
- At closure, run `review-loop` over the full branch using only the evergreen read-only design in this plan as its goal and constraints.

## Tasks

### Task 1: Collapse settings to an immutable service-owned read API

Remove the persistence and dynamic-option implementation while retaining config discovery, effective source tracking, a backend-owned definition, and the service boundary consumed by HTTP.

- [x] Replace presentation struct tags with a typed static metadata map and construction-time coverage checks, then expose a cached appconfig snapshot containing the resolved config path, grouped field definitions, active canonical values, and effective sources.
- [x] Reduce `internal/services/settings` to the read use case over a narrow config backend; remove the accounting-schema repository/store and ensure runtime composition resolves runtime-owned defaults once before building the snapshot.
- [x] Replace the separate manifest/state/PATCH OpenAPI surface with one typed read operation, regenerate all clients/surfaces, and keep `internal/httpapi` dependent only on settings-service types.
- [x] Remove mutation-only files and dependencies, and cover representative resolved values/sources/config location through black-box app-test REST scenarios without asserting the complete current config shape.
- [x] Update backend/API/package documentation to state only durable read boundaries and current implicit contracts.
- [x] Run `just openapi`, `just tidy`, `just pre-commit`, and `just test`.
- [x] Commit the task as `refactor: make settings API read only`.

### Task 2: Turn Settings into a focused runtime configuration viewer

Keep the Settings route, navigation, command-palette action, generic backend-driven grouping, loading, and failure behavior while removing all form and save state.

- [x] Render each server-provided group and field as an accessible Arcade Cabinet read surface showing its active value and source; dispatch formatting only on generated control kind and keep setting keys opaque.
- [x] Remove drafts, inputs, options, dirty state, save/refresh races, validation feedback, persisted values, and restart messaging from the feature and generated-client usage.
- [x] Replace exhaustive browser scenarios with focused embedded-UI coverage for navigation, backend-provided grouping/value/source rendering, and load failure/retry behavior.
- [x] Update the Settings feature package doc, `docs/webui-design.md`, and `PROJECT_STATE.md` to describe the immutable runtime viewer and keep browser-local preferences separate.
- [x] Run `just frontend-check`, `just test`, and `just test-frontend-e2e`.
- [x] Commit the task as `refactor: make settings page read only`.

### Task 3: Remove obsolete boundary coverage and audit historical feedback

Restore each test class and architecture document to its proper scope, then use the saved feedback as a final completeness audit rather than as a mutation specification.

- [x] Revert the launched-process config test expansion except the updated config-location help assertion, and remove the mutation-specific launched settings script/harness additions.
- [x] Remove Settings API behavior and persistence duplication from the Docker lifecycle test and Docker docs while retaining existing Compose config-bind/bootstrap/private-permission coverage.
- [x] Rewrite `docs/settings-architecture.md` as a short evergreen map of layers, boundaries, and high-level read contracts without concrete setting counts, fields, or endpoints.
- [x] Audit every item in `build/tmp_feedback.md`: apply all remaining non-mutation findings; confirm removed dependencies require no version action; confirm schema filtering/query findings are inapplicable because the schema-option path is gone; ensure no exact-manifest-shape app test remains.
- [x] Run `just openapi-check`, `just frontend-openapi-check`, `just pre-commit`, `just test`, `just test-integration`, `just test-frontend-e2e`, and `just test-docker`.
- [x] Commit the task as `test: trim read-only settings coverage`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] Settings has no mutation, persistence, dynamic-option, draft, or pending-restart code or contract; it reports one immutable startup snapshot with resolved sources and config location through the settings service.
- [x] `just openapi-check`, `just frontend-openapi-check`, `just pre-commit`, `just test`, `just test-integration`, `just test-frontend-e2e`, and `just test-docker` pass.
- [x] Every still-applicable non-mutation item in `build/tmp_feedback.md` is reflected in code, tests, or docs, with obsolete mutation/schema-option items absent rather than worked around.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree, run `review-loop` over the full branch against the evergreen read-only design and resolve every validated finding.
- [x] Mark the superseded mutation plan accordingly, move both plans to `docs/plans/completed/`, and commit the archive.
- [x] Close Kata `wk80` with implementation commits and validation evidence; leave expanded follow-up `ma8r` open and unblocked.
