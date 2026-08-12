# Compatibility

## Supported Boundary

- Mina has no releases yet: the tip of `main` is the latest version. Newer `main` versions preserve accounting data and its accounting meaning from earlier versions; they use an upgrade migration only when persisted state must change.
- REST, CLI, MCP, configuration, environment variables, backups, files, serialized runtime state, caches, and browser-local state may change between `main` versions.
- Running against an outdated schema, downgrading a database, and opening a newer schema with an older binary are unsupported.

## Evolution

- Evergreen product, architecture, semantic, API, and package documentation defines the current contract.
- Immutable upgrade-only migrations and migration validation evolve persisted accounting state; every persisted-state change supplies a new upgrade migration when required.
- Code that reads, calculates from, or validates persisted values must preserve their existing accounting meaning. A code change that reinterprets stored values must include a migration that transforms earlier data so its accounting meaning remains unchanged.
- Compatibility review checks backend changes for accounting-data loss, corruption, changed meaning, or unusability across forward upgrades between `main` versions, whether caused by migrations or by code interpretation.

## Data-Loss Exception

- A `main` change that cannot preserve accounting data requires an explicit Mina owner decision and guidance identifying the expected loss and the best available data-transfer procedure.
