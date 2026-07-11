# AGENTS.md

This repository is Mina, a local-first personal finance system implemented in Go.

## Project Documentation

- `VISION.md`: product destination and product character. Mandatory read at the beginning of any work. Use it to guide tradeoffs; do not treat it as a backlog or implementation-status document. Never change it unless specifically instructed.
- `SCOPE.md`: durable product boundaries — what is in and out relative to the vision. Read before planning, creating or refining Kata issues, or deciding whether work belongs in Mina. A claimed Kata issue or committed plan owns concrete implementation scope, so routine implementation does not require rereading `SCOPE.md` unless scope is ambiguous. Never change it unless specifically instructed.
- `PROJECT_STATE.md`: concise implemented reality. Read when checking what exists now. Update only when user-visible progress against the vision is made; do not update for refactors or internal API changes.
- Kata: shared issue ledger for future work, priorities, dependencies, and ownership. It replaces roadmap phasing; do not use documentation as a parallel backlog.
- `docs/architecture.md`: backend technical system design, hard rules, and package boundaries. Mandatory read at the beginning of any work. Never change it unless specifically instructed.
- `docs/frontend-architecture.md`: frontend technical system design, hard rules, and package boundaries. Mandatory read before frontend or `internal/webui` work; it is not required for backend-only work.
- `docs/webui-design.md`: ground truth for web UI UX — pages, content, interaction and display rules. Mandatory read before planning or changing UI screens or user-facing web UI behavior.
- `docs/webui-theme-arcade-cabinet.md`: ground truth for the Arcade Cabinet web UI theme. Mandatory read before web UI theme or styling changes.
- Domain semantics docs in `docs/`: ground truth for cross-cutting product behavior named by each document; read the owning semantic doc before planning or changing that behavior.
- `api/openapi.yaml`: REST transport contract. Read before planning or changing REST behavior.
- Package/module docs for backend and frontend: local technical contracts, side effects, ownership boundaries, and invariants. Read the relevant package docs before changing a package. Exported Go APIs that cross package boundaries must be documented in code. Add a short package markdown doc only for implicit contracts not obvious from API docs. If there are no implicit contracts, say `No implicit contracts.` Use `docs/package_doc_template.md`.
- All docs must stay short. Prefer bullets, with one liners. Prefer replacing old statements to adding net new. Link to owning docs instead of repeating details.
- Documentation is evergreen. Never keep history, migration notes, or references to previous doc/code states.

## Infra & Dev Practices

- Project-related environment issues: diagnose and fix them yourself — e.g. kill stale `mina` dev/test server processes holding project ports (18080/18081, `just dev`), remove leftover project processes or artifacts, then retry. Stop and ask only for failures outside the project's scope (shell, Go toolchain, OS-level breakage).
- The Justfile is the only owner of developer recipes. Run formatting, tests, checks, hooks, and scripts through `just`.
- `scripts/` contains repo scripts, not product code. Manual benchmark recipes are never agent-required checks and must not be run unless the user explicitly asks.
- Do not invoke `gofmt`, `go test`, `prek`, or other recipe internals directly unless debugging the recipe itself.
- Run `just pre-commit` for configured pre-commit checks; the Justfile owns the details.
- Do not add test code under `internal/tools/**`. Validate internal tool changes with manual smoke checks, `just pre-commit`, and review.
- Custom lint rules: import-boundary rules live in `.golangci.yml` depguard config; non-import architecture rules live in `internal/tools/archlint`.
- Write idiomatic Go. Keep dependencies small and explicit. Use package-level boundaries instead of generic abstraction layers until a real boundary exists.
- Do not create redundant layers, and multiple defensive layers that do the same thing. E.g. if service does validation, do not repeat the same validation at other layers!
- Do not recreate what project dependnecy already implements. Always prefer capabilities provided by the library!
- Keep side effects isolated at explicit boundaries: filesystem, database, subprocesses, network listeners, clocks, and terminal I/O.
- Keep model packages data-focused. Put validation, persistence, and transport mapping in owning packages.
- Keep router/handler code thin. Domain behavior belongs in services/use-case packages.
- Keep commits small and self-contained. Finish and verify one task before starting another.

## Development Workflow

For every commit:

- For application code changes, run `just pre-commit`, `just test` during developement and before committing.
- For code changes that touch CLI, real-network REST, process startup, JSON-over-HTTP behavior, run `just test-integration` before commit.
- For changes that touch frontend runtime behavior, embedded UI assets, browser behavior, or JSON-over-HTTP behavior used by the frontend, run `just test-frontend-e2e` before commit.
- Do not run tests or broad validation for pure documentation changes, or for tooling/developer-recipe changes that do not touch application code.
- For changes that alter implicit contracts, side effects, ownership boundaries, or invariants that are not obvious from API docs update the relevant package docs in the same commit.

- When working from a plan document, follow its verification workflow verbatim.
- Otherwise, run `just review-loop "<short task/goal summary; review-relevant constraints or decisions>"` at the end of your work.
