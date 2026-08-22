# Plaid MVP Working Decisions

Status: temporary working design and ordered chunk sequence — a plan of plans. Each chunk becomes its own committed implementation plan when claimed. It is not a fleet plan, a Kata roadmap, or a replacement for Mina's owning architecture and semantics documents.

## Delivery constraints

- Every chunk ends at a REST-provable surface and is independently reviewed and confirmed working through app tests (and generated CLI where applicable) before the next chunk starts. Mina has no unit tests, so no chunk may end as an internal package or service without a REST consumer.
- Every chunk before the final gates requires no Plaid account, credentials, or network. The real adapter is compiled and exercised against SDK-shaped fixture responses throughout, so Sandbox is a verification gate, not the first proof that the architecture fits Plaid.
- New code stays off the production path: new packages, new tables, new REST resources. Existing user flows are untouched until the concrete operation is registered, and even then startup loading is disabled and its schedule empty.
- No user-facing Plaid screens until the dedicated UI chunk. The Status-page operation module is pattern-required admin plumbing and lands with the concrete operation; connection and mapping flows come last before the real-Plaid gates.

## Existing foundation

Already in the repo; chunks build on it and must not recreate it:

- `imported_record_metadata` stores provider-neutral fields, provider status and dates, external provenance, and raw payload JSON. It is store-level only; no import service or pipeline exists.
- Journal records carry `reconciliation_status` (`RECONCILED`/`UNRECONCILED`), a writable `imported` source, and `external_id`/`external_system`; `POST /api/records/bulk/reconciliation` already exists.
- `account.external_system`/`account.external_id` are the canonical external-account link; do not create a second competing account mapping.
- The concrete background-operation pattern — status/start/run-detail across REST, generated CLI/MCP with run-wait, and the Status UI — is proven by three shipped operations; `plaid-transaction-loading` becomes the fourth.
- Provider-layer precedent: service-owned narrow interfaces, concrete packages under `internal/providers/`, wiring in `internal/runtime`, depguard enforcement. Background runners call services, never providers.
- Test precedent: domain-level fake providers injected through `runtime.Dependencies` and apptest options, and injected in-memory HTTP transports serving fixture JSON against a real adapter.
- Hand-written CLI/MCP extension hooks (`clientcli.RegisterExtensions`, `mcpserver.Extension`) exist and are unused; the headless Link flow is their first user.

Gaps this plan must build rather than reuse:

- No secret-sealing mechanism exists for runtime-created secrets; the env-only key precedent (`MINA_DATABASE_ENCRYPTION_KEY`) exists, but encrypting per-Item access tokens at rest is new machinery.
- Demo mode is startup-seed-only; no runtime flag reaches provider selection today, so forcing a mock provider in demo is new machinery.
- Operation-run records are in-memory and non-portable; sync cursors must live in portable accounting state, committed atomically with the changes they cover.
- No reconciliation workflow semantics exist anywhere; `docs/accounting-semantics.md` deliberately excludes them.

## Ordered chunks

### 1. Settle import semantics and contracts

- Define how an imported bank-side record becomes a balanced Mina transaction under the minimal reconciliation scope: counterpart account/category choice, `UNRECONCILED` marking, pending-to-posted replacement, and removal semantics.
- Define the persistent connection, discovered-account, mapping, and cursor model around the existing account external IDs and `imported_record_metadata`.
- Fix the REST resource names, the Link-session state machine below, the token-sealing format, the needs-relink recovery semantics, the secret-rotation re-seal workflow, and the Plaid config/env shape.
- Record durable outcomes in the owning semantics docs and OpenAPI before implementation relies on them; update package docs as chunks land.
- Proof: reviewed docs only; no code.

### 2. State foundation and mock connection creation

- Add migrations and store access for connection metadata, discovered accounts with mapping decisions, and cursor checkpoints.
- Persist per-Item access tokens in the accounting database as ciphertext sealed with a key derived (HKDF) from the env-only Plaid `client_id` and `secret`, behind a service-owned sealing contract; runtime supplies the derived key. No new files and no extra env vars.
- Add the `github.com/plaid/plaid-go` dependency, the concrete `internal/providers/imports/plaid` adapter, and the deterministic mock implementing the same service-owned interface.
- Implement the minimal Link-session REST machine — create, observe, complete, plus failure and expiry — enough to turn a mock Link completion into one persistent connection with its sealed token persisted. Update mode and the browser callback come later.
- Proof: app tests complete a mock Link session through REST and observe the persisted connection; a fixture-transport test drives the real adapter's token exchange through the actual SDK without sockets.

