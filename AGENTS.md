# AGENTS.md

This repository is Mina, a local-first personal finance system implemented in Go.
The active build scope is Phase 1 Stage 1: REST APIs only.

## Project Documentation

- `docs/architecture.md`: mandatory read at the beginning of any work. It is the short evergreen map for layers, ownership, state, and testing rules. Update only for durable architecture changes.
- `docs/business-requirements.md`: product scope. Read before changing user-visible behavior or API semantics.
- `docs/phase-1-data-model.md`: source of truth for the Phase 1 data model. Read before changing persistence, API shapes, or domain behavior.
- `PROJECT_STATE.md`: concise current implementation inventory. Read when checking what exists now. Update when behavior, durable state, default workflow shape, or operator-visible capability changes.
- Package/module docs: exported Go APIs that cross package boundaries must be documented in code. Add a short package markdown doc only for implicit contracts, side effects, ownership boundaries, or invariants that are not obvious from API docs. If there are no implicit contracts, say `No implicit contracts.` Use `docs/package_doc_template.md`.
- Non-architecture docs must stay short. Prefer durable bullets. Link to owning docs instead of repeating details.
- Documentation is evergreen. Never keep history, migration notes, or references to previous doc/code states.
- `docs/running_todo_template.md`: reusable template for active implementation checklists.

## Infra & Dev Practices

- Never work around environment failures. If the shell, Go toolchain, or repo scripts fail for environmental reasons, stop and ask.
- Use Go modules. Keep dependencies small and explicit.
- Write idiomatic, typed Go. Use package-level boundaries instead of generic abstraction layers until a real boundary exists.
- Run `gofmt` on edited Go files.
- Keep side effects isolated at explicit boundaries: filesystem, database, subprocesses, network listeners, clocks, and terminal I/O.
- Keep model packages data-focused. Put validation, persistence, and transport mapping in owning packages.
- Keep router/handler code thin. Domain behavior belongs in controllers/use-case packages.
- Keep commits small and self-contained. Finish and verify one task before starting another.

## Development Workflow

For every commit:

- Run the repository pre-commit command if one exists.
- Run `go test ./...` once code exists.
- Run any focused boundary scenario tests for the touched behavior.
- For changes that alter durable behavior, API contracts, state, or ownership boundaries, update the relevant docs in the same commit.
- For pure documentation changes, no reviewer subagent is required.
- If reviewer prompts are added later, run at most one review pass per non-mechanical commit and address findings before committing.
