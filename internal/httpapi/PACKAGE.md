# mina.local/mina/internal/httpapi

## Purpose

- Owns REST route registration, HTTP request parsing, response encoding, and OpenAPI DTO mapping.

## Implicit Contracts

- Error responses use the stable JSON error envelope defined by the REST contract.
- HTTP handlers call service use cases; they do not own domain validation or SQL.

## Boundaries

- Owns: HTTP status mapping, transport DTO conversion, REST query parsing, and generated OpenAPI code if colocated.
- Does not own: database opening, CLI parsing, SQL execution, or service-layer decisions.

## Testing Notes

- REST behavior should be verified through runtime-constructed boundary tests.
