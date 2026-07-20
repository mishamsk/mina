# github.com/mishamsk/mina/internal/mcpserver

## Purpose

- Owns the REST-backed MCP tool registry, MCP result mapping, stdio and Streamable HTTP protocol handling, and hand-written composite tools.

## Implicit Contracts

- Owns its generated MCP operation catalog and wrapping invokers.
- Owns the top-level agent instructions shared by stdio and Streamable HTTP initialize results.
- Wrapping invokers call only generated REST operations owned by `internal/httpclient`.
- Builds generated tools exclusively from its package-local catalog, including generated schemas and all four configured annotations.
- Maps 2xx REST results to structured `{status, body}` content and non-2xx Mina envelopes to visible MCP tool errors.
- Validates composed generated and hand-written tool names as one collision domain before registration.
- No hand-written extensions ship today.
- A future extension implements `Extension`, uses only its supplied session for Mina behavior, and reads generated metadata through package-level `Operations()`.
- Future extensions are supplied to the MCP constructors by `cmd/mina` composition; registry construction rejects names used by generated or earlier extension tools.
- Standalone stdio mode is remote-only and never constructs a Mina runtime or in-process transport.
- Embedded Streamable HTTP uses an in-process generated REST client targeting the isolated REST handler supplied by runtime composition.
- Stdio and Streamable HTTP share one registry, handler, result-mapping, and extension implementation.
- Streamable HTTP allows requests without `Origin` and rejects origins whose host is not loopback.
- Imported only by `cmd/mina` and `internal/runtime` composition.
- Must not import runtime, HTTP server adapters, services, stores, SQL, or `internal/clientcli`.

## Boundaries

- Owns: generated MCP catalog and wrapping invokers, MCP tool registration, result mapping, protocol handling, and composite tools.
- Does not own: runtime composition, REST server behavior, domain behavior, persistence, SQL, or CLI behavior.

## Testing Notes

- Process-level SDK coverage lives in `cmd/mina/cli_smoke_test.go`.
