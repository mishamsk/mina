# frontend/src/features/hierarchy

## Purpose

- Owns reusable hierarchy UI for FQN-prefix operations shared by accounts, categories, tags, and templates.

## Implicit Contracts

- Restructure emits normalized prefix paths through caller-provided submit handlers; backend services own validation and conflicts.

## Boundaries

- Owns: entity-agnostic hierarchy components.
- Does not own: generated REST setup, entity-specific refresh orchestration, or route registration.

## Testing Notes

- Entity pages cover hierarchy workflows through frontend e2e tests.
