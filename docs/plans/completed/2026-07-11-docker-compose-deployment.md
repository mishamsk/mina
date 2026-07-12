# Plan: Docker Image and Compose Deployment (Kata sdaw)

Build Mina as a production-oriented container, provide a generic Compose deployment with persistent state and built-in backups, and add a real Docker lifecycle test that proves the deployment survives restarts and image replacement. Keep image publishing out of this plan: Kata `qxan` owns GHCR publishing and will reuse this plan's test entry point against the registry image.

## Plan Context

- Docker artifacts live under `docker/`; the reusable service-test implementation lives under `scripts/`, with the Justfile owning only its thin recipe.
- The default Compose image is `mina:local`; `MINA_IMAGE` selects a published or alternate image without editing the base file.
- The runtime image includes `curl` solely for the Compose-native HTTP healthcheck, plus CA certificates, tzdata, and discovered shared-library requirements. It does not include the DuckDB CLI, debugging tools, or a usable package manager.
- The base Compose file stays generic and verbatim-compatible with additive labels and networks from a Traefik overlay.
- The Docker test disables automatic Frankfurter loading to avoid the large history cache. Production configuration keeps Mina's normal exchange-rate behavior.
- The test uses `mina serve --demo` only for the first boot. Later starts omit `--demo` because file-backed demo seeding correctly refuses an existing accounting schema.
- No separate deployment README is added. The root README owns Docker deployment documentation without expanding the broader project narrative owned by Kata `dhdj`.

## Tasks

### Task/Commit 1: Build the Production Mina Image

Add a multi-stage production Dockerfile that builds the frontend, embeds it into the CGO-enabled Go binary, and produces a small non-root runtime image. The image must run Mina directly with useful container defaults while keeping every operator setting overridable.

- [x] Add `docker/Dockerfile` and `docker/Dockerfile.dockerignore`; keep the build context at the repository root while excluding development output, VCS data, local databases, caches, and frontend dependencies.
- [x] Pin or parameterize builder versions in line with `mise.toml`; install frontend dependencies from the lockfile, build embedded assets, then build `./cmd/mina` with CGO enabled for the target Linux architecture.
- [x] Add OCI image metadata/build arguments for version, VCS revision, source, and creation time so tests and future CI can create distinguishable image revisions without changing application source.
- [x] Build a Debian-based non-root runtime containing only the Mina binary, `curl`, CA certificates, tzdata, the minimal healthcheck shell, and shared libraries proven necessary by the Linux binary.
- [x] Remove package-manager executables/metadata from the final stage; do not include the DuckDB CLI, wget, or general debugging utilities.
- [x] Create writable `/config`, `/data`, `/cache`, and `/backups` paths with ownership suitable for the runtime user.
- [x] Set `ENTRYPOINT`/`CMD`, environment defaults, and exposed port so the image runs `mina serve`, listens on `0.0.0.0:8080`, uses `/data/mina.duckdb`, discovers config under `/config`, caches under `/cache`, and handles initial database creation non-interactively.
- [x] Preserve overrides through Mina's existing environment/config inputs and Docker command replacement, including host, port, database path, schema, and config location.
- [x] Verification
  - [x] Build a local image for the host architecture with explicit version/revision metadata using `docker build -f docker/Dockerfile -t mina:docker-task-1 .`.
  - [x] `docker run --rm mina:docker-task-1 version` succeeds.
  - [x] A one-shot runtime inspection confirms `curl`, CA roots, and UTC timezone data exist; Mina runs as non-root; `apt`, `apt-get`, `dpkg`, `wget`, and `duckdb` are unavailable.
  - [x] Inspect the image configuration and confirm the expected entry point, command, environment defaults, port, runtime user, and OCI labels.
  - [x] Update progress in Kata `sdaw`.
  - [x] Commit changes.

### Task/Commit 2: Add the Generic Compose Deployment

Provide the endorsed early production-style deployment using the image contract from Task 1. The default remains safe for a trusted local machine, while normal Compose merging lets a home-server operator add Traefik labels and an external network without copying or editing the base file.

