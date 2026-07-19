# Plan: Deliver the generated standalone stdio MCP server

Adopt the official `modelcontextprotocol/go-sdk`, implement `internal/mcpserver`, and wire `mina mcp stdio --server URL` so the exact configured MCP exposure set (83 tools) is served over stdio against a running Mina REST server. This task is remote-only: no Mina runtime is constructed.

## Plan Context

- Owning docs: `docs/cli-mcp-architecture.md` (MCP Surface, MCP Transports stdio bullet, Hand-Written Extensions, Checks and Verification — the contract), `docs/architecture.md` (`internal/mcpserver` boundaries: no runtime, services, stores, SQL, clientcli, Cobra; invokes behavior only through generated REST operations), `internal/mcpserver/PACKAGE.md`, `internal/httpclient` catalog (`MCPOperations()`, descriptors, invokers, completion is CLI-only — ignore it), `internal/tools/surfacegen`, `docs/TESTING.md`, `.golangci.yml` (`integration-test-boundaries` strict allowlist for `cmd/mina/cli_smoke_test.go`), `cmd/mina/main.go` conventions.
- Dependency: add the official `github.com/modelcontextprotocol/go-sdk` (latest release) via `go get`/`just tidy`. It owns MCP protocol behavior, stdio transport, tool registration, and annotations; do not hand-roll protocol code.
- surfacegen extension — generated MCP input schemas plus two hardening guards:
  - emit a deterministic MCP-compatible JSON Schema for every MCP-exposed operation into the generated catalog (a new field on the MCP metadata in `internal/httpclient/catalog.go` + regenerated `surfaces.gen.go`): one top-level object combining required path parameters, query parameters (typed, arrays as arrays, enums as enums), and an optional nested `body` property carrying the operation's resolved body schema subset; convert only the supported OpenAPI 3.0 subset and fail generation on anything else for exposed operations;
  - guard 1: a parameter or body-property enum whose schema omits `type` must either be treated as a string schema consistently in BOTH schema emission and invoker conversion, or be rejected at validation time — a valid config must never generate a non-functional invoker (this closes a known latent gap);
  - guard 2: when a CLI completion block's terminal field resolves to a schema with an OpenAPI enum, validate `terminal_values` and `failure_values` are members of that enum (closes a known latent gap: a typo currently polls forever).
  Keep generation byte-deterministic; freshness checks already gate staleness.
- `internal/mcpserver` implementation (all protocol mapping in this package):
  - a registry built solely from `httpclient.MCPOperations()`: tool name composed as `<group>_<name>`, description from catalog summary/description, SDK tool annotations mapped from the four config booleans, input schema from the generated JSON Schema;
  - collision-check composed tool names at registration time (group+name pairs are unique per validation, but composed strings can collide across group boundaries — for example group `a_b`/name `c` versus group `a`/name `b_c`); fail fast on any collision;
  - tool handler: decode the tool arguments into `InvocationInput` (path values in template order as strings, query values, `body` property re-marshaled to raw JSON bytes untouched), call the operation's generated invoker against the remote session client; REST remains the only validation boundary — do not re-validate domain shapes beyond what the SDK does with the input schema;
  - results: on 2xx return structured content carrying the REST status and the decoded JSON body; on non-2xx return an MCP tool error whose content carries Mina's stable error envelope so the model can read it; transport/input errors also become tool errors;
  - a hand-written tool registration seam mirroring the clientcli extension seam: collision-checked against generated and prior extension names, extensions compose only generated REST operations and the session; ship zero extensions;
  - remote session only: a `--server URL` validated like the CLI's (reuse nothing from clientcli — mcpserver cannot import it; small local validation is fine), standard `http.Client`, no runtime construction anywhere in the package or command path.
