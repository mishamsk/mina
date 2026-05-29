# mina.local/mina/internal/runtime

## Purpose

- Owns process-local configuration and manual app composition.
- Applies database open/create/migrate policy before adapters are started.

## Implicit Contracts

- Runtime composition is the only place that wires concrete service, store, and adapter implementations.
- Runtime may import every app layer, but app service packages must not import runtime.

## Boundaries

- Owns: process configuration, database lifecycle policy, listener startup wiring, and mode composition.
- Does not own: SQL statements, domain validation, REST DTO mapping, or CLI command help.

## Testing Notes

- Boundary tests should construct app instances through runtime.
