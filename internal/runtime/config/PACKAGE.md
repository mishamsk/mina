# github.com/mishamsk/mina/internal/runtime/config

## Purpose

- Loads process-local runtime configuration from defaults, local config, environment variables, and explicit overrides.
- Owns source precedence for operational settings before runtime composition starts.

## Implicit Contracts

- Precedence is defaults < config file < environment < overrides.
- The local config file is `$XDG_CONFIG_PATH/mina/config.toml` when `XDG_CONFIG_PATH` is set.
- Explicit config file paths override default config path discovery.

## Boundaries

- Owns: config file parsing, environment variable parsing, and runtime config merge policy.
- Does not own: CLI command construction, command help rendering, database lifecycle, or app composition.

## Testing Notes

- CLI-facing config behavior is covered by testscript integration tests.
