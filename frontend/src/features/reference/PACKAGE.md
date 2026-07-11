# frontend/src/features/reference

## Purpose

- Owns shared Mina reference-data toolbar, tree-table building blocks, and drill-down shell behavior.

## Implicit Contracts

- Reference trees derive group rows from visible leaf FQNs and use API group rows only for group state.
- Toolbar search state is URL-backed with `q` and `hidden`.
- Flat reference lists are page-owned and may reuse the toolbar with hidden controls disabled.
- Drill-down pages own client-side descendant filter expansion because transaction filters are flat ID lists.

## Boundaries

- Owns: reference-data toolbar, FQN tree derivation, tree table shell, and shared drill-down page shell.
- Does not own: entity-specific API calls, mutation refresh rules, or route registration.

## Testing Notes

- Entity pages provide frontend e2e coverage for instantiated behavior.
