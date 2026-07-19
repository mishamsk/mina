# github.com/mishamsk/mina/internal/mcpserver

## Purpose

- Owns the REST-backed MCP tool registry, MCP result mapping, stdio and Streamable HTTP protocol handling, and hand-written composite tools.

## Implicit Contracts

- Invokes Mina behavior only through generated REST operations owned by `internal/httpclient`.
- Must not import runtime, HTTP server adapters, services, stores, SQL, or `internal/clientcli`.

## Boundaries

- Owns: MCP tool registration, result mapping, protocol handling, and composite tools.
- Does not own: runtime composition, REST server behavior, domain behavior, persistence, SQL, or CLI behavior.

## Testing Notes

- No package-specific testing notes.
