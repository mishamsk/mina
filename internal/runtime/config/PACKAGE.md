# github.com/mishamsk/mina/internal/runtime/config

## Purpose

- Loads process-local runtime configuration from defaults, local config, environment variables, and explicit overrides.
- Owns source precedence for operational settings before runtime composition starts.

## Implicit Contracts

- Precedence is defaults < config file < environment < overrides.
- The local config file is `$XDG_CONFIG_PATH/mina/config.toml` when `XDG_CONFIG_PATH` is set.
- Explicit config file paths override default config path discovery.
- Config loading resolves Mina's app cache directory as `mina` under `XDG_CACHE_HOME` when set, otherwise under `os.UserCacheDir()`.
- Exchange-rate schedule and startup provider settings are config-file-only after defaults.
- `MINA_FX_AUTO_LOAD_ENABLED` and `MINA_FX_FRANKFURTER_BASE_URL` may override exchange-rate settings.
- Exchange-rate load schedules are five-field cron-style strings interpreted in UTC.
- Exchange-rate startup provider defaults to the Frankfurter file cache.
- Exchange-rate provider URLs are operational defaults for keyless Frankfurter clients; no API-key fields are loaded.

## Boundaries

- Owns: config file parsing, environment variable parsing, runtime config merge policy, and source metadata for command help.
- Does not own: CLI command construction, command help rendering, database lifecycle, or app composition.

## Testing Notes

- CLI-facing config behavior is covered by testscript integration tests.
