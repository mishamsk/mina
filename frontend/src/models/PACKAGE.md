# frontend/src/models

## Purpose

- Owns frontend-only types not generated from OpenAPI.

## Implicit Contracts

- Transaction filter state mirrors the REST class, shape, and record-role enums and their URL serialization.

## Boundaries

- Owns: browser UI types that have no backend DTO owner.
- Does not own: OpenAPI-generated request or response DTOs.

## Testing Notes

- No package-specific testing notes.
