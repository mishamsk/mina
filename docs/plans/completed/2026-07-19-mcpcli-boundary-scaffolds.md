# Plan: Bootstrap and enforce the client-surface package boundaries

Add documentation-only compilable scaffolds for `internal/clientcli` and `internal/mcpserver`, then enforce the client-surface import boundaries from `docs/architecture.md` with path-scoped depguard rules. No CLI or MCP behavior exists after this plan — only packages, docs, and enforced boundaries.

## Plan Context

- Owning docs: `docs/architecture.md` (Package Boundaries; the rule list naming `internal/clientcli` and `internal/mcpserver`), `docs/cli-mcp-architecture.md` (Package Boundaries section), `docs/package_doc_template.md`, `internal/tools/archlint/main.go` package comment (import rules belong in depguard; archlint only for what depguard cannot express), `internal/httpclient/PACKAGE.md`.
- Scaffolds: each of `internal/clientcli` and `internal/mcpserver` gets a `doc.go` whose package comment states its ownership exactly as `docs/architecture.md` defines it, plus a `PACKAGE.md` from `docs/package_doc_template.md`. Package docs must state the implicit contract that these packages invoke Mina behavior only through generated REST operations owned by `internal/httpclient` and must not import runtime, HTTP server adapters, services, stores, SQL, or each other. No exported API, no behavior, no protocol library imports yet. `go build ./...` must keep compiling.
- Depguard rules in `.golangci.yml`, matching the existing rule style (list-mode `lax`, the same four file-glob variants used by existing rules):
  - `clientcli-boundaries` (files `internal/clientcli/**`): deny `github.com/mishamsk/mina/internal/runtime`, `internal/httpapi`, `internal/services`, `internal/store`, `internal/background`, `internal/providers`, `internal/webui`, `internal/mcpserver`, `database/sql`, and `github.com/duckdb/duckdb-go/v2`, each with a short desc in the style of neighboring rules. `internal/httpclient`, Cobra, and pflag stay allowed.
  - `mcpserver-boundaries` (files `internal/mcpserver/**`): the same denies with `internal/clientcli` in place of `internal/mcpserver`, plus `github.com/spf13/cobra` and `github.com/spf13/pflag` (CLI parsing belongs to `cmd/mina` and `internal/clientcli`). `internal/httpclient` and the MCP SDK stay allowed.
  - Amend the existing `runtime-composition-only` rule so its `internal/httpclient` deny no longer covers `internal/clientcli` and `internal/mcpserver` files (negation file patterns, like the rule's existing carve-outs). These two packages are the approved production consumers per `docs/cli-mcp-architecture.md`; do not loosen the rule for anything else. Keep the `internal/runtime` deny applying to both new packages.
  - New `product-no-tools` rule: all files except `internal/tools/**` deny `github.com/mishamsk/mina/internal/tools`, enforcing the `docs/architecture.md` rule that `internal/tools` is not imported by product packages.
- Archlint: add a check only if you find a required boundary above that depguard genuinely cannot express; the expectation is that none is needed. If you add nothing, state that decision in the commit message body of the depguard commit.
- Update `internal/httpclient/PACKAGE.md`'s consumer contract to name `internal/clientcli` and `internal/mcpserver` as the approved production consumers now that lint enforces the boundary.
- Boundary-effectiveness verification (do not commit any violation): with the rules in place, temporarily add a prohibited import to a scaffold (for example `internal/runtime` in `internal/clientcli` and `internal/clientcli` in `internal/mcpserver`) and a `internal/tools` import in a product file, run the repository lint through its Justfile-owned recipe, confirm each violation is reported, then revert the temporary edits. Capture the observed failures in the final response; the committed tree must be clean and green.
- No tests anywhere in this plan (`docs/TESTING.md`: no unit tests, no new test locations; scaffolds have no behavior to test).

## Tasks

### Task 1: Add the `internal/clientcli` and `internal/mcpserver` scaffolds

End state: both packages exist, compile, and carry package docs stating their ownership and implicit contracts; no behavior or dependencies are introduced.

- [x] Add `internal/clientcli/doc.go` and `internal/clientcli/PACKAGE.md` describing REST-backed client command-tree ownership per `docs/architecture.md` and the implicit contracts listed in Plan Context.
- [x] Add `internal/mcpserver/doc.go` and `internal/mcpserver/PACKAGE.md` describing REST-backed MCP tool registry and protocol handling ownership per `docs/architecture.md` and the implicit contracts listed in Plan Context.
- [x] Commit the task as `Add clientcli and mcpserver package scaffolds`.

### Task 2: Enforce client-surface boundaries with depguard

End state: the depguard rules from Plan Context exist, the two new packages may import `internal/httpclient`, product packages cannot import `internal/tools`, and every representative prohibited import fails repository lint.

- [x] Add `clientcli-boundaries` and `mcpserver-boundaries` depguard rules and the `product-no-tools` rule to `.golangci.yml`, and carve `internal/clientcli` plus `internal/mcpserver` out of the `runtime-composition-only` `internal/httpclient` deny.
- [x] Update `internal/httpclient/PACKAGE.md`'s consumer contract per Plan Context.
- [x] Verify boundary effectiveness with temporary prohibited imports per Plan Context, reverting them before commit and reporting the observed lint failures.
- [x] Commit the task as `Enforce client-surface package boundaries with depguard` (state the archlint decision in the body).

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test` passes.
- [x] `just pre-commit` passes on the committed tree.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Add documentation-only scaffolds for internal/clientcli and internal/mcpserver plus depguard boundary rules; no CLI or MCP behavior; scaffolds compile; boundaries proven by temporary-violation lint smoke"`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
