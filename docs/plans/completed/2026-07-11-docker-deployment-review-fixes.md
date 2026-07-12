# Docker Deployment Review Fixes

## Outcome

Make Mina's Docker deployment safe and low-friction on Linux, macOS Docker Desktop, and compatible Synology hosts while keeping the database directly portable, config ready for future UI writes, and public documentation concise.

The operator will review every implementation commit and may send follow-up fixes. Do not run `just review-loop`; this plan's operator review replaces it.

## Fixed Decisions

- Compose bind mounts remain the persistence mechanism; do not replace the database with an opaque named volume.
- Compose runs Mina as configurable `MINA_UID:MINA_GID`, defaulting to `1000:1000`; the service process never starts as root to repair host ownership.
- The image retains its safe standalone non-root default user. Compose may override it with the host-matched numeric user.
- Persistent Compose defaults live together under an ignored `docker/state/` tree: config, data, cache, and backups.
- Ship the default TOML as an immutable image template. On `serve`, a small entrypoint bootstraps it into the writable config bind only when no config exists, then `exec`s Mina. Utility commands must not require writable config.
- Compose owns the in-container database location `/data/mina.duckdb`. Remove `MINA_DB` and schema from the supported base-Compose override surface; advanced operators can use an additive override.
- The root filesystem is read-only at runtime. Drop all Linux capabilities, forbid privilege escalation, and provide only explicitly required writable mounts plus a bounded `/tmp` tmpfs.
- Keep the Debian slim runtime maintainable. Remove apt indexes, but do not hand-delete package-manager binaries or the dpkg inventory. A future true distroless conversion is separate work.
- Use `docker/dockerfile:1` and Debian `trixie`. Go and Node builder defaults must exactly match `mise.toml`; pnpm must come from `frontend/package.json#packageManager`, with an automated drift check rather than another Dockerfile version constant.
- Mina's discovery URL is `/api/openapi.json`. Remove the branch's `/openapi.json` alias and correct stale documentation.
- README is for users. Docker contributor/agent contracts belong in a non-Go-style `docker/PACKAGE.md`.
- Do not implement the settings page (`wk80`), registry publishing/multi-arch manifest (`qxan`), or broader public documentation (`dhdj`). Preserve their scope.

## Protect

- Localhost-only port publishing by default.
- Direct `mina` process signal handling and graceful Compose shutdown.
- Embedded web UI and REST health reachability.
- Writable, portable database and backup files that remain usable outside Docker.
- Existing backup schedule/retention defaults and manual backup behavior.
- Proxy-agnostic base Compose file that accepts additive Traefik labels and networks.
- Real lifecycle coverage for recreation, restart, replacement, retained demo data, pre/post replacement backups, validation, and cleanup.
- Standalone image commands such as `version` and `db validate`.

## Implementation Sequence

### Commit 1 — Runtime image and Compose state contract

- Update the Dockerfile syntax frontend and all stages to Debian `trixie`.
- Remove `PNPM_VERSION`; activate Corepack and let the checked-in `packageManager` select pnpm.
- Add an automated check that Docker Go/Node defaults match `mise.toml` and package-manager declarations do not drift. Wire the check through the Justfile/pre-commit-owned workflow without duplicating recipe internals.
- Stop deleting apt/dpkg executables and `/var/lib/dpkg`; retain normal apt-index cleanup.
- Move the production config template away from the runtime bind source and copy it into the image.
- Add a minimal entrypoint that bootstraps config only for `serve`, reports actionable permission errors, and `exec`s Mina.
- Change Compose defaults to ignored `docker/state/{config,data,cache,backups}` bind directories.
- Make `/config` writable; set configurable numeric `user`; fix `/data/mina.duckdb`; remove base `MINA_DB`/schema pass-through.
- Add `read_only`, `cap_drop`, `no-new-privileges`, and a bounded `/tmp` tmpfs. Avoid privileged mode and broad host access.
- Ensure standalone `docker run ... version` and read-only database validation still work.
- Add only concise comments where the contract is otherwise non-obvious.

