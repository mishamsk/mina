# Plan: Restore compatibility review and generate the accounting schema (Kata a9m9)

## Goal

Establish Mina's supported-compatibility boundary, restore compatibility review for application changes, and replace the hand-maintained data-model document with a deterministic DDL artifact generated from a pristine migrated in-memory database. Serve that checked-in artifact through one read-only OpenAPI operation so REST, CLI, and MCP consumers inspect the same current target schema without touching a user database or introspecting live state.

## Constraints

- Database compatibility is forward-only: current Mina upgrades outdated accounting schemas through versioned migrations rather than operating against them, every persisted-state change must provide an upgrade migration when needed, and downgrades or old-binary compatibility are unsupported. Across forward upgrades, protect existing supported users, persisted accounting data, and REST, CLI, MCP, configuration, backup, file, and serialized-state contracts; arbitrary historical pre-release commits are not compatibility baselines.
- Treat a breaking transition as a break-glass exception requiring an explicit release decision. If it cannot preserve all data, publish a concrete data-transfer procedure and identify the expected loss before release.
- Versioned migrations remain the only accounting-database creation and upgrade path. The generated DDL is inspection output only and must never initialize, migrate, validate, or repair a database.
- Generate from a pristine in-memory DuckDB accounting schema through Mina's real migration path. Do not read, mutate, attach, or require a user accounting database, and do not include app-local runtime-schema objects or data in the artifact.
- Serve only the checked-in generated artifact embedded in the Mina binary as a build-time asset. The REST request must not inspect the running database catalog, vary with the configured database/schema, or expose household data.
- Run compatibility review only for backend application changes. The web UI remains a REST client whose browser-local UI state has no compatibility or survival guarantee; its protected compatibility boundary is the backend REST contract.
- Keep governing, architecture, semantic, API, package, and generated-file documentation concise and evergreen. Preserve every `docs/data-model.md` reference in `docs/plans/`; remove the document and its references only from active project documentation.
- Keep repository tooling under `internal/tools` out of product imports and do not add tests under `internal/tools/**`.

## Success Criteria

- [ ] A concise compatibility policy defines the forward upgrade contract, immutable upgrade-only migration history, ownership of compatibility transitions, unsupported outdated-schema/downgrade behavior, non-breaking surfaces enforced for existing users, and the exceptional approval and user guidance required for a lossy break-glass transition without treating arbitrary pre-policy commits as supported baselines.
- [ ] `docs/agents/review/reviewer-prompts/compatibility.md` is loaded, the review-loop's stable backend-application reviewer selection includes it, backend application paths—including `internal/store/migrations/*.sql` and other persisted-state code—select compatibility review, and frontend-only changes do not.
- [ ] A checked-in full DDL artifact deterministically represents the pristine current accounting schema, including its schema-scoped types, sequences, tables, constraints, indexes, comments, and migration metadata while excluding runtime state and data.
- [ ] A dedicated Justfile regeneration recipe and freshness-check recipe reproduce the artifact byte-for-byte. The check's measured runtime determines whether it joins pre-commit, and `docs/generated-files.md` records the resulting exact developer workflow.
- [ ] One protected, read-only OpenAPI operation returns the static generated DDL through generated REST, CLI, and MCP surfaces; its contract makes clear that this is the current target model and not the opened database's live schema or an initialization path.
- [ ] `docs/data-model.md` is deleted, active project documentation contains no reference to it, archived plans retain all historical references unchanged, and schema detail points to migrations plus the generated artifact without duplicating DDL in prose.
- [ ] App and process-boundary coverage proves the REST response is static and retrievable through REST, generated CLI, and generated MCP behavior without coupling assertions to individual schema objects.
- [ ] `just accounting-schema-check`, `just openapi-check`, `just frontend-openapi-check`, `just pre-commit`, `just test`, and `just test-integration` pass.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-11-a9m9-compatibility-schema.md"` once, confirm its selected-reviewer output includes `compatibility`, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Close Kata issue `a9m9` with the commits and validation evidence.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Establish and enforce the supported compatibility contract

