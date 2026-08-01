# Mina

**Local-first personal finance for one household, with real double-entry accounting underneath and a UI meant for people who do not collect ledger syntax as a hobby.**

> [!CAUTION]
> **THIS IS ALPHA SOFTWARE.** Mina holds personal financial data and can crash, misbehave, corrupt it, or wipe it. Keep independent backups. Mina has no authentication or security guarantees: run it only on a local machine or a trusted private network, never directly on the public internet. Use it at your own risk, ideally with data you can afford to restore while the paint is still wet.

Mina is a personal fun project that I am sharing as open source. I want it to be genuinely useful, but I am not pretending it is enterprise-ready.

## Why Mina Exists

I started Mina after getting frustrated with personal finance apps that only seem to work well when a bank imports nice, simple transactions for them. That is not how I use money. I want to track a split restaurant bill, a money pool with friends, several currencies, and cash moving between actual wallets without fighting the app every step of the way.

Simple systems flatten one bank posting into one spending item. A mortgage payment is really principal, interest, insurance, and servicing: one source record that still has to match the bank, split across four things worth seeing separately. At the other extreme, full general-ledger accounting turns that same payment into an asset, a liability, a principal schedule, and a book-value question. Without tracking what the house is actually worth, that machinery produces little practical insight for a household.

