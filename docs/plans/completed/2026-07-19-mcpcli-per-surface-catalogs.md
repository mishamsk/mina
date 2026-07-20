# Plan: Move per-surface catalogs and wrapping invokers out of `internal/httpclient`

Pure refactor correcting a package boundary: `internal/httpclient` must contain only the oapi-codegen generated REST client, the remote/in-process transports, and session construction. The generated surface catalogs (operation metadata, input descriptors, MCP JSON Schemas, CLI completion metadata) and the wrapping invokers move into the surface packages that own them — `internal/clientcli` and `internal/mcpserver`. No user-visible behavior, CLI, MCP, REST, or surface-config change of any kind.

## Plan Context

- Owning docs (just corrected in an operator commit — read them fresh): `docs/architecture.md` Package Boundaries ("`internal/httpclient` ... carries no CLI or MCP surface knowledge, catalogs, or wrapping invokers"; clientcli/mcpserver each own their "generated ... operation catalog and wrapping invokers"; both surface packages "are imported only by composition (`cmd/mina`, and `internal/runtime` for the embedded MCP handler)"), `docs/cli-mcp-architecture.md` Generation + Package Boundaries ("The generator emits a per-surface operation catalog with typed wrapping invokers into each surface package; `internal/httpclient` receives no generated surface output"; "A surface's catalog contains exactly its exposed operations"), `docs/TESTING.md`, `.golangci.yml`, Justfile `openapi`/`surface-check` recipes, `.pre-commit-config.yaml` `mina-openapi-check` hook.
- Terminology: the oapi-codegen methods (`ListAccountsWithResponse`, ...) are the REST client and stay in `internal/httpclient` untouched. "Wrapping invokers" are the generated `invoke*` functions plus the `Invoker`/`InvocationInput`/`InvocationResult`/`InvocationInputError` contract and the descriptor/metadata types currently in `internal/httpclient/catalog.go` and `internal/httpclient/surfaces.gen.go` — these all move out.
- Target layout:
  - `internal/httpclient` keeps exactly: `openapi.gen.go`, `transport.go`, `doc.go`, `PACKAGE.md`. Delete `catalog.go` and `surfaces.gen.go`. Update `doc.go`/`PACKAGE.md` (drop catalog/invoker ownership; consumer contract stays: clientcli, mcpserver, apptest).
  - `internal/clientcli` gains a hand-written contract file (its own copies of the invocation input/result/error, descriptor, operation-metadata, CLI naming, and completion types — package-local names are yours) plus a generated file (for example `surface.gen.go`) holding the CLI catalog: exactly the 85 CLI-exposed operations with area/name, completion metadata, descriptors, and wrapping invokers.
  - `internal/mcpserver` gains the same shape for MCP: a hand-written contract file plus a generated file holding exactly the 83 MCP-exposed operations with group/tool name, the four annotations, MCP JSON Schemas, descriptors, and wrapping invokers.
  - The two surface contract files may be near-identical copies; that duplication is deliberate (the surfaces may diverge) — do NOT create a shared "invocation" helper package, and do not leave any of these types in `internal/httpclient`. Wrapping invokers keep calling `httpclient.ClientWithResponsesInterface` (surfaces already import `internal/httpclient`; that direction is correct and unchanged).
  - `surfacegen` emits the two per-surface files instead of the single httpclient file. Generation stays validation-gated, byte-deterministic, gofmt-clean, sorted, with `DO NOT EDIT` headers. The MCP file must not contain CLI metadata and vice versa; shared facts (descriptors, invokers) are emitted into both files independently.
