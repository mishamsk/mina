# frontend/src/models

## Purpose

- Owns frontend-only types not generated from OpenAPI.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: browser UI types that have no backend DTO owner.
- Does not own: OpenAPI-generated request or response DTOs.

## Testing Notes

- No package-specific testing notes.
