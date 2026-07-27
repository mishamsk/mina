# frontend/src/api

## Purpose

- Owns generated REST client configuration and REST error normalization.

## Implicit Contracts

- Generated endpoint paths and DTOs must not be handwritten here.
- Network failure and REST error normalization belong only at this boundary.
- Handwritten wrappers may adapt generated pagination and query DTOs for UI resources but do not reclassify accounting data.

## Boundaries

- Owns: generated client setup for browser calls, network failure normalization, and API error extraction.
- Does not own: generated REST output, page behavior, or domain validation.

## Testing Notes

- No package-specific testing notes.
