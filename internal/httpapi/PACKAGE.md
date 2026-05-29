# mina.local/mina/internal/httpapi

## Purpose

- Owns REST route registration, HTTP request parsing, response encoding, REST DTOs, and OpenAPI DTO mapping.
- Contains the adapter-owned generated OpenAPI contract subpackage.
  DTO structs live in the adapter-owned `models` subpackage.

## Implicit Contracts

- Error responses use the stable JSON error envelope defined by the REST contract.
- HTTP handlers call service use cases; they do not own domain validation or SQL.

## Boundaries

- Owns: HTTP status mapping, transport DTO conversion, REST query parsing, REST DTO models, and generated OpenAPI code if colocated.
- Does not own: database opening, CLI parsing, SQL execution, or service-layer decisions.

## Testing Notes

- REST behavior should be verified through runtime-constructed boundary tests.