- Consumers: rewire `internal/clientcli/command.go` to its package-local catalog (drop `httpclient.CLIOperations()` etc.) and `internal/mcpserver/server.go` to its package-local catalog (drop `httpclient.MCPOperations()`). `Session.Operations()`-style accessors return package-local types. `cmd/mina`, `internal/runtime`, and `internal/apptest` interfaces should not need signature changes; if a signature must change, keep it composition-internal and behavior-identical.
- Repository wiring: `just openapi` regenerates both surface files; `surface-check` freshness (tmpdir + cmp) covers both new paths and no longer references `internal/httpclient/surfaces.gen.go`; the `mina-openapi-check` prek hook `files` pattern covers the new generated paths. Every commit must leave `just pre-commit` green — sequence the generator switch and the old-file deletion so no intermediate commit has a stale or dangling freshness target.
- Depguard tightening (matching the corrected `docs/architecture.md` rule): add rules so `github.com/mishamsk/mina/internal/clientcli` is importable only from `cmd/mina`, and `github.com/mishamsk/mina/internal/mcpserver` only from `cmd/mina` and `internal/runtime` (follow the existing `$all` + negation carve-out style). Verify both with a temporary prohibited import through the Justfile lint recipe, revert before commit, and report the observed failures.
- Verification is the existing suites plus determinism/freshness smokes (hand-edit one generated line → check fails → restore; double-generation byte-identical). No new tests, no test changes, no new test locations (`docs/TESTING.md`); if any existing e2e assertion references moved symbols it may be updated mechanically, but expected: none do.
- Protect list (must not regress, byte-identical behavior): remote CLI, local CLI including completion polling and interrupt close, stdio MCP (83 tools, annotations, schemas), Streamable HTTP `/mcp` with origin validation, REST and web UI routing, one-shot profile policy, apptest harness behavior, surfacegen validation rules (all rejection rules, guards, composed-name check stay intact).
- Exclusions: no changes to `api/openapi.yaml` or `api/client-surfaces.yaml`; no new REST client generation config; no behavior or naming changes to any command or tool; no `PROJECT_STATE.md` change (nothing user-visible).

## Tasks

### Task 1: Emit per-surface catalogs and rewire the surface packages

End state: surfacegen emits the CLI catalog + wrapping invokers into `internal/clientcli` and the MCP catalog + wrapping invokers into `internal/mcpserver`; both packages consume their own catalogs; `internal/httpclient` no longer carries any surface code; repository wiring (Justfile recipes, prek hook pattern) points at the new generated files; package docs updated.

- [x] Refactor surfacegen emission, add the per-surface contract files and generated output, rewire `internal/clientcli` and `internal/mcpserver`, delete `internal/httpclient/catalog.go` and `internal/httpclient/surfaces.gen.go`, and update `internal/httpclient` docs plus the Justfile/prek wiring per Plan Context.
- [x] Run the determinism/freshness smokes per Plan Context and report the observed results.
- [x] Commit the task as `Move surface catalogs and wrapping invokers into surface packages` (multiple compile-green commits are fine if you split; each must keep `just pre-commit` green).

### Task 2: Enforce composition-only imports of the surface packages

End state: depguard rejects imports of `internal/clientcli` outside `cmd/mina` and of `internal/mcpserver` outside `cmd/mina` + `internal/runtime`; effectiveness proven by temporary-violation smoke.

- [x] Add the depguard rules per Plan Context and update `internal/clientcli/PACKAGE.md` + `internal/mcpserver/PACKAGE.md` implicit contracts (catalog ownership, composition-only importers).
- [x] Verify with temporary prohibited imports, revert before commit, and report the observed lint failures.
- [x] Commit the task as `Restrict surface package imports to composition`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test` passes.
- [x] `just test-integration` passes (all CLI and MCP smokes prove behavior unchanged).
- [x] `just pre-commit` passes, including the relocated surface generation freshness checks.
- [x] `internal/httpclient` contains no surface metadata, catalog, or wrapping-invoker code.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Pure refactor: move generated surface catalogs and wrapping invokers from internal/httpclient into internal/clientcli and internal/mcpserver per corrected docs/architecture.md; httpclient reduced to generated REST client + transports + sessions; depguard restricts surface packages to composition importers; zero behavior change"`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