### Commit 2 — Lifecycle coverage for real permissions and hardening

- Remove all world-writable test-directory setup.
- Run Compose using the test caller's numeric UID/GID and realistic private directory modes.
- Exercise first-start config bootstrap, host-visible config persistence, and actual config writability.
- Assert the service root filesystem is read-only, capabilities are dropped, privilege escalation is disabled, and `/tmp` is writable with its expected bound.
- Update overlay rendering assertions for writable config and the new state paths without weakening proxy-agnostic behavior.
- Keep every existing lifecycle, backup, validation, isolation, and cleanup assertion.
- Use `/api/openapi.json`; do not add or depend on root API aliases.
- Add a fast cross-platform image build/run smoke for the non-native one of `linux/amd64` and `linux/arm64` when the local builder supports emulation. The full lifecycle may remain native; `qxan` owns published multi-arch CI.

### Commit 3 — Restore REST/UI namespace ownership

- Remove `/openapi.json` from the HTTP adapter and runtime composition.
- Document only `/api/openapi.json` in `internal/httpapi/PACKAGE.md` and `PROJECT_STATE.md`.
- Keep the root namespace owned by the web UI.
- Add or adjust normal boundary coverage so this behavior is not proven only by the Docker script.

### Commit 4 — User documentation and Docker agent context

- Rewrite README's Docker material around a short build/start quick start; remove “first-run path” wording, `sudo chown`, long shell helpers, database/schema override lists, database validation/restore tutorials, contributor test instructions, and the large inline Traefik overlay.
- Keep the alpha/data-loss/authentication warnings, localhost default, persistent-state locations, update/stop basics, one ordinary REST manual-backup example, and a concise trusted-proxy/Tailscale note.
- Explain UID/GID overrides only to the degree needed by a Linux/NAS user whose IDs differ from `1000:1000`.
- Add `docker/PACKAGE.md` with custom Docker-context headings, not the Go package template. Record artifact ownership, immutable-template/mutable-state boundaries, image/Compose contracts, overlay invariants, architecture limits (`linux/amd64` and `linux/arm64`; no ARMv7 claim), and `just test-docker` expectations.
- Keep `docs/TESTING.md` short and avoid duplicating the Docker package context.
- Keep `PROJECT_STATE.md` limited to implemented user-visible reality.

## Required Verification

- `docker build --check -f docker/Dockerfile .`
- Render default Compose and a non-default UID/GID/state-path configuration.
- Build and run image smoke checks for both `linux/amd64` and `linux/arm64` when the builder supports them; record any emulation limitation rather than silently skipping.
- `just test-docker`
- `just test`
- `just test-integration`
- `just test-frontend-e2e`
- `just pre-commit`
- Confirm no test containers, networks, review images, or temporary state remain.
- Confirm the worktree is clean and every implementation unit is committed.
- Move this plan to `docs/plans/completed/` in the final implementation commit.

## Operator Acceptance

- A fresh user can create the documented directories and start Mina without `sudo chown` or mode `0777`.
- Files created by Mina are editable by the configured host user.
- Future settings work has a writable persistent config directory and never mutates a checked-in template.
- The deployment fails early with a useful message when bind permissions are wrong.
- The base Compose file cannot redirect the database outside the persistent data mount through a casual environment variable.
- The service remains non-root with a read-only root filesystem and minimal privileges.
- Both supported Synology-relevant architectures build; unsupported ARMv7 is not implied.
- No Docker requirement expands Mina's REST surface.
- README reads as product setup, while `docker/PACKAGE.md` gives agents enough context to change Docker safely.

## Completion Evidence

- Dockerfile check and default/custom Compose renders passed.
- Native `linux/arm64` and emulated `linux/amd64` image build/run checks passed.
- `just test-docker`, `just test`, `just test-integration`, `just test-frontend-e2e`, and `just pre-commit` passed.
- Final cleanup left no test containers, networks, tagged test images, temporary state, or Mina test servers.
