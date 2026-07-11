# frontend/src/api

## Purpose

- Owns generated REST client configuration and REST error-message normalization.

## Implicit Contracts

- Generated endpoint paths and DTOs must not be handwritten here.
- Network failure and REST error-message normalization belong only at this boundary.

## Boundaries

- Owns: generated client setup for browser calls, network failure normalization, and API error-message extraction.
- Does not own: generated REST output, page behavior, or domain validation.

## Testing Notes

- No package-specific testing notes.
