# Plan: Establish the OpenAPI grouping and explicit surface configuration contract

Give every OpenAPI operation exactly one durable tag, add `api/client-surfaces.yaml` with an explicit, independent CLI and MCP decision for all 85 operations, and create the `internal/tools/surfacegen` validator wired through Justfile-owned check recipes. No runtime registrations or generated invokers are produced yet; generated OpenAPI server/client behavior must remain unchanged.

## Plan Context

- Owning docs: `docs/cli-mcp-architecture.md` (Source Contracts, Exposure Policy including the conceptual YAML shape, Checks and Verification, Libraries), `docs/architecture.md` (REST-Backed Client Surfaces; `internal/tools` is repository tooling, never product behavior), `api/openapi.yaml`, `docs/TESTING.md` (no test code under `internal/tools`), the Justfile `openapi`/`openapi-check` recipes and the `.pre-commit-config.yaml` local-hook pattern.
- OpenAPI tagging: assign exactly one `tags:` entry to each of the 85 operations. Tags are durable kebab-case resource areas that later become default CLI areas and MCP groups. Derive them from the existing path/resource structure (for example `demo`, `health`, `operations` for the background-operation and run endpoints, `categories`, `tags`, `members`, `accounts` (including credit-limit-history subresources), `exchange-rates`, `transaction-templates`, `recurring`, `transactions`, `records` for journal-record search/bulk endpoints); the final grouping is yours but each tag must group operations a user would look for together, and every operation gets exactly one. Verify with `just openapi-check` that tagging does not change generated server/client output; if oapi-codegen output does change, regenerate via `just openapi` and include the regenerated files in the same commit only if the generated Go API surface is behavior-identical (imports/ordering only) — any semantic change to generated code means the tagging approach is wrong.
- `api/client-surfaces.yaml`: follow the conceptual shape in `docs/cli-mcp-architecture.md` exactly (`operations.<operationId>.cli` / `.mcp`, `state: exposed|excluded`, optional `area`/`group` overrides, `name`, `annotations` with `read_only`, `destructive`, `idempotent`, `open_world`, and `reason` for exclusions). Decision policy:
  - CLI: preserve the full REST-client intent — expose every operation with a short command name (kebab-case verbs like `list`, `get`, `create`, `update`, `delete`, `restructure`, `set-hidden`, `search`, `seed`, `start`, `status`). The area comes from the tag unless an override reads better.
  - MCP: curate for agent usefulness. Expose the read/query, CRUD, bulk, recurring-workflow, and manual-trigger operations an agent operating a household's finances genuinely needs, with snake_case tool names. Every exclusion needs a durable, operation-specific reason (not boilerplate); expected exclusions include at least `seedDemo` (bulk demo seeding can destroy real household state and is a developer workflow) and `getHealth` (transport liveness diagnostic with no accounting value over MCP) — add others only with equally specific reasoning.
  - Annotations are explicit per-exposure decisions: `read_only: true` only for pure reads; `destructive: true` for deletes, cancels, restructures, and bulk rewrites; `idempotent: true` where repeating the call with identical arguments yields the same end state (PUT-style replaces, deletes, sets); `open_world: false` for every operation (Mina is a closed local system).
- `internal/tools/surfacegen`: a `package main` command under `internal/tools/surfacegen` using `github.com/getkin/kin-openapi` (already a module dependency) to load and validate `api/openapi.yaml`, plus the surface config. Model it on the existing `internal/tools/archlint` command style (stderr diagnostics, non-zero exit on findings, sorted deterministic output). It must reject, with file/operation-specific messages:
  - config operation keys that are not in the OpenAPI operation set, and OpenAPI operations missing from the config (exact-set match);
  - an operation missing a CLI or MCP decision, a state other than `exposed`/`excluded`, or an excluded entry with an empty/missing reason;
  - OpenAPI operations without exactly one tag when any exposed entry relies on tag-derived area/group, and exposed entries whose area/group cannot be resolved at all;
  - name collisions: two CLI exposures resolving to the same area+name, two MCP exposures resolving to the same group+name; invalid names (CLI areas/commands must be kebab-case `[a-z][a-z0-9-]*`, MCP groups/tools snake_case `[a-z][a-z0-9_]*`);
  - exposed MCP entries missing any of the four annotation booleans;
  - unsupported OpenAPI shapes on exposed operations only: request or response content types other than JSON, parameters outside `path`/`query`, or path/query parameter schemas that are not scalar/enum/array-of-scalar after `$ref` resolution. Excluded-on-both operations must not fail shape checks.
- Justfile wiring: add a `surface-check` recipe (group `codegen`) that runs `go run ./internal/tools/surfacegen -check` (flag naming yours), extend the `mina-openapi-check` pre-commit hook's `files` pattern to include `api/client-surfaces.yaml` and make `openapi-check` (or the hook) also run `surface-check` so any OpenAPI/overlay drift fails `just pre-commit` deterministically. Do not generate any code yet.
- Validator effectiveness smoke (manual, no committed violations): with everything green, temporarily (a) delete one operation entry from `client-surfaces.yaml`, (b) add a fake `notARealOperation` entry, (c) blank one exclusion reason, (d) remove one MCP annotation key — running the check must fail each time with a specific message; revert and confirm green. Report the observed failures in the final response.
- No tests anywhere: `internal/tools` has no tests (`docs/TESTING.md`); validation is the smoke above plus repository checks.
- Do not modify `internal/httpclient`, `internal/clientcli`, `internal/mcpserver`, or any runtime code in this plan.

## Tasks

### Task 1: Tag every OpenAPI operation with one durable area tag

End state: all 85 operations in `api/openapi.yaml` carry exactly one kebab-case tag per the Plan Context grouping; generated server/client code is unchanged (or regenerated byte-identically in API surface).

- [x] Add exactly one `tags:` entry to every operation in `api/openapi.yaml` per the Plan Context policy, and verify `just openapi-check` still passes.
- [x] Commit the task as `Assign durable area tags to all OpenAPI operations`.

### Task 2: Add the explicit CLI and MCP surface configuration

End state: `api/client-surfaces.yaml` holds an explicit CLI and MCP decision for every operation per the Plan Context policy, with durable reasons for every exclusion and complete annotations for every MCP exposure.

- [x] Add `api/client-surfaces.yaml` covering all 85 operations with independent CLI and MCP decisions following the conceptual shape and the decision policy in Plan Context.
- [x] Commit the task as `Add explicit CLI and MCP surface configuration`.

### Task 3: Create the surfacegen validator and wire repository checks

End state: `go run ./internal/tools/surfacegen -check` validates the OpenAPI/overlay pair with every rejection rule from Plan Context, and Justfile plus pre-commit wiring makes drift fail `just pre-commit`.

- [x] Implement the `internal/tools/surfacegen` validator with the rejection rules and deterministic diagnostics from Plan Context.
- [x] Wire the `surface-check` recipe into the Justfile and the pre-commit hook per Plan Context.
- [x] Run the validator effectiveness smoke from Plan Context, reverting all temporary edits and reporting observed failures.
- [x] Commit the task as `Add surfacegen validator for client surface configuration`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test` passes.
- [x] `just pre-commit` passes on the committed tree, including the new surface check.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Tag all OpenAPI operations, add api/client-surfaces.yaml with explicit per-operation CLI and MCP decisions, and add the internal/tools/surfacegen validator wired through Justfile checks; no generated runtime registrations yet; no tests under internal/tools"`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
