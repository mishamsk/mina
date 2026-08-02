# Plan: Align authentication architecture and deployment bootstrap

## Goal

Bring the completed authentication work back under Mina's established service/provider architecture, simplify API-key revocation state, and make fresh Docker Compose setup use operator-supplied secrets through a conventional `.env.example` workflow.

## Constraints

- Establish the owning architecture before changing packages. Keep `docs/architecture.md` at its intended boundary-map level: name `internal/services` and `internal/providers`, their general responsibilities and dependency direction, and runtime's composition role without cataloging authentication implementation details.
- Authentication has two distinct peer service boundaries: state-read-only online authentication in `internal/services/authentication/online`, and mutable CLI administration in `internal/services/authentication/administration`. The concrete implementation lives in `internal/providers/authentication/file`; do not retain `internal/authn` as an exceptional top-level application boundary or collapse the two services into one capability.
- `internal/httpapi` depends only on the online authentication service through `httpapi.Dependencies`. HTTP continues to own bearer/cookie parsing, public-route selection, cookie attributes, same-origin enforcement, and transport error mapping; authentication is not an HTTP adapter option.
- Authentication administration is intentionally CLI-only, like offline database validation. Do not add administration operations to OpenAPI, REST, generated clients, MCP, or the HTTP dependency graph; the existing login, logout, and status endpoints remain online authentication operations.
- Runtime resolves `auth_file`, constructs the file provider, composes the immutable online service for long-running use, and separately composes the mutable administration service for `mina auth`. `cmd/mina` must not import concrete providers or service packages.
- Keep `auth_file` as the only authentication switch and keep the authentication file separate from config and accounting state. Do not add provider registries, provider-selection config, or other speculative backends.
- Preserve the existing authentication contract except for the two approved changes: revoking an API key removes its record, and fresh Compose deployments receive initial credentials from operator environment input instead of a hard-coded login.
- Preserve the current cryptographic, secret-redaction, private-permission, atomic-write, immutable-startup-snapshot, trusted-local-dispatch, and restart-applied-change guarantees.
- The version-one auth-file format on this unmerged branch may be corrected in place: do not add revoked-key tombstones or migration machinery for the discarded `revoked` field.
- `.env.example` contains placeholders and guidance, never usable credentials. Initial-admin variables are Docker first-initialization inputs only, are cleared before the long-running process starts, and do not enter app config or settings. Database encryption remains optional only as an explicit operator choice.
- Task 1 installs the authentication boundary in depguard before imports move. Its lint validation may remain red only for the enumerated existing `internal/authn` imports; later tasks must remove those violations and must not weaken, remove, or exempt the new guardrails.
- Extend the existing app-test, testscript, frontend-e2e, and Docker lifecycle coverage where relevant; do not create another test class or duplicate scenarios across boundaries.

## Success Criteria

- [ ] `docs/architecture.md` concisely defines the general service/provider boundaries, while the online service, administration service, and file-provider `PACKAGE.md` files own the detailed authentication responsibilities and dependency contract.
- [ ] Depguard permanently rejects the legacy `internal/authn` boundary and enforces the documented service/provider direction without exceptions for authentication call sites.
- [ ] HTTP, MCP protection, and runtime startup receive only the state-read-only online service; `mina auth` reaches the separate administration service through runtime; no adapter or CLI imports the concrete file provider; and `internal/authn` no longer exists.
- [ ] OpenAPI and generated client surfaces contain login, logout, and authentication status but no user, session-revocation, or API-key administration operations.
- [ ] Authentication-disabled behavior, public/protected routing, browser sessions, API-key authentication, trusted local dispatch, fail-closed configured startup, and CLI administration remain observably unchanged.
- [ ] Revoking an API key removes it from the authentication file and list output, immediately permits its label to be reused, and causes the removed token to fail after the documented restart.
- [ ] Fresh Compose setup is documented as fetching the supported deployment artifacts, copying `.env.example` to `.env`, editing or pre-exporting the database-encryption key and initial admin credentials, then running `docker compose pull` and `docker compose up -d`; no hard-coded bootstrap password remains.
- [ ] Existing Compose deployments and existing operator-owned config/auth files remain untouched, while interrupted fresh initialization remains safely retryable.
- [ ] `just pre-commit`, `just test`, `just test-integration`, `just test-frontend-e2e`, and `just test-docker` pass.

- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-01-align-authentication-architecture-and-bootstrap.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Establish the service/provider architecture contract

Update `docs/architecture.md` first as a concise map of the general package boundaries: explicitly name `internal/services` and `internal/providers`, record that consuming services own provider-facing contracts, and require production concrete providers to be visible only to runtime composition. Remove the special `internal/authn` root without turning this document into an authentication design catalog, and align the root service/provider package docs with those general statements.

