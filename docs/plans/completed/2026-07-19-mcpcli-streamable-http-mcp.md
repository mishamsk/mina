# Plan: Embed the shared MCP server over Streamable HTTP

Expose the same generated MCP tool registry over Streamable HTTP at `/mcp` on Mina's existing listener, backed by an in-process generated REST client against the isolated REST handler, and finish the remaining surface-contract enforcement. This completes the CLI/MCP client surfaces; REST, web UI, remote/local CLI, and stdio MCP must remain intact.

## Plan Context

- Owning docs: `docs/cli-mcp-architecture.md` ("MCP Transports" — embedded bullets are the contract: in-process generated REST client targeting the REST handler directly; composed beside `/api` and the web UI; never calls the final composed handler; origin validation; loopback listener default; non-loopback policy shared with REST — plus "Checks and Verification"), `docs/architecture.md` (composition may import every layer; `internal/runtime` owns handler composition; `internal/mcpserver` owns MCP protocol behavior including Streamable HTTP), `internal/mcpserver/{server.go,PACKAGE.md}`, `internal/runtime/{app.go,PACKAGE.md}`, `internal/httpclient` (`NewInProcessClient`), `internal/tools/surfacegen`, `docs/TESTING.md`, existing e2e scripts (`mina_rest_api.txt`, `mina_mcp_stdio.txt`).
- Embedded MCP composition:
  - `internal/mcpserver` gains a Streamable HTTP construction path (official SDK `StreamableHTTPHandler`) reusing the exact same registry, handlers, result mapping, and extension seam as stdio — one registry implementation, two transports;
  - the embedded server's REST client is built with `httpclient.NewInProcessClient` against the REST-only handler (the same isolated REST handler the runtime composes under `/api`), passed in by the composer — `internal/mcpserver` still must not import runtime/services/stores; it receives an `http.Handler`;
  - `internal/runtime` composes `/mcp` beside `/api` and the web UI inside the existing root-handler composition — the MCP handler must target the isolated REST handler, never the final composed root handler (no recursion, no listener loop, no loopback HTTP);
  - both runtime profiles: the embedded MCP surface belongs to the long-running serve profile; the one-shot profile must not gain it;
  - origin validation on `/mcp`: reject requests carrying an `Origin` header that is not a loopback origin (allow absent `Origin` for non-browser clients); this is the same non-loopback posture REST has (loopback listener default; non-loopback deployment is an explicit user decision) — keep it a small, documented check in the MCP handler path, not a general middleware framework;
  - access logging and HTTP timeouts follow whatever the existing composed handler already applies to routes; do not build new infrastructure.
- Finish contract enforcement in `surfacegen -check` (closes a recorded gap): composed MCP tool names (`<group>_<name>`) must be pairwise distinct at validation time, not only at server startup. Keep the existing runtime registration collision checks (they still guard hand-written extensions).
- E2E coverage: ONE minimal addition in the existing `cmd/mina` boundary (a new small script or a section in an existing MCP-related script — no new locations): against one launched `mina serve --demo`, use the official SDK client over the Streamable HTTP transport to `http://127.0.0.1:$PORT/mcp` to initialize, list tools (assert count 83), and make one representative call (for example `transactions_list`); assert one rejected non-loopback-Origin request (any HTTP probe is fine for the rejection case); assert `/api` and web UI routes still serve on the same listener in the same script. Do not repeat the stdio tool-shape matrix or add per-tool cases. Reuse the existing SDK driver helpers where possible.
- Docs: update `internal/mcpserver/PACKAGE.md` (two transports, embedded in-process client contract, origin policy) and `internal/runtime/PACKAGE.md` (composition now includes `/mcp` in the long-running profile) in the owning commits; finish `PROJECT_STATE.md` so it describes the completed user-visible client surfaces (remote/local CLI, stdio MCP, embedded Streamable HTTP MCP) concisely.
- Protect list (must not regress): REST routes and error envelopes, web UI routing and embedded assets, remote CLI, local CLI including completion polling, stdio MCP smoke, one-shot profile policy (no `/mcp`, no listener), surfacegen determinism/freshness, all existing e2e scripts and frontend e2e.
- Exclusions: no authentication implementation, no session persistence/resumability features beyond SDK defaults, no MCP exposure changes in `api/client-surfaces.yaml`, no changes to `api/openapi.yaml`.

## Tasks

### Task 1: Add the Streamable HTTP transport to `internal/mcpserver` and compose `/mcp`

End state: `mina serve` exposes `/mcp` on the existing listener (long-running profile only) through the shared registry with an in-process REST client against the isolated REST handler and loopback origin validation; stdio behavior is unchanged.

- [x] Add the Streamable HTTP construction path with origin validation to `internal/mcpserver` per Plan Context, updating `internal/mcpserver/PACKAGE.md`.
- [x] Compose `/mcp` in `internal/runtime`'s long-running profile per Plan Context (isolated REST handler, never the composed root), updating `internal/runtime/PACKAGE.md`.
- [x] Commit the task as `Embed Streamable HTTP MCP server at /mcp`.

### Task 2: Enforce composed MCP tool-name uniqueness at check time

End state: `surfacegen -check` fails on composed `<group>_<name>` collisions; generation and freshness remain deterministic and green.

- [x] Add the composed-name uniqueness validation to surfacegen per Plan Context and verify with a temporary-violation smoke (revert before commit, report the observed failure).
- [x] Commit the task as `Validate composed MCP tool names in surfacegen`.

### Task 3: Add the Streamable HTTP e2e smoke and complete user-visible docs

End state: the minimal launched-process smoke proves SDK initialize/list/call over `/mcp`, origin rejection, and intact `/api` + web UI on the same listener; `PROJECT_STATE.md` describes the completed client surfaces.

- [x] Add the minimal e2e coverage per Plan Context.
- [x] Finish `PROJECT_STATE.md` per Plan Context.
- [x] Commit the task as `Add Streamable HTTP MCP e2e smoke and project state`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test` passes.
- [x] `just test-integration` passes, including the new smoke and the existing stdio MCP smoke.
- [x] `just test-frontend-e2e` passes (web UI routing intact beside `/mcp`).
- [x] `just pre-commit` passes, including surface validation and generation freshness.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Embed the shared MCP registry over Streamable HTTP at /mcp on the existing listener via an in-process generated REST client against the isolated REST handler (never the composed root); loopback origin validation; long-running profile only; composed MCP name uniqueness enforced in surfacegen -check; REST, web UI, CLI, and stdio MCP unchanged"`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
