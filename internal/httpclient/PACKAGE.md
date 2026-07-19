# github.com/mishamsk/mina/internal/httpclient

## Purpose

- Generated REST client code from `api/openapi.yaml`.
- Shared operation catalog and typed invoker contracts for generated CLI and MCP surfaces.
- Remote HTTP transport through the generated client constructors.
- In-process `http.Handler` transport through the hand-written client constructor.
- Shared DTO, params, enum, response, and client types for client consumers.

## Implicit Contracts

- `internal/apptest` is the first approved in-process transport consumer.
- Normal tests may import generated types when client method signatures require them.
- `internal/clientcli` and `internal/mcpserver` are the approved production consumers; `docs/cli-mcp-architecture.md` owns their uses.
- Other production use needs an explicit approved use case.
- In-process transport callers supply the handler and own its lifecycle.

## Boundaries

- Owns: generated client-side REST contract types, shared client-surface catalog and invokers, and remote or in-process client transport construction.
- Does not own: app setup, handler lifecycle, test harness lifecycle, service behavior, or server routing.

## Testing Notes

- `just openapi-check` verifies the generated REST client and client-surface catalog are current with their OpenAPI and surface-config sources.
