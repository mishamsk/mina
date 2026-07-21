# github.com/mishamsk/mina/internal/appconfig

## Purpose

- Loads source-backed app/operator configuration from defaults, local config, environment variables, and explicit overrides.
- Owns source precedence and source metadata for app config fields.

## Implicit Contracts

- Precedence is defaults < config file < environment < overrides.
- Config discovery is an explicit config file path, then `$XDG_CONFIG_HOME/mina/config.toml`, then the platform fallback.
- The platform fallback is `$HOME/.config/mina/config.toml` on macOS and `mina/config.toml` under `os.UserConfigDir()` elsewhere.
- If the platform config directory is unavailable, startup continues without a config file target.
- Missing config files are valid; `Load` retains the resolved path for settings reporting.
- Every `fileConfig` leaf has one entry in the static settings metadata map; snapshot construction rejects missing or unknown entries.
- Settings snapshot construction captures resolved process-config values and validates presentation-metadata completeness and consistency.
- `DefaultConfig` does not inspect the filesystem or environment.
- `Load` resolves Mina's app cache directory as `mina` under `XDG_CACHE_HOME` when set, otherwise under `os.UserCacheDir()`, unless `Overrides.CacheDir` is set.

## Boundaries

- Owns: config file parsing, environment variable parsing, app config merge policy, defaults, explicit overrides, effective-source tracking, and read-only settings metadata/snapshot derivation.
- Does not own: CLI flags, prompts, quiet mode, demo mode, access-log files, database files, listeners, database handles, clocks, writers, provider test seams, database lifecycle policy, service/provider option structs, domain validation, SQL, HTTP DTOs, or background runner mechanics.

## Testing Notes

- Config behavior defaults to `app-tests`; keep `e2e-tests` to representative CLI/config wiring smokes.