- `cmd/mina` wiring: a `mcp` command with a `stdio` subcommand (`mina mcp stdio --server URL`) following existing constructor conventions. Stdout is reserved for MCP protocol frames: the command must pass stdout exclusively to the SDK transport and route all diagnostics/logging to stderr. `cmd/mina` must not import `internal/httpclient` (depguard); protocol behavior lives in `internal/mcpserver`.
- E2E coverage (existing `cmd/mina` boundary only): drive a real official-SDK MCP client from the integration driver. Extend `cmd/mina/cli_smoke_test.go` with testscript helper command(s) that use the official SDK client over a command transport spawning the script-installed `mina` binary (`mina mcp stdio --server ...` — reuse the testscript-provided executable mechanism; no separate build step). Update the `.golangci.yml` `integration-test-boundaries` strict allowlist minimally (SDK packages, plus `internal/httpclient` only if the exact-set assertion needs the generated catalog). ONE new script (for example `mina_mcp_stdio.txt`) against one launched `mina serve --demo`:
  1. initialize and list tools; assert the exact configured set (compare against the generated catalog set or assert the exact count of 83 plus representative names) and assert the annotations of at least one read-only and one destructive tool;
  2. call a read/query tool (for example `transactions_list` with a limit argument) asserting structured result content;
  3. call a path tool (for example `accounts_get`) asserting the entity payload;
  4. call a body tool with an invalid body (for example `members_create`) asserting an MCP tool error carrying the stable REST error envelope, plus one valid body call asserting success.
  Do not enumerate all tools, do not create an MCP-specific test package, do not repeat REST scenario coverage.
- Docs: update `internal/mcpserver/PACKAGE.md` (registry contract, result mapping, seam collision policy, remote-only) and `PROJECT_STATE.md` (stdio MCP surface). Keep short.
- Protect list (must not regress): remote and local CLI behavior, completion polling, REST/web UI serving, surfacegen determinism and freshness, all existing e2e scripts.
- Exclusions: no Streamable HTTP, no `/mcp` route, no embedded MCP, no runtime or in-process transport use in mcpserver (next plan), no changes to `api/openapi.yaml`, no MCP exposure changes in `api/client-surfaces.yaml`.

## Tasks

### Task 1: Generate MCP input schemas and harden surfacegen

End state: every MCP-exposed operation carries a deterministic generated JSON Schema in the catalog; the typeless-enum and completion-enum guards are active; regeneration is fresh.

- [x] Extend surfacegen (schema emission + the two guards), the catalog contract types, and the regenerated output per Plan Context.
- [x] Commit the task as `Generate MCP input schemas in the surface catalog`.

### Task 2: Implement the stdio MCP server

End state: `internal/mcpserver` serves the exact configured tool set over stdio through the official SDK against a remote server, with result/error mapping, annotations, collision-checked composed names, and the extension seam; `mina mcp stdio --server URL` is wired.

- [x] Add the official SDK dependency and implement the `internal/mcpserver` registry, handlers, result mapping, seam, and remote session per Plan Context, updating `internal/mcpserver/PACKAGE.md`.
- [x] Wire `mina mcp stdio` in `cmd/mina` per Plan Context (stdout reserved for protocol, diagnostics to stderr).
- [x] Commit the task as `Implement generated stdio MCP server`.

### Task 3: Add the official-SDK e2e smoke and user-visible docs

End state: the launched-process MCP smoke proves initialize, exact-set listing, annotations, and the representative calls; `PROJECT_STATE.md` records the stdio MCP surface.

- [x] Add the SDK-driven testscript helper(s), the minimal `.golangci.yml` allowlist extension, and the single MCP e2e script per Plan Context.
- [x] Update `PROJECT_STATE.md` per Plan Context.
- [x] Commit the task as `Add stdio MCP e2e smoke and project state`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test` passes.
- [x] `just test-integration` passes, including the MCP smoke.
- [x] `just pre-commit` passes, including surface generation freshness.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Implement generated stdio MCP server: official modelcontextprotocol/go-sdk, internal/mcpserver registry from generated catalog with generated JSON Schemas and annotations, REST error envelopes as tool errors, collision-checked seam, mina mcp stdio --server wiring with stdout reserved for protocol; remote-only, no runtime; surfacegen hardened with typeless-enum and completion-enum guards"`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
