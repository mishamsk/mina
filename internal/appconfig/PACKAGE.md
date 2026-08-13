# github.com/mishamsk/mina/internal/appconfig

## Purpose

- Resolves local operational configuration, effective-source attribution, and the presentation metadata for its settings snapshot.

## Implicit Contracts

- Source precedence is defaults, TOML file, environment, then explicit overrides; source attribution must follow the winning value.
- Discovery uses an explicit path, then `$XDG_CONFIG_HOME/mina/config.toml`, then `~/.config/mina/config.toml` on macOS or `os.UserConfigDir()/mina/config.toml` elsewhere. An unavailable platform directory yields no config target; a missing target is valid and is still reported as the resolved path.
- Config files reject unknown TOML keys.
- `auth_file` is optional, file-only, and resolves relative paths against the loaded config file's directory.
- `Load`, rather than `DefaultConfig`, resolves the cache directory under `$XDG_CACHE_HOME/mina` or `os.UserCacheDir()/mina`; an explicit cache override is the only replacement.
- Every TOML-backed field needs matching settings metadata with a compatible display type and unique group/field ordering. Snapshot construction rejects metadata or value-map drift so the runtime cannot expose an incomplete settings view.
- `MINA_DATABASE_ENCRYPTION_KEY` and `MINA_API_KEY` use dedicated environment accessors and never enter ordinary config or settings snapshots; a present empty database-encryption key is invalid.
- API audit history defaults to six retained calendar months with compaction at midnight UTC on each month's first day; both values follow ordinary source precedence and attribution.

## Boundaries

- Owns config-file discovery and parsing, environment parsing, defaults, explicit overrides, effective-source tracking, and settings-snapshot metadata.
- Runtime owns mode-specific defaults, operational validation, and snapshot composition; see [Settings Architecture](../../docs/settings-architecture.md).
- Does not read authentication files or own CLI flags, database/listener lifecycle, services, providers, SQL, HTTP, or background execution.