### 3. Account discovery and mapping

- Refresh a connection's provider account inventory and expose connections and discovered accounts over REST.
- Support mapping each discovered account to an existing compatible Mina balance account or creating one through normal account behavior, marking it ignored, or leaving it `unmapped`; newly appearing provider accounts return to `unmapped`.
- Add explicit CLI/MCP exposure decisions for every new operation.
- Proof: app tests drive discovery and mapping end to end against the mock connection; fixture-transport coverage for the real adapter's accounts call.

### 4. Cursor-safe loading and the concrete operation

- Add the loading service that consumes `/transactions/sync`-shaped pages and applies added, modified, and removed transactions atomically with the cursor; restart the page sequence from the original cursor after `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`.
- Make replay idempotent through provider external IDs and preserve raw payloads in `imported_record_metadata`; import only mapped accounts and report unmapped-account work instead of guessing.
- Register the `plaid-transaction-loading` operation with startup disabled and an empty schedule, following the existing concrete status/start/run-detail pattern including the Status-page module and CLI run-wait.
- Proof: app tests trigger manual runs against scripted mock cursor pages covering initial import, pending-to-posted, removal, mutation restart, and idempotent replay; imported records visible through existing transaction REST with `UNRECONCILED` status.

### 5. Demo mock-connection scenario

- Add the runtime machinery for `mina serve --demo` to force the deterministic mock provider even when real Plaid settings exist.
- Seed one completed mock connection, realistic discovered accounts, and explicit account mappings; do not preload imported transactions or schedule loading.
- Script successive mock cursors so manual runs from the Status UI, REST, or CLI demonstrate initial imports, a pending-to-posted change, a removal, and an idempotent no-op, all visible in the existing transaction UI.
- Proof: this chunk is the first manual-confirmation surface; a frontend e2e exercise of the demo trigger path plus reviewer walkthrough.

### 6. Full Link-session lifecycle

- Extend the session machine with update mode tied to an existing connection (never a duplicate connection), the browser callback route, and restart-safe expiry of unfinished sessions.
- Completion exchanges the public token exactly once; retries while pending or after success are idempotent.
- Proof: app tests cover update-mode recovery, callback validation, expiry, and exactly-once exchange against the mock; fixture-transport coverage for `/link/token/get` and update-mode requests.

### 7. Headless CLI Link flow

- Add the hand-written REST-backed CLI workflow (first extension-hook user): create a session, open or print the Hosted Link URL, and poll the Mina session until terminal; the backend owns `/link/token/get`, so a browser on another device needs no callback.
- Add headless commands for listing and mapping accounts, starting a manual load, and waiting on the run where the generated surface is not already sufficient.
- Proof: app tests plus a CLI e2e script against the mock.

### 8. UI connection and mapping flows

- Connection is initiated from account pages: an account (or the accounts list) launches Hosted Link for its institution, resumes through the callback route, and pre-suggests mapping the originating account among the discovered ones. Link is Item-scoped, so one login discovers all of that institution's accounts.
- Ongoing management lives under Settings: institution list with health, needs-relink/update-mode repair for connection errors and consent renewal, and review of unmapped and ignored discovered accounts. Account pages also surface their own connection state and relink entry.
- Plaid client credentials are configured entirely outside the UI via env vars; frontend receives only Mina session IDs, hosted URLs, statuses, and safe metadata — never public tokens, access tokens, or Plaid credentials.
- Proof: frontend e2e with the mock provider covering account-page initiation, callback, mapping, manual loading, and Settings management.

### 9. Real-Plaid gates

