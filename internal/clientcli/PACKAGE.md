# github.com/mishamsk/mina/internal/clientcli

## Purpose

- Owns the REST-backed client command tree, request input and output rendering, and hand-written composite client commands.

## Implicit Contracts

- Invokes Mina behavior only through generated REST operations owned by `internal/httpclient`.
- Builds generated areas and commands exclusively from `httpclient.CLIOperations()`.
- Follows the argument, flag, body, output, and error rendering rules owned by `docs/cli-mcp-architecture.md`.
- Selects remote mode from explicit `--server` or local mode from explicit or source-loaded `--db`; simultaneous explicit selector flags are mutually exclusive.
- Local mode refuses ephemeral state, owns command-lifetime cleanup, and uses only a process-injected handler factory.
- Local mode uses generated completion metadata to poll asynchronous manual triggers through generated REST operations, renders the terminal run, and propagates configured failure outcomes.
- Remote mode returns the trigger response without completion polling.
- Canceling local completion polling closes the session once; runtime-owned close cancels active work and waits for it.
- Local database lock failures direct callers to the owning server through `--server`.
- Hand-written extensions receive only a local-or-remote session factory and generated catalog access; registration rejects names used by generated areas, generated commands, or earlier extensions.
- Must not import runtime, HTTP server adapters, services, stores, SQL, or `internal/mcpserver`.

## Boundaries

- Owns: client command registration, target selection, client session lifecycle, request input, output rendering, and composite client workflows.
- Does not own: runtime composition, REST server behavior, domain behavior, persistence, SQL, or MCP behavior.

## Testing Notes

- No package-specific testing notes.
