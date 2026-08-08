# Mina

**Local-first personal finance for one household, with real double-entry accounting underneath and a UI meant for people who do not collect ledger syntax as a hobby.**

> [!CAUTION]
> **THIS IS ALPHA SOFTWARE.** Mina holds personal financial data and can crash, misbehave, corrupt it, or wipe it. Keep independent backups. Authentication is household access control, not a public-internet security guarantee: run Mina only on a local machine or trusted private network, or behind a TLS-terminating reverse proxy. Use it at your own risk, ideally with data you can afford to restore while the paint is still wet.

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

Give this to a coding agent:

```text
Set up Mina for me from https://github.com/mishamsk/mina.

Read the current README before acting. Unless I explicitly ask for persistent storage, use one of its exact one-command ephemeral demo paths. Keep Mina on 127.0.0.1, do not create a database or config file, and do not overwrite an existing deployment or use a busy port. Verify /api/health and that the browser UI loads, then tell me the local URL, the command you used, how to stop it, and that its data disappears when it stops.

If I ask for a persistent deployment, use the README's Compose installer instead. Keep its authentication, encryption, private files, backups, and loopback binding intact; never expose Mina directly to the public internet.
```

### Try the Demo

With Go and its platform C/C++ build prerequisites installed, run Mina directly from the public module:

```bash
go run github.com/mishamsk/mina/cmd/mina@main serve --demo
```

