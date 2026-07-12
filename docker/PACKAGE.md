# Docker Deployment Context

## Owned Artifacts

- `Dockerfile`: multi-stage frontend, Go, and Debian slim runtime image.
- `Dockerfile.dockerignore`: repository-root build context exclusions.
- `compose.yaml`: supported deployment baseline.
- `config-template.toml`: immutable operational-config template shipped in the image.
- `entrypoint.sh`: dispatches Docker-only initialization, bootstraps config for `serve`, then directly executes Mina.
- `volume-init.sh`: root-only named-volume ownership preparation.
- `container-init.sh`: explicit non-root database/cache seed import.
- `scripts/docker-service-test.sh`: real image and Compose lifecycle coverage.

## State Boundaries

- Config and backups are independent host binds, defaulting to `./config` and `./backups` relative to the deployment file.
- Database and cache use distinct project-scoped named volumes mounted at `/data` and `/cache`.
- Ordinary `docker compose down` preserves named volumes; `down --volumes` and explicit volume deletion are destructive.
- `/config/mina` is writable; first `serve` copies the image template only when `/config/mina/config.toml` is absent.
- `/data/mina.duckdb` is the fixed Compose database path; `/cache/mina` remains the app's normal XDG cache layout.
- Backups bind independently to `/backups` and never derive from database storage.
- Utility commands such as `version` and `db validate` do not bootstrap or require writable config.
- The entrypoint applies umask `077`; newly created config, database, backup, and cache files must have no group or other permissions.
- Cache is persistent but rebuildable; config, database, and backups are durable user state.

## Initialization Contract

- `volume-init` is the only root Compose service; it has no network or host binds, drops all capabilities, adds only `CHOWN`, `DAC_OVERRIDE`, and `FOWNER`, and prepares `/data` and `/cache` ownership for `MINA_UID:MINA_GID`.
- Named-volume mounts disable image copy-up so the initializer's numeric ownership remains authoritative even while `/data` is empty.
- Mounted-root numeric ownership is the change detector; recursive chown runs only for first use or a changed identity.
- `container-init` is intercepted by the image entrypoint and is not part of Mina's product CLI.
- Import accepts `--database`, `--cache`, or both; at least one is required and neither destination may contain existing state.
- Database import copies to a private same-volume stage, validates that exact artifact, then atomically installs it.
- Cache import accepts only directories and regular files, rejects symlinks and special entries, normalizes private modes, and atomically swaps the staged tree.
- Combined import prepares both artifacts before installation and rolls back an installed cache if the database commit does not complete.
- `serve` never imports implicitly and there is no overwrite path.

## Image Contract

- Standalone image execution defaults to the non-root `10001:10001` user.
- The entrypoint ends with `exec mina` so Mina directly receives stop signals.
- Builder Go and Node defaults match `mise.toml`; pnpm comes from `frontend/package.json#packageManager`.
- The runtime uses Debian slim, retains package inventory, and removes apt indexes only.
- Build from the repository root with `docker/Dockerfile` and its Dockerfile-specific ignore file.

## Compose Contract

- The template defaults to `ghcr.io/mishamsk/mina:latest`; `MINA_IMAGE` is the image-test and advanced-operator override.
- Compose runs as numeric `MINA_UID:MINA_GID`, defaulting to `1000:1000`; effective UID and primary GID must both be nonzero.
- The main `mina` service always runs directly as that non-root identity and waits for successful volume initialization.
- The main service root filesystem is read-only, all capabilities are dropped, privilege escalation is disabled, and `/tmp` is a bounded tmpfs.
- Main-service state is writable only through `/config/mina`, `/data`, `/cache`, and `/backups`; app cache state lives under `/cache/mina` and `/tmp` is ephemeral.
- Port publishing remains on `127.0.0.1` by default.
- Database and schema overrides are intentionally absent from the base environment surface.
- Only config and backup bind paths are overrideable, through `MINA_CONFIG_DIR` and `MINA_BACKUP_DIR`; Compose must not silently create them.
- Config initialization must fail early with an actionable ownership message when its bind is not writable.

## Overlay Invariants

- Keep the base file proxy-agnostic.
- Add reverse-proxy labels and external networks through Compose overlays.
- Preserve named volumes, independent binds, initializer dependency, hardening, health check, direct process execution, and graceful stop behavior.
- Do not require privileged mode, Docker socket access, or broad host mounts.

## Architecture Support

- Local images support `linux/amd64` and `linux/arm64`, including compatible Synology models.
- Do not claim ARMv7 support.
- Registry publication and multi-architecture manifest automation live outside this deployment baseline.

## Verification

- `just docker-version-check` detects tool-version drift.
- `just test-docker` builds real images unless `MINA_IMAGE` is supplied.
- The lifecycle test covers private bind permissions, named-volume ownership and `down` persistence, explicit import, config bootstrap and writes, hardening, reachability, recreation, restart, image replacement, backups, validation, and destructive test cleanup.
- It also builds and runs the non-native supported architecture when local emulation is available and reports an explicit limitation otherwise.
- Docker tests must leave no test containers, networks, tagged test images, or temporary state.