- [x] Add `docker/compose.yaml` with a stable `mina` service name and `${MINA_IMAGE:-mina:local}` image selection.
- [x] Publish container port `8080` on `127.0.0.1` by default; expose separate variables for the host bind address and host port without changing Mina's internal listener.
- [x] Bind configurable persistent host directories to `/config`, `/data`, `/cache`, and `/backups`; keep config read-only when practical and keep accounting, cache, and backup destinations writable by the non-root runtime user.
- [x] Add a checked-in TOML config template at Mina's expected `/config/mina/config.toml` relative path; configure the existing file backup provider for `/backups`, a finite retention count, and a UTC schedule.
- [x] Add a Compose-native service `healthcheck` using the image's `curl` against `http://127.0.0.1:8080/api/health`, with bounded timeout, retries, and startup grace.
- [x] Configure graceful shutdown and an appropriate persistent-service restart policy.
- [x] Keep the base file proxy-agnostic: no `container_name`, Traefik/Synology labels, external networks, TLS assumptions, or public-interface default.
- [x] Ensure an additive Compose overlay can attach `mina` to an external Traefik network and merge service labels while using `docker/compose.yaml` unchanged; the localhost port binding may remain active alongside proxy access.
- [x] Verification
  - [x] `MINA_IMAGE=mina:docker-task-1 docker compose -f docker/compose.yaml config --quiet` passes with defaults.
  - [x] Render the configuration with non-default image, bind address, host port, schema, and storage paths; confirm each override lands at the intended boundary.
  - [x] Start the base Compose service against `mina:docker-task-1` with disposable host directories and confirm Docker reports the service healthy through the configured healthcheck.
  - [x] Render a temporary additive Traefik labels/network overlay with the base file and confirm the merged configuration retains the base service, storage, healthcheck, and localhost port.
  - [x] Stop and remove the disposable Compose project without deleting the mounted test artifacts until they have been inspected.
  - [x] Update progress in Kata `sdaw`.
  - [x] Commit changes.

### Task/Commit 3: Add the Real Docker Lifecycle Test

Add one reusable host-driven script that tests the actual Compose service, persistent filesystem artifacts, and container replacement path. The script uses deterministic demo data for retention assertions but retains every independent check for image contents, Compose health, browser/API reachability, backups, validation, isolation, and graceful cleanup.

- [x] Add `scripts/docker-service-test.sh`; make it strict, executable, and self-cleaning, with actionable failure diagnostics that include Compose status, health inspection, and service logs.
- [x] Add `just test-docker` as a thin recipe whose body only invokes `scripts/docker-service-test.sh`; do not inline Docker orchestration or assertions in the Justfile.
- [x] Support local and future CI use:
  - [x] With no supplied image, build distinct initial and updated local images from `docker/Dockerfile` using different OCI revision metadata and assert their image IDs differ.
  - [x] Accept `MINA_IMAGE` to test a supplied/prebuilt initial image and optional `MINA_UPDATE_IMAGE` for a distinct replacement; do not rebuild a supplied registry image.
- [x] Create a unique Compose project and test-owned temporary config, data, cache, and backup directories; verify prerequisites up front and register a trap that removes only those containers/networks/images/directories owned by the current run.
- [x] Generate test configuration that preserves the production storage/backup wiring but disables automatic Frankfurter loading; do not download or persist the multi-megabyte history cache.
- [x] Add a test-only Compose override that adds `serve --demo` for first boot without changing the generic base file.
- [x] First-boot checks with the initial image and demo override:
  - [x] Start the real Compose service and wait until Docker reports its native healthcheck as healthy.
  - [x] Confirm Docker publishes only the configured loopback address and the selected host port.
  - [x] Confirm `/api/health`, `/api/openapi.json`, and the embedded web UI root are reachable and return the expected response classes/content.
  - [x] Query the REST API for deterministic demo accounts and transactions; record stable IDs/counts used by later retention assertions instead of creating custom accounting fixtures in the script.
  - [x] Confirm the service is running the expected initial image ID and the process is non-root.
- [x] Normal-operation restart checks:
  - [x] Recreate the service from the unchanged base Compose file without the demo override, proving an initialized database starts normally without reseeding.
  - [x] Verify the recorded demo IDs/counts remain unchanged.
  - [x] Restart the same normal service container, wait for native health again, and re-verify health, UI/API reachability, and the recorded demo data.
- [x] Backup checks before image replacement:
  - [x] Trigger the existing database-backup REST operation, poll it to terminal success, and assert exactly the expected new finalized `mina-backup-*.duckdb` artifact appears under the mounted backup directory with no leftover temp file.
  - [x] Preserve the backup path for later validation.
- [x] Image-replacement checks:
  - [x] Recreate the service with the updated image while retaining the same config/data/cache/backup mounts; in local mode prove both the container ID and image ID changed.
  - [x] Wait for the updated container's native healthcheck and re-verify health, OpenAPI, embedded UI, and every recorded demo retention assertion.
  - [x] Trigger another backup successfully after image replacement and assert a second finalized backup artifact is created.
