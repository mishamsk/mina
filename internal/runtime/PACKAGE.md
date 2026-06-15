# github.com/mishamsk/mina/internal/runtime

## Purpose

- Owns process-local runtime options and manual app composition.
- Applies database open/create/migrate policy before the app is served.

## Implicit Contracts

- Runtime composition is the only place that wires concrete service, store, and adapter implementations.
- App instances own one initialized accounting DB, app service bundle, and REST handler.
- Startup demo seeding runs after app composition and before HTTP listen.
- File-backed startup demo seeding refuses when the selected accounting schema already exists.
- Runtime decides database lifecycle policy, then delegates DuckDB mechanics to store open helpers.
- Runtime derives accounting database and schema defaults from `appconfig.Config`.
- Runtime consumes source-loaded app settings from `internal/appconfig`.
- Runtime consumes the cache directory resolved by `internal/appconfig`.
- Process execution is opt-in per runtime mode; `serve` enables it and utility flows leave it disabled.
- Runtime dependencies carry only true side-effect seams such as clocks, network provider factories, and cache HTTP clients.
- Runtime operations start after app composition, publish operation status, and do not block app creation.
- Runtime registers exchange-rate loading as startup, recurring, and manual-started work against one operation status surface.
- Runtime registers database backup as manual-started work when configured and recurring work only when a backup schedule is configured.
- Runtime wires the concrete store backup source and file backup provider together.
- Startup exchange-rate loading ensures and uses the configured Frankfurter file cache by default.
- Recurring and manual exchange-rate loading use the targeted Frankfurter API provider.
- Runtime operation status reads operation-run rows from ephemeral store-owned process tables.
- Runtime operation failures are recorded and logged without failing app creation or normal HTTP readiness.
- Runtime cancels operations and waits for them before closing the accounting DB.
- Runtime may import every app layer, but app service packages must not import runtime.

## Boundaries

- Owns: runtime options, database lifecycle policy, HTTP adapter configuration, app composition, background operation lifecycle, and mode-ready runtime values.
- Does not own: source-loaded app config, CLI flags, SQL statements, domain validation, REST DTO mapping, or CLI command help.

## Testing Notes

- `app-tests` construct app instances through runtime.
