# Mina

**Local-first personal finance for one household, with real double-entry accounting underneath and a UI meant for people who do not collect ledger syntax as a hobby.**

> [!CAUTION]
> **THIS IS ALPHA SOFTWARE.** Mina holds personal financial data and can crash, misbehave, corrupt it, or wipe it. Keep independent backups. Mina has no authentication or security guarantees: run it only on a local machine or a trusted private network, never directly on the public internet. Use it at your own risk, ideally with data you can afford to restore while the paint is still wet.

Mina is a personal fun project that I am sharing as open source. I want it to be genuinely useful, but I am not pretending it is enterprise-ready.

## Why Mina Exists

I started Mina after getting frustrated with personal finance apps that only seem to work well when a bank imports nice, simple transactions for them. That is not how I use money. I want to track a split restaurant bill, a money pool with friends, several currencies, and cash moving between actual wallets without fighting the app every step of the way.

I tried [Ledger](https://ledger-cli.org/), [Actual Budget](https://actualbudget.org/), [Lunch Money](https://lunchmoney.app/), [Paisa](https://paisa.fyi/), [Firefly III](https://www.firefly-iii.org/), and plenty of others. Some are great at automatic imports and budgeting. Ledger and tools built on it have true double-entry accounting, but I did not want to maintain text files or build a separate analytics setup around them. None of them gave me the combination I wanted: easy manual entry for messy real-life transactions, full accounting detail when I need it, and data I can query directly.

The missing piece clicked while working on [PondPilot](https://github.com/pondpilot/pondpilot), a local, DuckDB-powered data explorer. Mina stays deliberately at household scale, so one embedded analytical [DuckDB](https://duckdb.org/) database can handle both transactions and reports. No database server, separate analytics store, or synchronization ritual: the portable accounting state lives in one file.

The OCD-ish part of me wants every bill and coin sitting in wallets or around the house accounted for until the numbers match exactly.

## What Mina Is Building

- True double-entry accounting exposed through both simplified workflows and full-detail UI and APIs.
- All capabilities available through REST, MCP, and CLI, with the browser UI covering everything that makes sense for a person to operate directly.
- Accounts, categories, tags, household members, transactions, recurring flows, cash, bank accounts, currencies including crypto used as currency, personal debts, exchange rates, backups, and integrity checks.
- Budgets, reports, and forecasts built on a portable DuckDB file that remains yours.
- AI-assisted classification, reconciliation, workflows, and financial insights, not just automatic data imports.
- A fast, local-first system that stays focused on one household and remains hackable by both people and agents.
- Household finance, not investment portfolio management, tax preparation, or a multi-user SaaS.

Mina is still moving quickly. See [VISION.md](VISION.md) for the full destination, [SCOPE.md](SCOPE.md) for what belongs in Mina, and [PROJECT_STATE.md](PROJECT_STATE.md) for what exists today.

## Quick Start

The supported deployment path is Docker Compose. It keeps Mina bound to localhost, gives the database and cache persistent volumes, and configures scheduled backups.

```bash
mkdir -p "$HOME/mina-deployment"
cd "$HOME/mina-deployment"
curl -fsSLo compose.yaml \
  https://raw.githubusercontent.com/mishamsk/mina/main/docker/compose.yaml

mkdir -p config backups
chmod 0700 config backups
printf 'MINA_UID=%s\nMINA_GID=%s\n' "$(id -u)" "$(id -g)" > .env

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

Download the archive for your platform from [GitHub Releases](https://github.com/mishamsk/mina/releases), put `mina` on your `PATH`, then start a persistent local instance:

```bash
mina serve --db "$HOME/mina.duckdb"
```

Confirm database creation when prompted, then open <http://127.0.0.1:8080>. Run `mina serve --help` for config, host, port, logging, and demo options.

### Install With mise

If you already use [mise](https://mise.jdx.dev/), its Go backend can build and activate Mina globally from source:

```bash
mise use -g go:github.com/mishamsk/mina/cmd/mina@latest
mina serve --db "$HOME/mina.duckdb"
```

This route requires the Go/CGO build prerequisites used by DuckDB. Release binaries or Compose are less adventurous.

### Try Demo Data

For a disposable look around, omit `--db` and seed deterministic demo data:

```bash
mina serve --demo
```

No database file means the accounting state disappears when Mina stops. Demo seeding is only accepted for new state.

## Data, Backups, and Privacy

With the Compose setup:

- `mina-data` holds the portable accounting database.
- `mina-cache` holds rebuildable provider data.
- `./config/config.toml` holds operational configuration.
- `./backups` receives database backups; the template keeps 14 and schedules a daily backup at `03:00` UTC.

Named volumes survive `docker compose down`. `docker compose down --volumes` deletes them. A backup on the same machine is useful; a tested copy elsewhere is an actual recovery plan.

Trigger a backup from the UI command palette or through the API:

```bash
curl -fsS -X POST \
  http://127.0.0.1:8080/api/background-operations/database-backup/runs
```

Mina is local-first, not magically private. Anyone who can reach the service can use it, and anyone who can read the database or backups can read your financial data. Keep the listener, files, and backup copies inside boundaries you trust.

## Operating Compose

Update and recreate Mina:

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

## API and Agents

When Mina is running:

- Browser UI: <http://127.0.0.1:8080>
- Health: <http://127.0.0.1:8080/api/health>
- OpenAPI document: <http://127.0.0.1:8080/api/openapi.json>

The OpenAPI document is the machine-readable map. An agent should inspect it instead of guessing routes, preserve the local/trusted-network restriction, and confirm before destructive or bulk financial changes. CLI database diagnostics are available with `mina db validate --help`.

## Contributing

Ideas, bug reports, real-world workflows, and documentation feedback are welcome. Mina does not accept external pull requests; share the problem and your thinking in an issue instead. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening one.

## License

Mina is open source under the [O'Saasy License](LICENSE.md). You may use, modify, and redistribute it, but you may not offer Mina or a derivative as a competing hosted, managed, SaaS, or cloud product whose primary value is Mina's functionality. The license text is authoritative.
