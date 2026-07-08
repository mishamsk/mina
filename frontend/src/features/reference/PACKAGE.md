# frontend/src/features/reference

## Purpose

- Owns shared Mina reference-data toolbar and tree-table building blocks.

## Implicit Contracts

- Reference trees derive group rows from visible leaf FQNs and use API group rows only for group state.
- Toolbar search state is URL-backed with `q` and `hidden`.
- Flat reference lists are page-owned and may reuse the toolbar with hidden controls disabled.

## Boundaries

- Owns: reference-data toolbar, FQN tree derivation, and tree table shell.
- Does not own: entity-specific API calls, mutation refresh rules, or route registration.

## Testing Notes

- Entity pages provide frontend e2e coverage for instantiated behavior.
