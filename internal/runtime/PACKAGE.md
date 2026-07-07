# github.com/mishamsk/mina/internal/runtime

## Purpose

- Owns process-local runtime options and manual app composition.
- Applies database open/create/migrate policy before the app is served.

## Implicit Contracts

- Runtime composition is the only place that wires concrete service, store, and adapter implementations.
- App instances own one initialized `AppDB`, app service bundle, REST handler, and web UI handler.
- Startup demo seeding runs after app composition and before HTTP listen.
- File-backed startup demo seeding refuses when the selected accounting schema already exists.
- Runtime decides DuckDB open policy and database lifecycle, then delegates DuckDB mechanics to store `AppDB` open helpers.
- Runtime keeps DuckDB connection parallelism fixed and CPU-bounded; it is not app config.
- Startup runs configured database validation after migration for file-backed accounting state only; error findings abort startup.
- `ValidateDatabase` opens the selected file-backed accounting state read-only and never writes to the target.
- Runtime derives accounting database and schema defaults from `appconfig.Config`.
- Runtime consumes source-loaded app settings from `internal/appconfig`.
- Runtime consumes the cache directory resolved by `internal/appconfig`.
- Process execution is opt-in per runtime mode; `serve` enables it and utility flows leave it disabled.
- Runtime dependencies carry only true side-effect seams such as clocks, network provider factories, and cache HTTP clients.
- Runtime operations start after app composition, publish operation status, and do not block app creation.
- Runtime registers exchange-rate loading as startup, recurring, and manual-started work against one operation status surface.
- Exchange-rate loading runs invoke transaction `amount_usd` backfill after non-canceled load attempts.
- Runtime registers database backup as manual-started work when configured and recurring work only when a backup schedule is configured.
- Runtime wires the concrete store backup source and file backup provider together.
- Startup exchange-rate loading ensures and uses the configured Frankfurter file cache by default.
- Recurring and manual exchange-rate loading use the targeted Frankfurter API provider.
- Runtime operation status reads operation-run rows from ephemeral store-owned process tables.
- Runtime operation failures are recorded and logged without failing app creation or normal HTTP readiness.
- Runtime cancels operations and waits for them before closing `AppDB`.
- Runtime composes REST and embedded UI handlers without changing REST ownership.
- Runtime applies configured HTTP access logging around the composed REST and embedded UI handler.
- Runtime may import every app layer, but app service packages must not import runtime.

## Boundaries

- Owns: runtime options, database lifecycle policy, HTTP adapter configuration, app composition, REST/UI handler composition, background operation lifecycle, and mode-ready runtime values.
- Does not own: source-loaded app config, CLI flags, SQL statements, domain validation, REST DTO mapping, UI asset serving behavior, or CLI command help.

## Testing Notes

- `app-tests` construct app instances through runtime.
