# AGENTS.md

This repository is Mina, a local-first personal finance system implemented in Go.
Phase 1 REST APIs are closed. The active build scope is Phase 2: minimal local web UI infrastructure, transaction templates, and recurring transactions.

## Project Documentation

- `docs/architecture.md`: mandatory read at the beginning of any work. Never make changes to it, unless you are specifically instructed to edit this file.
- `docs/frontend-architecture.md`: mandatory read before frontend or `internal/webui` changes.
- `docs/business-requirements.md`: product scope. Read before changing user-visible behavior or API semantics.
- `PROJECT_STATE.md`: concise current implementation phase/stage state. Read when checking what exists now. Update only when progress against business requirements are made. Do not update on refactors and internal API chagnes.
- Package/module docs for backend and frontend: exported Go APIs that cross package boundaries must be documented in code. Add a short package markdown doc only for implicit contracts, side effects, ownership boundaries, or invariants that are not obvious from API docs. If there are no implicit contracts, say `No implicit contracts.` Use `docs/package_doc_template.md`.
- All docs must stay short. Prefer bullets, with one liners. Prefer replacing old statements to adding net new. Link to owning docs instead of repeating details.
- Documentation is evergreen. Never keep history, migration notes, or references to previous doc/code states.
- `docs/plan_template.md`: reusable template for active implementation checklists. Do not read.

## Infra & Dev Practices

- Never work around environment failures. If the shell, Go toolchain, or repo scripts fail for environmental reasons, stop and ask.
- The Justfile is the only owner of developer recipes. Run formatting, tests, checks, hooks, and scripts through `just`.
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

At the end of your work, commit and run review loop once unless you are a reviewer or fixing review findings:
- just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>"
- Review-loop can take about 10 minutes; use long command wait/poll timeouts and do not kill it while heartbeat/progress lines continue.
- If review left unresolved comments, address them yourself and do not re-run the review again
