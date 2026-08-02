# github.com/mishamsk/mina/internal/services/authentication/administration

## Purpose

- Owns mutable authentication administration as a CLI-only operational capability.

## Implicit Contracts

- Initializes authentication state and owns user enablement, password, session-version, and API-key lifecycle mutations.
- Owns administration types, errors, use cases, and the mutable provider contract.
- Runtime composes this service with the file provider for each `mina auth` invocation; the CLI delegates administration through runtime.
- Administration is absent from REST, OpenAPI, generated clients, MCP, the online service, and the long-running handler dependency graph.
- Changes become visible to online authentication only after restart loads a new immutable snapshot.
- API-key revocation removes the active key record and immediately frees its label for reuse.

## Boundaries

- Owns: authentication administration decisions and secret-free administration views.
- Does not own: files, credential-material side effects, app config discovery, HTTP behavior, CLI prompting/rendering, or runtime composition.

## Testing Notes

- Exercise behavior through launched CLI process smokes and runtime restart scenarios.
