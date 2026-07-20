# Plan: Apply fleet review feedback — tooling freshness mode, dependency currency, run-wait rename, surface hygiene, e2e reshaping

Apply the user's post-merge review feedback to the CLI/MCP client surfaces: surfacegen owns generated-output freshness verification, dependencies move to current versions (including the oapi-codegen v2.7.1 CVE fix), the CLI async-polling concept is renamed from "completion" to "run-wait" everywhere, receiver-less session methods and volatile doc counts are removed, extension seams are documented, and the MCP/local-CLI e2e coverage is reshaped onto script-owned assertions without count coupling or brittle interrupt timing.

## Plan Context

- This is behavior-preserving work outside the rename and test/tooling surfaces: no REST, CLI, or MCP runtime behavior may change except where a checkbox states it.
- Ground truth: `docs/architecture.md`, `docs/cli-mcp-architecture.md` (already updated by operator commit `4a755f8` — the config key is now `run_wait` and the concept is "run-wait"; the doc's shell-completion wording stays Cobra-owned), `docs/TESTING.md`. Do not edit these documents.
- `internal/tools` has no tests (hard rule). Validate surfacegen changes with the smoke checks listed in the tasks, compilation, and `just pre-commit`.
- Exact-set and freshness guarantees for generated surfaces are owned by surfacegen checks; e2e tests must not duplicate them. E2e probes only a few stable, representative tools/commands.
- The existing app-test boundary (`internal/apptest/runtime`) owns runtime operation policy; `cmd/mina/cli_smoke_test.go` + `cmd/mina/testdata/script` own launched-process wiring. Do not create new test classes, packages, or boundaries.
- Generated files (`internal/clientcli/surface.gen.go`, `internal/mcpserver/surface.gen.go`, `internal/httpclient/openapi.gen.go`, `internal/httpapi/openapi/openapi.gen.go`) are never hand-edited; regenerate via `just openapi`.
- Protect / do-not-regress: depguard boundary rules in `.golangci.yml`; the `--db`/`--server` session behavior; run-wait polling semantics (only the name changes); stdio stdout reserved for protocol frames; Streamable HTTP origin validation; web UI and REST routing.

## Tasks

### Task 1: surfacegen owns generated-surface freshness verification

The Justfile `surface-check` recipe currently shells out to a tmpdir + `cmp` pipeline to detect stale generated surface files. Since Mina owns surfacegen, the tool itself must offer a verification mode: regenerate both surface outputs in memory and compare byte-for-byte against the committed `internal/clientcli/surface.gen.go` and `internal/mcpserver/surface.gen.go`, exiting non-zero with a clear "stale; run `just openapi`" message (a unified diff or equivalent hint on mismatch is welcome but optional). Keep the existing `-check` validation semantics; the new mode may be a new flag or a documented extension of `-check` — choose the simplest shape consistent with the existing flag design.

- [x] Deliver the surfacegen freshness-verification mode and rewrite the Justfile `surface-check` recipe to use it, removing the tmpdir+cmp shell for surface files (the oapi-codegen freshness shell in `openapi-check` stays — that tool is not Mina-owned).
- [x] Smoke-verify: hand-edit one generated surface file → the new mode fails naming the stale file; restore → passes; delete one generated file → fails. Record the smoke evidence in the commit message or plan notes.
- [x] `just surface-check`, `just openapi-check`, and `just pre-commit` pass.
- [x] Commit the task as `Own generated surface freshness verification in surfacegen`.

### Task 2: Bring client-surface dependencies to current versions

`github.com/oapi-codegen/oapi-codegen/v2` must move to v2.7.1 (v2.7.0 carries a minor CVE). `github.com/modelcontextprotocol/go-sdk`, `github.com/spf13/pflag`, and `gopkg.in/yaml.v3` must move to their current latest released versions where module resolution allows without conflicts; check the module proxy (`go list -m -u <module>`) and record the versions found. If a bump causes a real incompatibility, keep the current version and record why.

- [x] Deliver the dependency updates with `go mod tidy`, regenerate via `just openapi`, and commit any generated-code deltas produced by the new generator version.
- [x] `just test`, `just test-integration`, and `just pre-commit` pass on the updated dependencies.
- [x] Commit the task as `Update oapi-codegen, MCP SDK, pflag, and yaml dependencies`.

### Task 3: Rename the CLI async polling concept from "completion" to "run-wait"

The name `CLICompletion` (and the `completion:` config key) is confusingly close to Cobra shell completion, which the CLI also provides. Rename the concept end to end as a pure rename — zero behavior change: the `completion:` block under `cli:` in `api/client-surfaces.yaml` becomes `run_wait:` (both async trigger operations); surfacegen config decoding, validation messages, and generated-code emission follow; `internal/clientcli` renames the `CLICompletion` type (to `RunWait`), the `CLIOperation.Completion` field (to `RunWait`), and every "completion"-named helper, constant, and error string that refers to run polling (e.g. `waitForLocalCompletion`, `completionPollInterval`, `completionStatusInput`) to run-wait-oriented names. Regenerate the surface catalogs.

- [x] Deliver the rename across `api/client-surfaces.yaml`, `internal/tools/surfacegen`, `internal/clientcli` (including its PACKAGE.md wording), and regenerated catalogs; no name containing "completion" refers to run polling anywhere outside Cobra shell-completion contexts.
- [x] Confirm the rename is behavior-pure: the local run-wait e2e cases in `cmd/mina/testdata/script/mina_client_local.txt` pass unmodified.
- [x] `just test`, `just test-integration`, and `just pre-commit` pass.
- [x] Commit the task as `Rename CLI completion polling to run-wait`.

### Task 4: Remove receiver-less session methods, volatile doc counts, and document extension seams

`Session.Operations()` in both `internal/clientcli/command.go` and `internal/mcpserver/server.go` ignores its receiver and merely forwards to the package-level `Operations()` — a smell. Remove both methods; extension authors call the exported package-level catalog function directly. `PROJECT_STATE.md` must not record volatile concrete counts that change with every API change (e.g. "83-tool"); sweep the whole file. Both surface packages' PACKAGE.md must state the hand-written-extension contract explicitly: no extensions ship today, and how a future extension is added (the `Extension` type, registration at composition in `cmd/mina`, collision checking against generated names, and session-only access to Mina behavior).

- [x] Deliver the method removals (updating any callers and PACKAGE.md contract lines that promised session-provided catalog access), the PROJECT_STATE.md count sweep, and the extension-contract additions to `internal/clientcli/PACKAGE.md` and `internal/mcpserver/PACKAGE.md`.
- [x] `just test` and `just pre-commit` pass.
- [x] Commit the task as `Drop receiver-less catalog methods and volatile doc counts`.

### Task 5: Reshape MCP and local-CLI e2e coverage onto script-owned assertions

The `mcpstdio`/`mcphttp` testscript commands currently embed the whole test scenario (which tools to call, expected fields, exact tool count 83) in Go. Reshape:

- Replace them with small generic transport helpers whose outputs flow to the script: at minimum a way to connect over a given transport and list tool names (with annotation facts) on stdout, and a way to call one named tool with JSON arguments, writing the structured result to stdout and tool errors to stderr with non-zero/negatable semantics. The scripts — not Go — decide which tools are probed and assert results with native testscript primitives (`stdout`, `stderr`, `!`). Genuine system-level checks (transport connects, initialize reports server name `mina`) stay in Go.
- Drop every exact tool-count and full-set assertion; probe a small set of stable, unlikely-to-change tools (e.g. `transactions_list`, `accounts_get`, `members_create`) and the two annotation exemplars.
- Merge `mina_mcp_stdio.txt` and `mina_mcp_streamable_http.txt` into one MCP script running one server and covering both transports, keeping the origin-403 probe and the same-listener REST/web-UI checks; keep readiness on the standard `httpwait` pattern with CI-safe timeouts.
- Delete the local-CLI interrupt scenario (the `frankfurter -block-until-canceled` block in `mina_client_local.txt` and its fixture) and remove the `-block-until-canceled` mode from the frankfurter helper, restoring it to its simple serving shape. Remove any helper (e.g. `waitfile`) left unused. The one-shot runtime policy ("one-shot profile never runs automatic operations; manual triggers still work") must be proven by the existing app-test in `internal/apptest/runtime`; verify that coverage exists and extend it there only if a genuine gap remains (e.g. cancel-on-close of an active manual run, if cheaply provable with existing fakes — do not build new fake infrastructure).

- [x] Deliver the reshaped MCP helpers, the merged MCP script, the local-CLI script cleanup, the frankfurter helper restoration, and any app-test extension; scripts contain no exact-count or enumeration assertions.
- [x] `just test`, `just test-integration`, and `just pre-commit` pass; run `just test-integration` twice in a row to spot flakiness.
- [x] Commit the task as `Reshape MCP and local CLI e2e onto script-owned assertions` (split into two commits if the MCP and local-CLI halves are cleaner apart).

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test`, `just test-integration`, and `just pre-commit` pass on the final state.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Fleet feedback cleanup: surfacegen freshness mode replacing Justfile cmp shell; dependency bumps incl. oapi-codegen 2.7.1; pure rename of CLI completion polling to run-wait per docs/cli-mcp-architecture.md; removed receiver-less Session.Operations methods; PROJECT_STATE count sweep; PACKAGE.md extension contracts; MCP e2e reshaped onto script-owned assertions without tool-count coupling; local interrupt e2e replaced by app-test-owned one-shot policy coverage. No runtime behavior change outside the rename."`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
