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
- Runtime consumes source-loaded automatic exchange-rate loading settings from `internal/runtime/config`.
- Runtime consumes the cache directory resolved by `internal/runtime/config`.
- Process execution is opt-in per runtime mode; `serve` enables it and utility flows leave it disabled.
- Runtime dependencies carry only true side-effect seams such as clocks and network provider factories.
- Runtime operations start after app composition, publish operation status, and do not block app creation.
- Runtime registers exchange-rate loading as startup, recurring, and manual-started work against one operation status surface.
- Startup exchange-rate loading ensures and uses the configured Frankfurter file cache by default.
- Recurring and manual exchange-rate loading use the targeted Frankfurter API provider.
- Runtime operation status reads operation-run rows from ephemeral store-owned process tables.
- Runtime operation failures are recorded and logged without failing app creation or normal HTTP readiness.
- Runtime cancels operations and waits for them before closing the accounting DB.
- Runtime may import every app layer, but app service packages must not import runtime.

## Boundaries

- Owns: process configuration, database lifecycle policy, HTTP adapter configuration, app composition, background operation lifecycle, and mode-ready runtime values.
- Does not own: SQL statements, domain validation, REST DTO mapping, or CLI command help.

## Testing Notes

- Boundary tests should construct app instances through runtime.
