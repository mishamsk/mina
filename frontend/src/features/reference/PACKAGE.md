# frontend/src/features/reference

## Purpose

- Owns shared Mina reference-data page structure for bounded dictionary screens.

## Implicit Contracts

- Reference trees derive group rows from visible leaf FQNs and use API group rows only for group state.
- Toolbar search state is URL-backed with `q` and `hidden`.

## Boundaries

- Owns: reference-data toolbar, tree derivation, and table shell.
- Does not own: entity-specific API calls, mutation refresh rules, or route registration.

## Testing Notes

- Entity pages provide frontend e2e coverage for instantiated behavior.
