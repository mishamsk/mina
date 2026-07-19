# github.com/mishamsk/mina/internal/clientcli

## Purpose

- Owns the REST-backed client command tree, request input and output rendering, and hand-written composite client commands.

## Implicit Contracts

- Invokes Mina behavior only through generated REST operations owned by `internal/httpclient`.
- Must not import runtime, HTTP server adapters, services, stores, SQL, or `internal/mcpserver`.

## Boundaries

- Owns: client command registration, request input, output rendering, and composite client workflows.
- Does not own: runtime composition, REST server behavior, domain behavior, persistence, SQL, or MCP behavior.

## Testing Notes

- No package-specific testing notes.