Or let [mise](https://mise.jdx.dev/) provide Go:

```bash
mise x go@1.26 -- go run github.com/mishamsk/mina/cmd/mina@main serve --demo
```

Open <http://127.0.0.1:8080>. The demo uses in-memory accounting state, so everything disappears when the process stops. Both commands fetch and build source on first use.

### Deploy with Docker

For an encrypted, authenticated deployment with persistent data and backups, install Docker with Compose v2, `curl`, and OpenSSL, then run:

```bash
curl -fsSL https://raw.githubusercontent.com/mishamsk/mina/main/docker/install.sh | sh -s -- --dir "$HOME/mina"
```

The command is noninteractive, defaults the administrator to `admin@local`, prints the generated credentials once, and starts Mina at <http://127.0.0.1:8080>. See the [full Compose guide](#docker-compose-deployment) before changing exposure, secrets, storage, or update behavior.

## REST, MCP & CLI

The browser UI is Mina's primary human interface. The same running server also exposes:

- REST health at `/api/health` and its OpenAPI document at `/api/openapi.json`.
- Streamable HTTP MCP at `/mcp` for agents.
- A generated REST-backed CLI through `mina client --server URL`.
- Local one-shot CLI access through `mina client --db PATH` when no server owns that database.

When `auth_file` is configured, authenticated REST accepts a browser cookie or API key. The remote CLI and stdio MCP read `MINA_API_KEY`; Streamable HTTP MCP clients send the same secret as bearer authentication. When `auth_file` is omitted, REST and Streamable HTTP MCP accept unauthenticated requests:

Install the host binary first with the same Go and platform C/C++ build prerequisites as the demo. Compose does not install it on the host:

```bash
go install github.com/mishamsk/mina/cmd/mina@main
```

Go installs `mina` in `GOBIN`, or in `GOPATH/bin` when `GOBIN` is unset. Add that directory to `PATH`, then run:

```bash
export MINA_SERVER_URL=http://127.0.0.1:8080
export MINA_API_KEY='<API key>'

mina client --server "$MINA_SERVER_URL" transactions list --limit 5
mina mcp stdio --server "$MINA_SERVER_URL"
```

Run `mina client --help`, `mina mcp --help`, or inspect the OpenAPI document for the available surface. Mina's MCP tools describe their own inputs; agents should confirm before mutations and use filtered list/search operations for discovery.

## Security and Data

- Mina is alpha software. Keep tested, independent backups of every persistent database you care about.
- Mina serves plain HTTP and binds to loopback by default. Use only a local machine or trusted private network, or place it behind a TLS-terminating reverse proxy with access controls. Never publish it directly to the internet.
- Authentication is household access control, not roles, hosted identity, or transport encryption. When `auth_file` is configured, REST accepts browser sessions or API keys and network MCP accepts API keys only; without `auth_file`, both accept unauthenticated requests. A local `mina client --db` session is deliberately trusted.
- Persistent DuckDB files and Mina-created database backups use AES-256-GCM when `MINA_DATABASE_ENCRYPTION_KEY` is present. The key is environment-only: it has no TOML setting, CLI flag, REST/MCP/UI input, or settings-snapshot value.
- Losing the encryption key makes the database and its encrypted backups unrecoverable. Keep a separate password-manager copy away from the data and backup files, and test restores with the key before relying on them. A wrong or missing key fails without changing the database.
- Encryption protects copied files at rest; authentication limits application access. Neither protects a compromised running process, disclosed credentials, or observable plain-HTTP traffic, and Mina makes no compliance-certification claim.
- Only `mina auth` may change `auth.toml`; never edit it by hand. API-key secrets are returned once when created and must be handled like passwords.
- Keep local config, authentication state, credential files, and backups private. Mina database backups do not include config or authentication state, so back those up separately and keep independent database copies outside the Mina host.

The [authentication guide](docs/authentication.md) covers native setup, browser-session behavior, user and API-key lifecycle, and recovery details.

## Docker Compose Deployment

Compose is Mina's supported persistent deployment. It keeps the listener on `127.0.0.1`, runs Mina as your numeric host UID/GID with a read-only container filesystem, enables authentication and database encryption, and configures scheduled backups.

### Install

Prerequisites:

- Docker Engine or Docker Desktop with `docker compose` v2 and a running daemon.
- `curl` and OpenSSL available to an ordinary non-root host user.
- An absent or empty deployment directory and an unused local port, `8080` by default.

Run the installer from anywhere:

```bash
curl -fsSL https://raw.githubusercontent.com/mishamsk/mina/main/docker/install.sh | sh -s -- --dir "$HOME/mina"
```

Use `--email you@example.com` to replace the default `admin@local`, or `--port PORT` when `8080` is unavailable. `--image IMAGE` is available for an intentional image override. The script never prompts.

Before creating state, the installer verifies its prerequisites and refuses a nonempty target or an existing Compose project, database volume, config, auth file, `.env`, or backup directory. It resolves `main` once, downloads `compose.yaml` and `.env.example` from that exact commit, and installs only the Compose file, private config and backup directories, and a mode-`0600` `.env`.

The installer generates independent database and administrator secrets, starts the service, creates the `automation` API key only through `mina auth`, stores it as `MINA_API_KEY` in `.env`, restarts Mina, then verifies health and authenticated API access. It prints the initial password and API key once on success. Copy the password, API key, and database encryption key from the private `.env` to a password manager.

If setup fails, the installer exits nonzero and removes only the files, containers, network, and volumes it created. Fix the reported cause and rerun the same command. An existing deployment is never an update target for the installer.

### Stored State

Inside the deployment directory:

- `.env` contains deployment identity and credentials, including the env-only database key and automation API key. Keep it mode `0600`, out of version control, and outside ordinary deployment backups.
- `config/config.toml` contains operational settings.
- `config/auth.toml` contains CLI-owned authentication state.
- `backups/` receives database backups.

Compose also creates project-scoped `mina-data` and `mina-cache` volumes. `mina-data` holds the portable accounting database; `mina-cache` is rebuildable provider data. The template keeps 14 database backups and schedules one daily at `03:00` UTC. Backups of an encrypted database use the same key and remain encrypted.

### Operate and Update

Run Compose commands from the deployment directory:

```bash
cd "$HOME/mina"

docker compose ps
docker compose stop
docker compose up -d
```

Update the supported `main` image after taking and copying a backup:

```bash
docker compose pull
docker compose up -d
```

Migrations move forward only; downgrades are not supported. The installer does not replace an existing deployment or refresh its Compose template.

Manage users and API keys through Mina's auth CLI, then restart the service so the new authentication snapshot takes effect:

```bash
docker compose run --rm --no-deps mina auth user list
docker compose run --rm --no-deps mina auth user add another@example.com
docker compose run --rm --no-deps mina auth api-key create another-client
docker compose restart mina
```

Trigger an immediate database backup from the browser command palette or with the installed automation key:

```bash
MINA_API_KEY="$(sed -n 's/^MINA_API_KEY=//p' .env)"
MINA_HOST_PORT="$(sed -n 's/^MINA_HOST_PORT=//p' .env)"
curl -fsS -X POST \
  -H "Authorization: Bearer $MINA_API_KEY" \
  "http://127.0.0.1:$MINA_HOST_PORT/api/background-operations/database-backup/runs"
```

`docker compose down` removes containers and the network but preserves named volumes. `docker compose down --volumes` deletes the database and cache volumes and is destructive. A backup on the same machine is useful, but only a tested independent copy is a recovery plan.

For trusted remote access, keep the Compose port bound to loopback and use an authenticated TLS proxy, SSH tunnel, or private-network loopback forwarder such as Tailscale Serve; a private network alone cannot reach a loopback-only listener. Preserve the named volumes, independent config/backup binds, non-root identity, hardening, and health check when adding a proxy overlay.

## Contributing

Ideas, bug reports, real-world workflows, and documentation feedback are welcome. Mina does not accept external pull requests; share the problem and your thinking in an issue instead. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening one.

## License

Mina is open source under the [O'Saasy License](LICENSE.md). You may use, modify, and redistribute it, but you may not offer Mina or a derivative as a competing hosted, managed, SaaS, or cloud product whose primary value is Mina's functionality. The license text is authoritative.