- [x] Shutdown and artifact-integrity checks:
  - [x] Stop the updated service through Compose and confirm it exits within the configured grace period without crash/restart loops.
  - [x] Run the updated Mina image as a one-shot container to execute full `mina db validate` against the persisted live database.
  - [x] Run full `mina db validate` against the preserved pre-update backup and at least one post-update backup, proving the mounted artifacts are usable Mina databases.
  - [x] Confirm cleanup leaves no containers, networks, or temporary host directories for the unique test project and never touches another Compose project or operator path.
- [x] Verification
  - [x] Run `just test-docker` against a real local Docker engine; do not substitute mocked commands, `docker compose config` alone, or a dry run.
  - [x] Confirm the successful output explicitly reports every phase: two image revisions, first demo boot, normal recreation, same-image restart, pre-update backup, updated-image recreation, retained demo data, post-update backup, database validation, backup validation, and cleanup.
  - [x] Run `MINA_IMAGE=mina:docker-task-1 just test-docker` to exercise the supplied-image entry path; where no distinct `MINA_UPDATE_IMAGE` is supplied, require container recreation and retained data while allowing the image ID to remain the same.
  - [x] `just pre-commit` passes.
  - [x] Update progress in Kata `sdaw` with the exact Docker lifecycle evidence.
  - [x] Commit changes.

### Task/Commit 4: Bootstrap the Root README with Docker Deployment Docs

Create one root README focused on the deployment delivered by this plan, leaving the broader public-project narrative to Kata `dhdj`. Record Docker/Compose as implemented reality without creating a second README or duplicating future public documentation scope.

- [x] Add root `README.md` with durable scope wording for non-deployment content.
- [x] Document the Compose quick start, default `mina:local` image, `MINA_IMAGE` prebuilt override, supported host/port/database/schema overrides, config template, and `/config`, `/data`, `/cache`, `/backups` mounts.
- [x] Document native health status, image pull/update/recreate commands, graceful stop, built-in backup schedule/retention, backup artifact location, and Mina-based validation/restore checks.
- [x] State the deployment posture plainly: alpha has no guarantees, backups are mandatory, Mina has no authentication/security layer, and the default must not be exposed directly to the public internet.
- [x] Explain that direct binary runs are possible but secondary/ad hoc because useful Mina operation includes long-running scheduled work.
- [x] Include the concrete reference posture: Synology runs the unchanged base Compose deployment, an additive overlay supplies Traefik labels and its external network, Traefik uses a self-signed certificate, and remote reachability is only through Tailscale.
- [x] Include a copyable overlay and `docker compose -f docker/compose.yaml -f <overlay> up -d` command; explain that the loopback port can remain enabled alongside Traefik.
- [x] Document `just test-docker`, its real-Docker prerequisite, and the lifecycle guarantees it exercises without claiming that future migrations or arbitrary downgrades are automatically safe.
- [x] Update `PROJECT_STATE.md` concisely with the supported Docker/Compose deployment and real container lifecycle validation.
- [x] Do not add a separate Docker/deployment README and do not expand README licensing/contribution/general-project prose owned by Kata `dhdj`.
- [x] Verification
  - [x] Review every README command and path against `docker/compose.yaml`, its config template, and `just test-docker`; remove duplicated low-level explanation when a single owning section suffices.
  - [x] Confirm the Traefik example renders successfully as an additive overlay with the base Compose file.
  - [x] Confirm `PROJECT_STATE.md` describes only implemented behavior and remains concise.
  - [x] Update progress in Kata `sdaw`.
  - [x] Commit changes.

## Final Verification

- [x] From a clean worktree, run `just test-docker` against a real Docker engine after all implementation and review fixes; require every phase and assertion listed in Task 3 to execute and pass for real.
- [x] Confirm the final `just test-docker` run builds two distinct local image revisions, proves demo-data retention across normal recreation, same-image restart, and updated-image recreation, creates and validates backups on both sides of the image change, and cleans up its Compose project.
- [x] `just pre-commit` passes.
- [x] Confirm `MINA_IMAGE=mina:docker-task-1 docker compose -f docker/compose.yaml config --quiet` passes and the documented Traefik overlay still merges cleanly.
- [x] Confirm no test containers or networks remain and the git worktree is clean.
- [x] Ensure all implementation and verification changes are committed.
- [x] Run `just review-loop "Docker image and Compose deployment (Kata sdaw): minimal non-root image with curl healthcheck; generic localhost-bound Compose with persistent config/data/cache/backups; overlay-friendly Traefik layering; real lifecycle test proves demo retention, backups, validation, and image replacement; GHCR publishing remains in qxan"`.
- [x] After any review fixes, rerun `just test-docker` and `just pre-commit`, then commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata `sdaw` with the final commit, `just test-docker`, and `just pre-commit` evidence.