- Add a credential-gated, opt-in Sandbox smoke suite with only a few cases: create/exchange a Sandbox Item via `/sandbox/public_token/create` (no Link automation), discover accounts, consume `/transactions/sync`, and one update/error scenario. Placement needs a `docs/TESTING.md` decision and a Justfile-owned recipe.
- Run one manual Sandbox Hosted Link check for the callback flow.
- Finish with a Plaid Trial Item manual acceptance matrix over representative OAuth and non-OAuth institutions before enabling scheduled loading or calling the integration production-ready.

## Decisions

### Provider and initial scope

- Plaid is a provider under Mina's existing provider concept: concrete adapter at `internal/providers/imports/plaid`, service-owned interface, wired by `internal/runtime`. No new generic provider framework.
- Plaid is the only aggregation provider in the MVP; use Plaid's Transactions product for discovery and sync.
- Initial institution targets: TD Bank, Barclays US, Discover, Capital One, Chase, Marcus, American Express. Fidelity is not required.
- Mina is single-household: one Plaid credential set, one stable `client_user_id`. No users, per-user credentials, ownership, or credential selection.
- The household supplies its own Plaid Trial credentials (ten-Item allowance; an Item is one institution login). Mina ships no shared secret.

### Reconciliation scope

- Minimal, status-only: imports post as real balanced transactions flagged `UNRECONCILED` and immediately affect balances; the counterpart account/category choice is settled in chunk 1.
- The existing bulk reconciliation endpoint and normal transaction editing are the reconciliation workflow for the MVP.
- Matching imports to existing manual or recurring transactions, inboxes, and classification stay in the backlog katas (`dw1v`, `s1kz`, `m2jn`, `p0xt`); when matching lands it must run recurring lazy catch-up before matching, per the contract recorded on kata `y4v6`.

### SDK and boundary

- Use Plaid's official Go SDK for API types, requests, and transport. SDK types do not escape the concrete provider package; the consuming service owns the narrow interface, Mina-shaped inputs and results, and normalized errors.
- Plaid client credentials and access tokens never enter frontend code or raw REST responses.
- Config follows the existing flat domain-section precedent in `internal/appconfig` (like exchange rates), not a generic providers section. Plaid `client_id` and `secret` are env-only (`MINA_PLAID_CLIENT_ID`, `MINA_PLAID_SECRET`), following the `MINA_DATABASE_ENCRYPTION_KEY` precedent, and never appear in settings output.

### State and secrets

- Plaid access tokens are per Item (one institution login covering all its accounts), created at runtime by Link completion, and never expire; there is no refresh mechanism, so losing one requires Link update mode for that institution. Short-lived link and public tokens remain in-process Link-session state only.
- Access tokens persist in the accounting database as ciphertext sealed with a key derived (HKDF) from the env-only Plaid `client_id` and `secret`. No secrets file and no separate key env var; the two Plaid env vars are the whole secret surface. An access token is useless without those same credentials on every Plaid call, so sealing gives up nothing versus a dedicated key.
- Connection identity, household `client_user_id`, account mappings, cursors, and imported provenance travel with the accounting database so moving it cannot silently duplicate imports.
- A database opened without the same Plaid credentials cannot unseal tokens and degrades connections to a needs-relink condition; Link update mode repairs them without creating duplicate connections or Items. A legitimate move with the same env credentials keeps connections working. Backups carry only ciphertext.
- Rotating the Plaid secret changes the derived key without invalidating tokens on Plaid's side, so rotation is an explicit workflow: re-seal stored tokens under the new secret, or accept re-Linking every institution.

## Stateful connection and account-mapping design

### State ownership

| State | Lifetime and owner |
| --- | --- |
| Plaid client ID and environment secret | Env-only household-wide credentials; immutable for a running process and never exposed through APIs or settings output. |
| Plaid access token (per Item) | Accounting database as ciphertext sealed with a key derived from the env-only Plaid credentials; plaintext never in browser state, REST responses, or on disk. |
| Household `client_user_id` | One stable opaque value in portable accounting state; all household Items use it. |
| Completed connection/Item identity | Portable accounting state with safe institution metadata and last known connection condition. |
| Discovered provider account and mapping decision | Portable accounting state: `unmapped`, `mapped`, or `ignored`; mapped identity reuses Mina account external fields. |
| Transactions Sync cursor | Portable accounting state, committed atomically with the updates it covers. |
| Imported record provenance | Portable `imported_record_metadata`, including normalized fields and raw provider JSON. |
| Link session | Short-lived process state; losing it requires restarting Link but cannot corrupt a completed connection. |
| Operation runs | Existing in-memory operation-run storage; accounting effects and cursor commits remain portable. |

