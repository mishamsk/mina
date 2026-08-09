# Docker Deployment Context

## Owned Artifacts

- `Dockerfile` builds Mina's frontend and binary into the supported runtime image.
- `compose.yaml` is the supported baseline; use overlays for reverse proxies, labels, or external networks.
- `install.sh` creates a fresh authenticated, encrypted Compose deployment.
- `entrypoint.sh`, `volume-init.sh`, and `container-init.sh` own Docker-only startup, volume preparation, and explicit state import.

## State and Secrets

- Config and backups are independent host binds, defaulting to `./config` and `./backups`; they must already exist and be writable by `MINA_UID:MINA_GID`.
- `/data/mina.duckdb` and `/cache` are separate project-scoped named volumes. Cache is rebuildable; config, database, and backups are durable user state.
- `docker compose down` preserves named volumes. `down --volumes` or explicit volume removal destroys database and cache state.
- Compose passes `MINA_DATABASE_ENCRYPTION_KEY` from the environment or `.env`; the image, Compose file, and config template do not contain it. Keep `.env` private and store the encryption key separately from database files and backups.
- The entrypoint uses `umask 077`; newly created config, database, backup, and cache files must not grant group or other access.

## Initialization and Restore

- `volume-init` is the only root service. It has no network or host binds and prepares the named volumes for the configured non-root numeric identity; `nocopy` preserves that ownership on empty volumes.
- `mina` waits for successful volume initialization and refuses effective UID or primary GID 0. Its writable state is limited to the config bind, named volumes, backup bind, and ephemeral `/tmp`.
- On first `serve`, the entrypoint creates `config.toml` from the image template and creates `auth.toml` through `mina auth` only when both are absent. Bootstrap credentials must be non-placeholder values; they are cleared before Mina starts.
- Existing config and auth state are never replaced. A configured missing or invalid auth path fails closed; interrupted first initialization preserves auth state for retry.
- `container-init` is a Docker-only command, never runs implicitly, and refuses to overwrite database or cache state. It stages database imports on the destination volume, validates them before installation, and accepts only regular database files plus cache trees containing regular files and directories.

## Installer Contract

- `install.sh` is noninteractive and defaults to the current directory, `admin@local`, localhost port `8080`, and `ghcr.io/mishamsk/mina:main`; its flags may change those values.
- It resolves one source commit, downloads that commit's Compose artifacts, creates private config and backup directories, and generates independent administrator-password and database-encryption secrets.
- The target must be absent or empty and have no Compose containers, network, or named volumes for its deterministic project name. There is no update or overwrite mode.
- After health succeeds, the installer creates an automation API key through Mina, stores it privately in `.env`, restarts Mina, and verifies authenticated API access. On failure it removes only resources and files it created, so the same fresh install can be retried.

## Image and Compose Contract

- The image defaults to non-root `10001:10001`, contains Mina, Docker initialization commands, a health check, and a target-architecture DuckDB `httpfs` extension used without a runtime download for encrypted writes. Build from the repository root with `docker/Dockerfile`.
- The entrypoint ends with `exec mina`, so Mina receives stop signals directly.
- The base Compose deployment defaults to `ghcr.io/mishamsk/mina:main`, publishes only to `127.0.0.1` by default, and fixes the database path to `/data/mina.duckdb`; schema and database-path overrides are deliberately absent.
- The main service is read-only, drops all capabilities, forbids privilege escalation, and uses a bounded `/tmp` tmpfs. Do not add privileged mode, Docker socket access, or broad host mounts to the base deployment.
- Initial-admin variables affect only fresh initialization; they never alter existing config or authentication state.

## Architecture and Publication

- Supported image platforms are `linux/amd64` and `linux/arm64`; ARMv7 is unsupported.
- CI publishes a multi-architecture full-commit-SHA image, verifies it through the Compose lifecycle test, and promotes it to `:main` only when that commit is still the `main` tip. It does not publish `latest`, branch-name, semantic-version, or release tags.

## Verification

- `just docker-version-check` keeps image tool and DuckDB-extension versions aligned with project declarations.
- `just docker-manifest-check IMAGE` requires both supported platforms in a published image index.
- `just test-docker` exercises the image and Compose lifecycle, building local images unless `MINA_IMAGE` is supplied.
