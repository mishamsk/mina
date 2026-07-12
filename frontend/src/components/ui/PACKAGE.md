# frontend/src/components/ui

## Purpose

- Owns shadcn/ui generated presentational primitives.

## Implicit Contracts

- Components in this directory are repo-owned source generated from shadcn/ui.
- `select.tsx` owns Mina's shared Radix Select primitive, including the Arcade Cabinet trigger and listbox treatments.

## Boundaries

- Owns: low-level reusable UI primitives and variants.
- Does not own: route behavior, feature controllers, API calls, or browser persistence.

## Testing Notes

- No package-specific testing notes.
