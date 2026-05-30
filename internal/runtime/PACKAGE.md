# github.com/mishamsk/mina/internal/runtime

## Purpose

- Owns process-local configuration and manual app composition, including HTTP adapter options.
- Applies database open/create/migrate policy before adapters are started.

## Implicit Contracts

- Runtime composition is the only place that wires concrete service, store, and adapter implementations.
- App instances retain the initialized accounting DB rather than separate database and location fields.
- Runtime decides database lifecycle policy, then delegates DuckDB mechanics to store open helpers.
- Runtime config selects the accounting schema, falling back to store defaults when omitted.
- Runtime may import every app layer, but app service packages must not import runtime.

## Boundaries

- Owns: process configuration, database lifecycle policy, HTTP adapter configuration, app composition, and mode-ready runtime values.
- Does not own: SQL statements, domain validation, REST DTO mapping, or CLI command help.

## Testing Notes

- Boundary tests should construct app instances through runtime.
