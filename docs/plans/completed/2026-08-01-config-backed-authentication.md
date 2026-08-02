# Plan: Config-backed network authentication

## Goal

Add optional, low-friction authentication for Mina's browser UI, REST API, and MCP endpoint. Operators enable it by setting `auth_file` in `config.toml`; a dedicated CLI owns the referenced authentication file, browser sessions remain stateless and long-lived, and API clients authenticate with revocable keys.

## Constraints

- `auth_file` is the only authentication switch: absent means disabled with today's behavior unchanged; present means enabled. Resolve relative paths against the loaded `config.toml` directory, and fail startup clearly when the file is missing, unreadable, unsupported, or invalid.
- Keep the authentication file separate from `config.toml` and the database. Use a versioned TOML format containing a cookie-signing secret; users with stable IDs, unique normalized emails, enabled state, password hashes, and session versions; and API keys with stable IDs, unique labels/prefixes, revocation state, and one-way token digests. Do not relate authentication users to members.
- The authentication file is maintained only through `mina auth` commands. Commands must use secret-safe input, generate secrets with the platform cryptographic RNG, rewrite atomically with private permissions, never disclose stored password hashes or signing material, and state that changes take effect after restart. The server loads one immutable startup snapshot and never writes or live-reloads the file.
- Use Argon2id password hashes, SHA-256 digests of high-entropy generated API keys, constant-time secret comparisons, and a vetted JWT implementation with an explicitly pinned signing algorithm and validated token type, issuer, audience, issued-at, expiry, user ID, and session version. Never store raw passwords or API keys; reveal a newly generated API key only once.
- Browser sessions use an `HttpOnly`, `SameSite=Strict`, path-wide cookie with a 180-day expiry for household convenience. Mina continues to serve HTTP only and does not add TLS, forwarded-scheme trust, or conditional `Secure` cookie behavior; a reverse proxy owns HTTPS, transport hardening, and any cookie-flag rewriting. Password changes and explicit user-session revocation increment the persisted session version, invalidating all prior cookies after restart. Logout clears the local cookie; individual sessions are not server-side records and cannot be revoked independently.
- REST accepts either the browser session cookie or `Authorization: Bearer <API key>`. MCP accepts API keys only. Keep the health endpoint, OpenAPI document, UI assets, login endpoint, and authentication-status endpoint public; protect all financial, operational, demo, and settings APIs plus `/mcp`. Preserve the existing MCP Origin policy, and reject unsafe cookie-authenticated REST requests whose Origin does not match the request origin.
- Remote `mina client --server` and `mina mcp stdio --server` requests read their API key from `MINA_API_KEY` and send it as a bearer credential without logging or exposing it in settings. Direct database CLI commands and the MCP server's already-authorized internal REST dispatch remain trusted local paths and do not require credentials.
- This is local-household access control, not a hosted identity system: no roles, member linkage, email verification, password recovery, refresh tokens, auth administration UI/REST, or per-session database. Authentication adds no local-file protection: database files retain Mina's separately documented optional at-rest encryption through `MINA_DATABASE_ENCRYPTION_KEY`, while auth-file secrecy depends on filesystem permissions. Documentation must also state that remembered browsers remain logged in and plain HTTP on an untrusted LAN exposes credentials and tokens.
- Keep testscript coverage to at most five new smoke scenarios across the feature, targeting three or fewer. Prove application behavior primarily with app-tests, do not duplicate it in e2e-tests, prefer extending an existing testscript scenario over adding another, strive to add no testscript helpers, and never add a helper used by only one scenario. Frontend e2e tests are not part of this numeric cap; keep them focused on distinct real-browser and embedded-runtime behavior rather than REST scenario coverage.

## Success Criteria

- [ ] With no `auth_file`, Mina's UI, REST, MCP, local CLI, and remote clients retain their current behavior; with `auth_file` configured, invalid configuration fails closed before listeners start.
- [ ] `mina auth` can initialize the configured file with its first user; list, add, enable, and disable users; change a password; revoke a user's sessions; and create/list/revoke API keys. Mutations are atomic, private, CLI-only, and require restart, and API-key plaintext is shown only at creation.
- [ ] An unauthenticated browser sees a login screen before the application shell, a valid user gets a long-lived signed session, logout and expired/revoked/invalid sessions return to login, and no credential is written to browser storage.
- [ ] REST consistently distinguishes public and protected endpoints, accepts valid cookies or API keys, returns stable unauthenticated/forbidden JSON errors, applies Origin protection to cookie-authenticated mutations, and rejects invalid, disabled, expired, or wrong-kind credentials.
- [ ] `/mcp` and both remote Mina client modes work with a valid API key and reject absent or revoked keys, while embedded MCP-to-REST dispatch does not introduce a redundant credential layer.
- [ ] A fresh Docker Compose deployment enables authentication by default, creates a private auth file with the documented bootstrap login, prominently tells the operator to change that password, and preserves both changed credentials and deliberate auth configuration across its supported lifecycle. Existing deployments are never silently opted in or overwritten.
- [ ] OpenAPI, generated clients, client-surface exclusions, configuration metadata, package contracts, operator documentation, Docker config guidance, and `PROJECT_STATE.md` describe the implemented behavior without exposing authentication secrets. The authentication documentation explicitly says the auth file must only be changed with `mina auth`.
- [ ] `just pre-commit`, `just test`, `just test-integration`, `just test-frontend-e2e`, and `just test-docker` pass.

- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-01-config-backed-authentication.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Establish the CLI-owned authentication file

Add the optional `auth_file` setting without giving `internal/appconfig` write responsibility. Introduce a focused authentication boundary that owns the versioned file model, validation, password hashing, signing/key generation, immutable loading, and atomic CLI mutations. Provide `mina auth` initialization and user/API-key lifecycle commands that discover the file through the normal config path and can initialize a not-yet-existing target.

As directional command-tree context rather than a fixed naming contract, keep the agreed shape compact: `mina auth init`; `mina auth user list|add|enable|disable|set-password|revoke-sessions`; and `mina auth api-key list|create|revoke`.

- [ ] App-tests cover auth-disabled and auth-enabled startup, path resolution, representative valid and invalid files, credential verification, session-version invalidation, immutable loading, and redacted failures through test-owned temporary state.
- [ ] One testscript smoke exercises representative CLI initialization and mutation through real config discovery, secret input/output, private file creation, and restart messaging; the full schema and command matrix are not duplicated at the process boundary.
- [ ] Package documentation records file ownership, side effects, security invariants, and the separation between source-loaded app configuration and CLI-managed authentication state.
- [ ] Commit as `add CLI-managed authentication configuration`.

### Task 2: Enforce authentication at network boundaries

Define the login, logout, and authentication-status REST contract in OpenAPI, explicitly exclude those operations from generated CLI/MCP surfaces, and regenerate transport clients. Compose authentication around the external REST and MCP handlers so public routes stay reachable, protected REST routes accept the correct credential kinds, MCP accepts API keys only, and internal MCP REST dispatch remains behind the single outer authorization decision. Add bearer-key support to Mina's remote REST and stdio-MCP client modes.

- [ ] App-tests prove public/protected routing, login and logout semantics, cookie claims and expiry, password and session-version checks, API-key checks, credential-kind restrictions, Origin enforcement, stable error mapping, fail-closed startup, restart-applied revocation, and secret-free logs/errors.
- [ ] Extend the existing MCP/remote-client testscript smoke where practical to prove real-listener bearer enforcement and `MINA_API_KEY` forwarding by both remote modes; do not repeat REST credential scenarios already covered by app-tests.
- [ ] Runtime, HTTP API/client, MCP, CLI, and authentication package contracts document where authentication is enforced and which internal paths are trusted.
- [ ] Commit as `enforce authentication on Mina network transports`.

### Task 3: Add the browser login lifecycle

Bootstrap public authentication status before rendering the application shell. When authentication is enabled, show an email/password login screen until a valid session exists, expose logout globally, and return to login after any protected request reports an invalid session; when disabled, preserve the current startup path. Keep credentials and session tokens out of IndexedDB, local storage, and frontend application state beyond the submitted password's request lifetime.

- [ ] Frontend tests cover status bootstrapping, login validation and errors, logout, protected-request expiration, and the auth-disabled path without coupling to generated-client internals.
- [ ] Frontend e2e tests cover the useful real-browser workflows across login, protected-shell access, remembered sessions across reloads, logout/session loss, and auth-disabled startup without duplicating frontend or app-test scenarios.
- [ ] Frontend architecture and web UI design documentation record the public bootstrap/login boundary and session-loss behavior.
- [ ] Commit as `add the browser authentication lifecycle`.

### Task 4: Enable authentication for fresh Docker deployments

Change the shipped Docker config template to reference its colocated auth file. Extend first-serve initialization so a completely fresh config bind safely and retryably creates both files through the same CLI-owned auth writer, with private permissions and the bootstrap user `admin@local` / `password`. Print a prominent change-password warning. Never overwrite an existing config or auth file, never silently recreate a missing file for an existing configured deployment, and keep pre-feature deployments without `auth_file` disabled until their operator opts in.

- [ ] Extend the existing Docker lifecycle test, without creating a parallel Docker test path, to cover default authentication and warning, private file modes, authenticated reachability, password change plus restart, persistence across recreation/image replacement, and preservation of existing operator-owned config/auth state.
- [ ] The Docker quick start and operator commands use `mina auth` inside the Compose deployment to change the bootstrap password and maintain users/API keys, followed by the required service restart; no documentation tells users to edit the auth file.
- [ ] Commit as `enable auth for fresh Docker deployments`.

### Task 5: Document and verify household operation

Add concise owning authentication documentation and update the README, configuration/settings contracts, architecture docs, and project state. Document the CLI-only auth-file workflow, restart requirement, backup separation, API-key distribution, long-lived-cookie tradeoff, existing database-encryption boundary, and recommendation to use a trusted LAN or TLS-terminating reverse proxy when traffic can be observed.

- [ ] A documented native setup works by configuring `auth_file`, initializing it and its first user through `mina auth`, restarting, logging in, creating an API key, and using it with REST/MCP without manually editing the auth file; Docker operation is owned by Task 4.
- [ ] Validation listed in Success Criteria passes from a clean worktree, with generated files current and no secrets or temporary auth artifacts tracked.
- [ ] Commit as `document config-backed authentication`.
