# mina.local/mina/internal/httpapi/models

## Purpose

- Owns REST JSON DTOs and stable REST error response shapes.

## Implicit Contracts

- Error responses use `{"error":{"code","message"}}`.
- DTO enums use lowercase API values and are mapped explicitly by `internal/httpapi`.

## Boundaries

- Owns: HTTP-facing request and response shapes.
- Does not own: service-domain types, SQL row types, generated OpenAPI code, or domain validation.

## Testing Notes

- DTO contract behavior is verified through generated OpenAPI tests and runtime boundary tests.
