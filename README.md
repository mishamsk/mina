# Mina

Mina is a local-first personal finance system for one household.

## Deployment Posture

- Alpha software: no guarantees. Mina can crash, misbehave, or corrupt or wipe data.
- Keep backup copies outside the host running Mina.
- Mina has no authentication or security layer yet.
- Do not expose Mina directly to the public internet.

## Docker Compose Quick Start

Create a deployment directory and fetch the supported Compose template:

```bash
mkdir -p "$HOME/mina-deployment"
cd "$HOME/mina-deployment"
curl -fsSLo compose.yaml https://raw.githubusercontent.com/mishamsk/mina/main/docker/compose.yaml
```

The downloaded file can stay as a standalone deployment, or its Mina services and named-volume declarations can be merged into and amended in an existing Compose project.

Create the independent config and backup binds with private permissions, then record the host user and group that should own Mina's files:

```bash
mkdir -p config backups
chmod 0700 config backups
printf 'MINA_UID=%s\nMINA_GID=%s\n' "$(id -u)" "$(id -g)" > .env
```

Docker Compose automatically reads the adjacent `.env` file.

Start Mina. The template pulls `ghcr.io/mishamsk/mina:latest` and publishes it to localhost only:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Open `http://127.0.0.1:8080`. Mina creates private files as the configured host user and refuses UID or primary GID `0`. Startup reports an ownership hint if the config directory is not writable.

## Persistent State

- `./config/config.toml`: writable operational config, initialized on first start and suitable for source control with the deployment files.
- `mina-data` Compose volume: portable accounting database.
- `mina-cache` Compose volume: persistent but rebuildable provider cache.
- `./backups`: database backup files.

The named database and cache volumes survive `docker compose down`. Running `docker compose down --volumes` or deleting either volume destroys that state. Set `MINA_CONFIG_DIR` or the independent `MINA_BACKUP_DIR` in `.env` to use other existing host directories. The default config keeps 14 backups and schedules one daily at `03:00` UTC.

To initialize empty named volumes from a ready Mina database, a cache tree, or both, stop Mina and mount a read-only seed directory:

```bash
docker compose stop mina
docker compose run --rm -v /absolute/path/to/seed:/seed:ro mina container-init \
  --database /seed/mina.duckdb --cache /seed/cache
```

Omit either option when it is not needed. Import never runs during normal startup and never overwrites existing database or cache state.

## Operations

Pull the latest image and recreate the service:

```bash
docker compose pull
docker compose up -d
```

Stop Mina gracefully:

```bash
docker compose stop
```

Trigger a manual backup through the running service:

```bash
curl -fsS -X POST http://127.0.0.1:8080/api/background-operations/database-backup/runs
```

## Trusted Remote Access

Keep the base Compose file unchanged and add proxy labels and networks through an additive override. Terminate TLS and any access controls in a trusted proxy, and restrict remote reachability with a private network such as Tailscale. Mina itself has no authentication yet.