- [ ] Preserve the architecture-level REST rule that authentication administration and offline database validation are deliberate CLI-only operational capabilities; detailed authentication service ownership stays in package docs.
- [ ] Create the authentication namespace doc plus owning `online`, `administration`, and file-provider `PACKAGE.md` files before their Go implementations. These owning docs define the detailed allowed flow: HTTP calls only the online service; runtime composes both services with their file-provider capabilities; appconfig only resolves `auth_file`; and CLI delegates administration through runtime.
- [ ] The online-service doc owns password authentication, API-key verification, and stateless session issuance/verification over immutable startup state. The administration-service doc owns initialization plus user, session-version, and API-key lifecycle mutations and explicitly records that this capability is CLI-only and absent from REST/OpenAPI/MCP.
- [ ] The file-provider doc owns filesystem and credential-material side effects and describes its separate immutable online and mutable administration implementations without making transport or CLI decisions.
- [ ] Update `.golangci.yml` in the same commit to reject imports of the legacy `internal/authn` path, prevent `internal/httpapi` and the online service from importing the administration service, and enforce any authentication visibility rule not already covered by the generic service/provider depguard rules. Do not add temporary exemptions for current imports.
- [ ] Run the repository-owned lint recipe and record that any failure is limited to the known legacy imports that Task 2 will remove. The guardrail lands first as an intentional migration lock and may not be relaxed in later tasks.
- [ ] Commit as `chore(arch): establish authentication package boundaries`.

### Task 2: Refactor authentication behind two service boundaries

Introduce the two authentication service packages and file-provider implementation described by Task 1, moving existing behavior rather than layering duplicate validation or cryptography. The online service reads immutable provider state and performs password authentication, API-key verification, and stateless session issuance/verification without mutation. The administration service owns initialization, listing, user enablement/password/session-version changes, and API-key creation/revocation through a mutable provider capability.

- [ ] Both services own their types, errors, use cases, and provider contracts without HTTP, OpenAPI, Cobra, appconfig, runtime, or concrete-provider knowledge; the online service has no dependency on or access to administration capabilities.
- [ ] The file provider owns the versioned TOML representation, filesystem locking and atomic replacement, private modes, immutable loading, and file-specific credential material without reading appconfig or making HTTP decisions, and exposes distinct implementations of the two service-owned contracts.
- [ ] Runtime supplies only the online service through `httpapi.Dependencies` and retains the isolated trusted REST handler behind MCP's single outer authorization decision. It exposes administration to `mina auth` through a runtime-owned CLI entry point comparable to `ValidateDatabase`, without placing the administration service in the running app or handler dependency graph.
- [ ] `cmd/mina`, `internal/httpapi`, and `internal/mcpserver` have no concrete-provider imports; HTTP and MCP have no administration-service imports; runtime is the only production composition package that imports the concrete file provider and constructs both services.
- [ ] `api/openapi.yaml`, generated REST clients, and client-surface catalogs gain no authentication-administration operations.
- [ ] All Task 1 depguard rules pass after the legacy package and imports are removed; do not edit those rules except to tighten them with a documented reason.
- [ ] Existing authentication app-tests and process smokes prove behavior stayed stable across disabled/enabled startup, login/session verification, API-key verification, CLI mutation, restart application, and secret-safe failures.
- [ ] Commit as `refactor(auth): enforce service-provider boundaries`.

### Task 3: Remove revoked API-key records

Change file-backed revocation to delete the selected key record rather than persist a revoked flag. Keep `revoke` as the user-facing operation, but make listing and the file schema represent active credentials only; key labels become reusable after removal.

- [ ] The version-one file model, secret-free views, validation, immutable verification state, CLI rendering, fixtures, and owning docs contain no revoked-key field or tombstone semantics.
- [ ] Existing boundary tests prove a removed token is rejected after restart, the removed key is absent from list output and persisted TOML, unrelated keys remain valid, and the removed label can be used for a new key.
- [ ] Commit as `fix(auth): remove revoked API key records`.

### Task 4: Make fresh Compose bootstrap environment-driven

Add a supported Docker `.env.example` covering Compose identity values, `MINA_DATABASE_ENCRYPTION_KEY`, and initial administrator email/password. Forward the bootstrap-only credential variables through Compose and consume them only while safely creating a fresh auth file; remove the hard-coded `admin@local` / `password` path. Update the README, authentication guidance, and Docker package contract around the copy-edit-start workflow.

- [ ] A fresh deployment fails clearly before installing partial config when required bootstrap credentials are absent or left as placeholders, while pre-exported environment variables can override `.env` values and an intentionally empty encryption key retains the documented plaintext behavior.
- [ ] Bootstrap still initializes through the CLI-owned authentication writer, installs config last, uses private permissions, preserves existing files, and retries safely after interruption.
- [ ] Docker lifecycle coverage supplies non-default credentials, proves authenticated startup and encrypted database use, checks preservation across restart/recreation, and verifies existing deployments ignore later bootstrap-variable changes.
- [ ] Documentation uses `cp .env.example .env`, manual human/agent editing or pre-exported variables, `chmod 0600 .env`, `docker compose pull`, and `docker compose up -d`; it no longer instructs operators to begin with or immediately replace a shared default password.
- [ ] Commit as `fix(docker): configure fresh deployment secrets from env`.
