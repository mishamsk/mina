# mina.local/mina/internal/app

## Purpose

- Composes process-local configuration, database handles, controllers, and REST handlers.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: database open/create/migrate policy for an app instance.
- Does not own: SQL statements, domain validation, or HTTP route semantics.

## Testing Notes

- Boundary tests should construct an app through this package instead of wiring routers directly.
