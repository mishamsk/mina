# github.com/mishamsk/mina/internal/httpclient

## Purpose

- Generated REST client code from `api/openapi.yaml`.
- Shared DTO, params, enum, response, and client types for app test harnesses.

## Implicit Contracts

- `internal/apptest` is the first approved consumer.
- Normal tests may import generated types when client method signatures require them.
- Production use needs an explicit approved use case before importing this package.

## Boundaries

- Owns: generated client-side REST contract types.
- Does not own: app setup, test harness lifecycle, service behavior, or server routing.

## Testing Notes

- `just openapi-check` verifies this package is current with the OpenAPI source.
