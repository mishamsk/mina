# github.com/mishamsk/mina/internal/appconfig

## Purpose

- Loads source-backed app/operator configuration from defaults, local config, environment variables, and explicit overrides.
- Owns source precedence and source metadata for app config fields.

## Implicit Contracts

- Precedence is defaults < config file < environment < overrides.
- The local config file is `$XDG_CONFIG_PATH/mina/config.toml` when `XDG_CONFIG_PATH` is set.
- Explicit config file paths override default config path discovery.
- `DefaultConfig` does not inspect the filesystem or environment.
- `Load` resolves Mina's app cache directory as `mina` under `XDG_CACHE_HOME` when set, otherwise under `os.UserCacheDir()`, unless `Overrides.CacheDir` is set.

## Boundaries

- Owns: config file parsing, environment variable parsing, app config merge policy, defaults, explicit overrides, and source metadata for command help.
- Does not own: CLI flags, prompts, quiet mode, demo mode, access-log files, database files, listeners, database handles, clocks, writers, provider test seams, database lifecycle policy, service/provider option structs, domain validation, SQL, HTTP DTOs, or background runner mechanics.

## Testing Notes

- CLI-facing config behavior is covered by testscript integration tests.
