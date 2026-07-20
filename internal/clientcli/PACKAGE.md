# github.com/mishamsk/mina/internal/clientcli

## Purpose

- Owns the REST-backed client command tree, request input and output rendering, and hand-written composite client commands.

## Implicit Contracts

- Owns its generated CLI operation catalog and wrapping invokers.
- Wrapping invokers call only generated REST operations owned by `internal/httpclient`.
- Builds generated areas and commands exclusively from its package-local catalog.
- Follows the argument, flag, body, output, and error rendering rules owned by `docs/cli-mcp-architecture.md`.
- Selects remote mode from explicit `--server` or local mode from explicit or source-loaded `--db`; simultaneous explicit selector flags are mutually exclusive.
- Local mode refuses ephemeral state, owns command-lifetime cleanup, and uses only a process-injected handler factory.
- Local mode uses generated run-wait metadata to poll asynchronous manual triggers through generated REST operations, renders the terminal run, and propagates configured failure outcomes.
- Remote mode returns the trigger response without run-wait polling.
- Canceling local run-wait polling closes the session once; runtime-owned close cancels active work and waits for it.
- Local database lock failures direct callers to the owning server through `--server`.
- No hand-written extensions ship today.
- A future extension implements `Extension`, uses only a `SessionFactory`-opened session for Mina behavior, and reads generated metadata through package-level `Operations()`.
- `cmd/mina` composition registers future extensions with `RegisterExtensions`, which rejects names used by generated areas, generated commands, or earlier extensions.
- Imported only by `cmd/mina` composition.
- Must not import runtime, HTTP server adapters, services, stores, SQL, or `internal/mcpserver`.

## Boundaries

- Owns: generated CLI catalog and wrapping invokers, client command registration, target selection, client session lifecycle, request input, output rendering, and composite client workflows.
- Does not own: runtime composition, REST server behavior, domain behavior, persistence, SQL, or MCP behavior.

## Testing Notes

- No package-specific testing notes.
