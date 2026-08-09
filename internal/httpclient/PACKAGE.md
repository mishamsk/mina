# github.com/mishamsk/mina/internal/httpclient

## Purpose

- Generated REST client contract from `api/openapi.yaml` and remote or in-process transport construction.

## Implicit Contracts

- In-process requests synchronously invoke the supplied handler without a listener; the synthetic base URL is only for generated request construction.
- In-process responses are fully buffered, so this transport cannot support streaming response behavior.
- Callers supply an in-process handler that remains valid for the client's use; they own its runtime and lifecycle.

## Boundaries

- Owns generated REST client types and methods, request credential editing, and remote or in-process transport construction.
- Contains no CLI or MCP metadata, catalogs, or wrapping invokers.
- Does not own application setup, handler lifecycle, server routing, or service behavior.