I tried [Ledger](https://ledger-cli.org/), [Actual Budget](https://actualbudget.org/), [Lunch Money](https://lunchmoney.app/), [Paisa](https://paisa.fyi/), [Firefly III](https://www.firefly-iii.org/), and plenty of others. Some are great at automatic imports and budgeting. Ledger and tools built on it have true double-entry accounting, but I did not want to maintain text files or build a separate analytics setup around them. None of them gave me the combination I wanted: easy manual entry for cash and for informal balances with friends, programmatic and agent access with full ownership of both the data and the AI pipeline over it, and direct analytics on top of that same data.

Mina takes a middle course: [checkbook accounting](docs/checkbook-accounting.md) with balanced double-entry records underneath. It models tracked money precisely and deliberately avoids pretending to know the value of everything a household owns.

The missing piece clicked while working on [PondPilot](https://github.com/pondpilot/pondpilot), a local, DuckDB-powered data explorer. Mina stays deliberately at household scale, so one embedded analytical [DuckDB](https://duckdb.org/) database can handle both transactions and reports. No database server, separate analytics store, or synchronization ritual: the portable accounting state lives in one file.

The OCD-ish part of me wants every bill and coin sitting in wallets or around the house accounted for until the numbers match exactly.

## What Mina Is Building

- Checkbook accounting backed by balanced double-entry records, exposed through both simplified workflows and full-detail UI and APIs.
- All capabilities available through REST, MCP, and CLI, with the browser UI covering everything that makes sense for a person to operate directly.
- Accounts, categories, tags, household members, transactions, recurring flows, cash, bank accounts, currencies including crypto used as currency, personal debts, exchange rates, backups, and integrity checks.
- Budgets, reports, and forecasts built on a portable DuckDB file that remains yours.
- AI-assisted classification, reconciliation, workflows, and financial insights, not just automatic data imports.
- A fast, local-first system that stays focused on one household and remains hackable by both people and agents.
- Household finance, not investment portfolio management, tax preparation, or a multi-user SaaS.

Mina is still moving quickly. See [VISION.md](VISION.md) for the full destination, [SCOPE.md](SCOPE.md) for what belongs in Mina, and [PROJECT_STATE.md](PROJECT_STATE.md) for what exists today.

## Quick Start

The supported deployment path is Docker Compose. It keeps Mina bound to localhost, gives the database and cache persistent volumes, and configures scheduled backups. Encryption is recommended for every persistent deployment.

```bash
mkdir -p "$HOME/mina-deployment"
cd "$HOME/mina-deployment"
curl -fsSLo compose.yaml \
  https://raw.githubusercontent.com/mishamsk/mina/main/docker/compose.yaml

mkdir -p config backups
chmod 0700 config backups
printf 'MINA_UID=%s\nMINA_GID=%s\n' "$(id -u)" "$(id -g)" > .env

# Generate once, store this value in a password manager, and supply the same
# value for every future start and restore. Compose reads it from .env.
MINA_KEY="$(openssl rand -base64 32)"
printf 'MINA_DATABASE_ENCRYPTION_KEY=%s\n' "$MINA_KEY" >> .env
unset MINA_KEY
chmod 0600 .env

docker compose pull
docker compose up -d
docker compose ps
```

Open <http://127.0.0.1:8080>. The image is `ghcr.io/mishamsk/mina:main`; the Compose health check uses `GET /api/health`.

Prefer to delegate? Give your coding agent this prompt:

```text
Set up a safe Mina demo for me. The project is https://github.com/mishamsk/mina.

Do not assume the repository is already on this machine. Fetch and read the current README and any setup files it links to from the main branch before doing anything. Then determine whether you are running on my personal computer or on a remote server; ask me only if you cannot tell safely.

- On a personal computer, prefer a local Mina binary and run an ephemeral demo with no database file, bound only to 127.0.0.1. Use a published release when one exists; otherwise follow the README's mise installation path from main.
- On a remote server, use the repository's supported Docker Compose setup with persistent state and backups. Seed demo data only on the first start, make sure later restarts do not try to seed it again, keep Mina bound to the server's loopback interface, and give me an SSH tunnel or existing private-network URL. Never expose Mina directly to the public internet.

Do not overwrite an existing Mina database, config, deployment, or port. Verify /api/health and that the UI loads. Then tell me what you chose and why, the URL I should open, where state and backups live (or that the demo is ephemeral), and the exact commands to stop, restart, and remove the demo.
```

### Release Binary

Download the archive for your platform from [GitHub Releases](https://github.com/mishamsk/mina/releases), put `mina` on your `PATH`, then start a persistent local instance. Supply the key only through the process environment:

```bash
printf 'Mina database encryption key: ' >&2
IFS= read -rs MINA_DATABASE_ENCRYPTION_KEY
printf '\n' >&2
export MINA_DATABASE_ENCRYPTION_KEY
mina serve --db "$HOME/mina.duckdb"
```

Generate a new key with `openssl rand -base64 32`, store it in a password manager, and enter it at the prompt above. Confirm database creation, then open <http://127.0.0.1:8080>. Run `mina serve --help` for config, host, port, logging, and demo options.

A release binary's first encrypted writable start downloads DuckDB's signed, version-matched `httpfs` extension, so a clean installation needs outbound network access. Supported Docker images bundle the extension and are the offline-capable deployment path.

### Install With mise

If you already use [mise](https://mise.jdx.dev/), its Go backend can build and activate Mina globally from source:

```bash
mise use -g go:github.com/mishamsk/mina/cmd/mina@latest
printf 'Mina database encryption key: ' >&2
IFS= read -rs MINA_DATABASE_ENCRYPTION_KEY
printf '\n' >&2
export MINA_DATABASE_ENCRYPTION_KEY
mina serve --db "$HOME/mina.duckdb"
```

Generate and store the key before the first persistent start, as described above. This route requires the Go/CGO build prerequisites used by DuckDB. Release binaries or Compose are less adventurous.

### Try Demo Data

For a disposable look around, omit `--db` and seed deterministic demo data:

```bash
mina serve --demo
```

No database file means the accounting state disappears when Mina stops. Demo seeding is only accepted for new state.

## Data, Backups, and Privacy

With the Compose setup:

- `mina-data` holds the portable accounting database, encrypted with AES-256-GCM when `MINA_DATABASE_ENCRYPTION_KEY` is present.
- `mina-cache` holds rebuildable provider data.
- `./config/config.toml` holds operational configuration.
- `./backups` receives database backups; the template keeps 14 and schedules a daily backup at `03:00` UTC. Backups from an encrypted database use the same key and are encrypted too.

The key is intentionally not a Mina setting: there is no TOML field, CLI flag, REST/MCP/UI input, or settings-snapshot value for it. Compose forwards it from the operator's shell environment or deployment `.env` file. Keep `.env` mode `0600`, out of version control and ordinary deployment backups, and keep a separate copy of the key in a password manager. A key/file mismatch fails without changing the database; omit the variable only when intentionally using plaintext state.

Losing the key makes the encrypted database and every encrypted backup unrecoverable. Keep the key separately from the database and backups, retain tested independent backup copies, and test restore with `MINA_DATABASE_ENCRYPTION_KEY` set before relying on them. Encryption protects files at rest; it is not authentication and Mina does not claim NIST, FIPS, or other compliance certification.

Named volumes survive `docker compose down`. `docker compose down --volumes` deletes them. A backup on the same machine is useful; a tested copy elsewhere is an actual recovery plan.

Trigger a backup from the UI command palette or through the API:

```bash
curl -fsS -X POST \
  http://127.0.0.1:8080/api/background-operations/database-backup/runs
```

Mina is local-first, not magically private. Anyone who can reach the service can use it. Encryption reduces exposure from copied files but does not protect a running process or a disclosed key. Keep the listener, key, files, and backup copies inside boundaries you trust.

## Operating Compose

Update and recreate Mina. Compose automatically reuses the encrypted database
key from the deployment `.env` file. If the key is not stored there, export it
in the shell before running these commands. For a plaintext database, keep
`MINA_DATABASE_ENCRYPTION_KEY` absent from both sources.

```bash
docker compose pull
docker compose up -d
```

Stop it gracefully:

```bash
docker compose stop
```

For trusted remote access, keep Mina private behind a TLS-terminating proxy with access controls and a private network such as Tailscale. Do not publish Mina's port directly to the internet.

## Releases and Compatibility

Normal builds follow the tip of `main`. Mina will only get a semantic version tag and GitHub release when that exact build is ready enough to release, or once compatibility rules are in place and breaking changes are handled deliberately.

The goal is to always provide a forward migration path for databases and configuration. Downgrades are not supported: after Mina upgrades your data, do not expect an older build to understand it. Back up before updating.

## REST API

When Mina is running:

- Health: `<Mina server URL>/api/health`
- OpenAPI document: `<Mina server URL>/api/openapi.json`

## MCP and CLI Clients

Mina provides programmatic CLI and MCP clients for agents and scripts. Both are REST-backed interfaces that effectively wrap Mina's REST surface, while leaving room for client-specific features over time.

`<Mina server URL>` is `http://<host>:<port>`, using the `--host` and `--port` values passed to `mina serve`.

### MCP

The running Mina server exposes Streamable HTTP MCP at `<Mina server URL>/mcp`; point an MCP client that supports this transport at that URL. For a client that launches MCP servers over stdio, configure the equivalent of:

```text
mina mcp stdio --server "$MINA_SERVER_URL"
```

> [!CAUTION]
> Mina has no authentication yet. Do not expose MCP publicly: keep it on the same local or trusted private-network boundary as Mina's REST API and UI.

All MCP tools document their purpose and inputs in the server; agents should use filtered list or search tools for discovery, get tools for known IDs, and ask for confirmation before using any tool that creates, changes, or deletes data. Client-specific configuration and Mina's transport behavior are covered by the [CLI and MCP architecture](docs/cli-mcp-architecture.md).

### CLI Client

The REST-backed CLI can operate on the running server:

```bash
mina client --server "$MINA_SERVER_URL" transactions list --limit 5
```

For one-off commands against a database file not already owned by `mina serve`, use `--db PATH` for an in-process local session without starting a server:

```bash
mina client --db ./mina.duckdb transactions list --limit 5
```

Run `mina client --help` and command-level `--help` for the available operations and input flags.

## Contributing

Ideas, bug reports, real-world workflows, and documentation feedback are welcome. Mina does not accept external pull requests; share the problem and your thinking in an issue instead. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening one.

## License

Mina is open source under the [O'Saasy License](LICENSE.md). You may use, modify, and redistribute it, but you may not offer Mina or a derivative as a competing hosted, managed, SaaS, or cloud product whose primary value is Mina's functionality. The license text is authoritative.
