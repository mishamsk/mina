# frontend/src/components

## Purpose

- Owns generic reusable presentational UI components.

## Implicit Contracts

- Components here have no Mina accounting meaning; if a component could have come from npm, it belongs here.

## Boundaries

- Owns: shared presentation components and app-specific wrappers around `components/ui` primitives.
- Does not own: route behavior, Mina-specific feature workflows, API configuration, or browser persistence.

## Testing Notes

- No package-specific testing notes.
