# github.com/mishamsk/mina/internal/mcpserver

## Purpose

- Owns the REST-backed MCP tool registry, MCP result mapping, stdio and Streamable HTTP protocol handling, and hand-written composite tools.

## Implicit Contracts

- Invokes Mina behavior only through generated REST operations owned by `internal/httpclient`.
- Builds generated tools exclusively from `httpclient.MCPOperations()`, including generated schemas and all four configured annotations.
- Maps 2xx REST results to structured `{status, body}` content and non-2xx Mina envelopes to visible MCP tool errors.
- Validates composed generated and hand-written tool names as one collision domain before registration.
- Hand-written extensions receive only the REST session and generated REST operations; none ship by default.
- Standalone stdio mode is remote-only and never constructs a Mina runtime or in-process transport.
- Embedded Streamable HTTP uses an in-process generated REST client targeting the isolated REST handler supplied by runtime composition.
- Stdio and Streamable HTTP share one registry, handler, result-mapping, and extension implementation.
- Streamable HTTP allows requests without `Origin` and rejects origins whose host is not loopback.
- Must not import runtime, HTTP server adapters, services, stores, SQL, or `internal/clientcli`.

## Boundaries

- Owns: MCP tool registration, result mapping, protocol handling, and composite tools.
- Does not own: runtime composition, REST server behavior, domain behavior, persistence, SQL, or CLI behavior.

## Testing Notes

- Process-level SDK coverage lives in `cmd/mina/cli_smoke_test.go`.
