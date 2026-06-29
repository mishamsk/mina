# frontend/src/hooks

## Purpose

- Owns generic reusable React hooks.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: hooks that could be reused outside a Mina-specific feature.
- Does not own: Zustand store modules, page code, or browser side-effect adapters.

## Testing Notes

- No package-specific testing notes.