### Provisional REST resources

Exact OpenAPI names are finalized in chunk 1; every operation gets explicit CLI/MCP exposure decisions in `api/client-surfaces.yaml`.

- `POST /api/providers/plaid/link-sessions` creates an initial or update-mode session and returns a Mina session ID, Hosted Link URL, expiry, and status.
- `GET /api/providers/plaid/link-sessions/{id}` observes state without returning Plaid secrets or tokens.
- `POST /api/providers/plaid/link-sessions/{id}/complete` asks the backend to query `/link/token/get`, exchange a newly available public token exactly once, and return the new state; safe to retry while pending or after success.
- `GET /api/providers/plaid/link-sessions/{id}/callback` is a browser navigation adapter: it validates the opaque session ID and redirects to the Mina UI. The callback alone is not proof of success, and no token belongs in its URL.
- Connection and discovered-account resources expose health, account inventory, and mapping decisions; mapping mutations are explicit and independently usable by generated clients.
- Transaction loading uses the concrete background-operation APIs, not a generic provider action endpoint.

### Link-session state machine

Mina exposes stable states; Plaid event details remain provider metadata. `succeeded` is terminal only after token exchange and connection persistence finish. A browser return is recorded separately and never implies success.

```text
create -> pending -> succeeded
                  -> exited
                  -> expired
                  -> failed
```

- CLI polling calls Mina REST, not Plaid; the backend owns `/link/token/get`, token exchange, and state transitions. UI completion uses the same backend transition.
- Update mode creates a new transient session tied to an existing connection and must never create a duplicate completed connection.
- A truly headless bank login does not exist; a headless Mina process prints a Hosted Link URL, the household completes it in any browser, and Mina polls its own REST session without inbound webhooks.
- Production bank login is interactive; Mina never collects bank credentials. Public server-to-server webhooks are not required for the MVP.
- Reauthentication, consent renewal, and account-selection changes reuse the existing Item through Link update mode rather than creating another Item.

### Testing

- App tests exercise all Plaid-facing behavior through the in-process generated REST client with the mock provider injected at runtime composition; no real network.
- The mock covers Link completion, failure and expiry, discovery, paginated sync, modified and removed transactions, mutation-during-pagination restart, provider errors, and update-mode recovery.
- Fixture-transport tests drive the real adapter and official SDK through an injected in-memory HTTP transport, catching request/response mapping drift without sockets or credentials.
- Sandbox smoke tests are a small credential-gated opt-in set behind a Justfile recipe; they verify wiring, not app scenarios, and their taxonomy placement is a `docs/TESTING.md` decision in chunk 9.

## Demo behavior

- `mina serve --demo` always selects the deterministic import mock and cannot contact Plaid, even when Plaid credentials are present. This demo-to-provider-selection plumbing is new machinery built in chunk 5.
- Demo seeding creates one completed mock connection, realistic discovered accounts, and explicit mappings; it preloads no imported transactions and schedules nothing.
- Successive manual runs return deterministic cursor pages: initial unreconciled imports, a pending-to-posted change plus another transaction, a removal, then an idempotent no-op — all reviewable in the existing transaction UI under the minimal reconciliation scope.

## Open design questions

- Which counterpart account or category do imported records post against before a human categorizes them (chunk 1)?
- What callback URL works for the supported local UI deployment modes while satisfying Plaid's Production OAuth redirect requirements?
- Which representative institutions form the minimal Trial acceptance matrix?

## Plaid references

- [Link overview](https://plaid.com/docs/link/)
- [Hosted Link](https://plaid.com/docs/link/hosted-link/)
- [OAuth guide](https://plaid.com/docs/link/oauth/)
- [Transactions Sync](https://plaid.com/docs/api/products/transactions/#transactionssync)
- [Plaid Sandbox](https://plaid.com/docs/sandbox/)
- [Official Go SDK](https://github.com/plaid/plaid-go)
