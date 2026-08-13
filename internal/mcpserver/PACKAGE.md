# github.com/mishamsk/mina/internal/mcpserver

## Purpose

- Owns the REST-backed MCP tool registry, result mapping, and stdio and Streamable HTTP protocol handling.

## Implicit Contracts

- The registry registers only the generated `Operations()` catalog before supplied extensions; malformed or duplicate tool registrations fail server construction rather than shadowing another tool.
- Generated tools preserve their operations' declared REST inputs and invoke Mina only through their supplied generated `httpclient` REST client; MCP does not bypass REST validation or behavior.
- Tool results expose the REST status and decoded JSON body as structured content. Non-2xx responses remain MCP tool errors and expose the raw REST error body.
- Streamable HTTP dispatches through an in-process REST client backed by exactly the handler supplied by its caller; authentication and outer HTTP composition remain the caller's responsibility.
- Remote stdio and in-process Streamable HTTP dispatch both apply the shared `mcp` client-surface editor to generated REST requests.
- Streamable HTTP permits requests without `Origin`, but a present origin must be an HTTP(S) `localhost` or loopback-IP origin.

## Boundaries

- Owns: the generated MCP catalog and invokers, tool registration, MCP result mapping, protocol handling, and composite tools.
- Does not own: REST client/session lifecycle, authentication, runtime composition, REST server behavior, domain behavior, persistence, SQL, or CLI behavior.