Create a short owning compatibility/release-upgrade policy under `docs/` and align `VISION.md`, `SCOPE.md`, `docs/architecture.md`, `docs/frontend-architecture.md`, `docs/cli-mcp-architecture.md`, `docs/TESTING.md`, `internal/store/PACKAGE.md`, and the relevant review-loop docs/prompts with it. Product and scope docs should state only the durable forward-upgrade guarantee; architecture/store docs should make already-supported migrations immutable and require every future persisted-state change to supply an upgrade migration when needed; frontend architecture should identify REST as the UI's compatibility boundary and leave browser-local UI state outside the guarantee; testing guidance should require supported-source upgrade and data-preservation evidence when migrations change; CLI/MCP documentation should treat exposed generated names and behavior as supported contracts. Remove conflicting evergreen-era instructions instead of recording the transition history, and leave audited documents unchanged where the owning policy already agrees.

- [ ] Rename `compatibility.md.disabled` to `compatibility.md`, replace its duplicate/stale text with the active supported-user policy, and restore `compatibility` to `appCodeReviewers` and `stableReviewerOrder` in `internal/tools/reviewloop/main.go` without adding a separate selector path or redundant review layer; keep frontend-only changes on the dedicated frontend reviewer path.
- [ ] The governing-doc audit clearly assigns current contracts to evergreen docs and compatibility evolution to immutable versioned migrations, migration validation, the current release/upgrade policy, and compatibility review.
- [ ] Commit as `chore(compatibility): restore supported-contract review`.

### Task 2: Generate and freshness-check the target accounting DDL

Add a focused repository tool at `internal/tools/accountingschema` that opens a pristine process-local DuckDB database with the existing `store` APIs, migrates the canonical in-memory accounting location, extracts only that accounting schema's DDL, and writes a stable artifact at `internal/services/accountingschema/schema.sql`. Canonically order and format every supported object class and strip volatile catalog output so identical migrations produce identical bytes; include the current migration version without timestamps or machine-specific paths. Add the minimal service package accessor needed to embed the generated file for later transport use, with documented exported cross-package APIs and a `PACKAGE.md` maintained through the `write-package-docs` skill.

- [ ] Add `just accounting-schema` and non-mutating `just accounting-schema-check` recipes. Regeneration followed by the check leaves the worktree unchanged, and a deliberate stale artifact makes the check fail with regeneration guidance.
- [ ] Measure the freshness check after tool/build caches are warm. Add a file-scoped pre-commit hook only if the measured cost is suitable for routine commits; otherwise keep it as an explicit migration/schema workflow check. Record the chosen workflow and artifact ownership in `docs/generated-files.md`.
- [ ] Manual tool smoke checks and repository checks provide validation; do not add test code under `internal/tools/**` or expose schema generation as product behavior.
- [ ] Commit as `chore(schema): generate current accounting DDL`.

### Task 3: Expose the static schema through generated client surfaces

Add protected `GET /api/accounting-schema` with operation ID `getAccountingSchema` to `api/openapi.yaml`, returning a JSON response whose DDL field is the embedded generated artifact. Wire the narrow accounting-schema service through runtime composition and `internal/httpapi`; the handler must not depend on the opened `AppDB`. Add explicit read-only exposure decisions in `api/client-surfaces.yaml` for `mina client schema get` and an MCP `schema_get` tool, then regenerate Go server/client code, CLI/MCP catalogs, and the frontend OpenAPI client through repository-owned recipes.

- [ ] Use the `write-package-docs` skill for every touched backend or frontend package and update only package contracts affected by static artifact ownership, composition, or transport mapping.
- [ ] Add an app-boundary REST scenario that proves the response is non-empty and unchanged by accounting mutations without asserting individual tables or columns. Extend process integration coverage to retrieve it through real REST, generated CLI, and generated MCP paths, including normal authentication behavior where applicable.
- [ ] Update `PROJECT_STATE.md` with the user-visible schema inspection capability; do not claim that it represents a live configured database or a supported alternative migration path.
- [ ] Commit as `feat(api): expose the target accounting schema`.

### Task 4: Retire the evergreen manual data model

Delete `docs/data-model.md` after the generated artifact and inspection operation exist. Replace its active references in `docs/architecture.md`, `docs/hierarchy-semantics.md`, and `docs/recurring-transactions-semantics.md` with narrow ownership statements or links to migrations, the generated artifact workflow, and the relevant semantic owner; do not transplant table DDL or historical narration into another evergreen Markdown document.

- [ ] An active-document search finds no `docs/data-model.md` reference, while existing files under `docs/plans/completed/` have no content changes and retain their historical references.
- [ ] Run `just prose-fmt` for the eligible evergreen Markdown changes and verify the final documentation remains concise, present-tense, and non-duplicative.
- [ ] Commit as `docs(schema): retire the manual data model`.
