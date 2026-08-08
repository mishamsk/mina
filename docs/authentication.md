# Authentication

## Enable It

- `auth_file` in `config.toml` is the only switch; omit it to leave authentication disabled.
- Relative paths resolve from the directory containing the loaded config file.
- Mina fails before opening listeners when a configured auth file is missing, unreadable, unsupported, or invalid.
- The auth file is separate from `config.toml` and the accounting database. **Only `mina auth` may change it; never edit it by hand.**

Native setup with an explicit config file:

```toml
# $HOME/.config/mina/config.toml
auth_file = "auth.toml"
```

```bash
mkdir -p "$HOME/.config/mina"
chmod 0700 "$HOME/.config/mina"
mina --config-file "$HOME/.config/mina/config.toml" auth init owner@example.com
mina --config-file "$HOME/.config/mina/config.toml" serve --db "$HOME/mina.duckdb"
```

Open the server URL and sign in with the password entered by `auth init`. If Mina was already running when `auth_file` was added, restart it first. Docker has its own installer and bootstrap workflow in the [README](../README.md#docker-compose-deployment).

Docker fresh initialization reads `MINA_INITIAL_ADMIN_EMAIL` and `MINA_INITIAL_ADMIN_PASSWORD` from the operator environment or private deployment `.env`, creates `auth.toml` through this CLI-owned writer, then clears both variables before Mina starts. They are ignored when operator-owned config or authentication state already exists.

The Compose installer defaults the initial email to `admin@local`, generates the password, then creates an `automation` API key through `mina auth` and restarts Mina. It stores the one-time API-key secret in the private deployment `.env`; it never edits `auth.toml` directly.

## Operate It

- `mina auth user list|add|enable|disable|set-password|revoke-sessions` manages browser users.
- `mina auth api-key list|create|revoke` manages API clients; creation displays the secret once, so store and distribute it as a password.
- Every mutation is written atomically with private permissions and takes effect only after Mina restarts.
- Password changes and `revoke-sessions` invalidate that user's previous browser cookies after restart. Logout clears only the current browser cookie.

Create and use an API key:

```bash
mina --config-file "$HOME/.config/mina/config.toml" auth api-key create automation
# Restart the running Mina process, then provide the one-time secret:
export MINA_API_KEY='<key shown once>'

curl -fsS -H "Authorization: Bearer $MINA_API_KEY" \
  http://127.0.0.1:8080/api/accounts
mina client --server http://127.0.0.1:8080 accounts list --limit 5
mina mcp stdio --server http://127.0.0.1:8080
```

Remote `mina client` and stdio MCP read `MINA_API_KEY`; local `mina client --db` remains trusted and needs no credential. Streamable HTTP MCP at `/mcp` accepts API keys only. REST accepts an API key or browser cookie.

## Security and Recovery

- Browser sessions last 180 days. Disabling a user blocks remembered sessions only while the user remains disabled; re-enabling restores any unexpired cookie unless the password changed or sessions were explicitly revoked.
- Mina serves plain HTTP and does not mark cookies `Secure`. Use only a trusted local network, or put Mina behind a TLS-terminating reverse proxy when traffic may be observed.
- Authentication is household access control, not roles or hosted identity. Authentication users are unrelated to household members.
- Filesystem permissions protect `auth.toml`. Database encryption is separate and remains controlled by `MINA_DATABASE_ENCRYPTION_KEY`.
- Mina's database backup operation does not include `config.toml` or the auth file. Back up the auth file separately with private permissions, and keep API-key copies only where their clients need them.
