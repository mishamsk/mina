# github.com/mishamsk/mina/internal/runtime

## Purpose

- Owns process-local configuration and manual app composition.
- Applies database open/create/migrate policy before the app is served.

## Implicit Contracts

- Runtime composition is the only place that wires concrete service, store, and adapter implementations.
- App instances own one initialized accounting DB, app service bundle, and REST handler.
- Startup demo seeding runs after app composition and before HTTP listen.
- File-backed startup demo seeding refuses when the selected accounting schema already exists.
- Runtime decides database lifecycle policy, then delegates DuckDB mechanics to store open helpers.
- Runtime config owns accounting database and schema defaults.
- Runtime may import every app layer, but app service packages must not import runtime.

## Boundaries

- Owns: process configuration, database lifecycle policy, HTTP adapter configuration, app composition, and mode-ready runtime values.
- Does not own: SQL statements, domain validation, REST DTO mapping, or CLI command help.

## Testing Notes

- Boundary tests should construct app instances through runtime.
