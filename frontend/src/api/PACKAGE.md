# frontend/src/api

## Purpose

- Owns generated REST client configuration.

## Implicit Contracts

- Generated endpoint paths and DTOs must not be handwritten here.
- Network failure normalization belongs only at this boundary.

## Boundaries

- Owns: generated client setup for browser calls and network failure normalization.
- Does not own: generated REST output, page behavior, or domain validation.

## Testing Notes

- No package-specific testing notes.
