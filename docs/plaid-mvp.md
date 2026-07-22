# Plaid MVP Working Decisions

## Minimal MVP checklist

- Define the portable, operational, secret, and transient state needed for Plaid.
- Add Plaid under Mina's existing provider architecture using Plaid's official Go SDK.
- Build a deterministic mock provider so normal development and app tests need no Plaid credentials or network.
- Add one-household Plaid configuration, connection, account-discovery, and account-mapping capabilities.
- Import and incrementally synchronize Plaid transactions without duplicates or cursor loss.
- Expose transaction loading as a concrete manual/background operation through REST, CLI, and UI.
- Extend demo mode with a forced mock connection and manual transaction-loading run for reconciliation demos.
- Support CLI Link and update-mode flows through Hosted Link plus Mina REST polling.
- Support UI Link and update-mode flows through a Mina REST callback and explicit session state.
- Add only a very small, opt-in Plaid Sandbox smoke suite before validating a Trial connection.

Status: temporary working design and ordered implementation sequence. It is not
a fleet plan, Kata roadmap, or replacement for Mina's owning architecture and
semantics documents.

## Ordered implementation sequence

Steps 1–9 must be implementable without a Plaid account, Plaid credentials, or
real network calls. The real Plaid adapter is still compiled and exercised
against SDK-shaped fixture responses throughout, so Sandbox is a verification
gate rather than the first proof that the architecture fits Plaid.

### 1. Settle import, reconciliation, and state contracts

- Define how an imported bank-side record becomes a balanced Mina transaction,
  how `UNRECONCILED` affects user workflows, and what matching, confirmation,
  pending-to-posted replacement, and removal mean.
- Define the persistent connection, discovered-account, mapping, sync-cursor,
  and provider-provenance model around the existing account external IDs and
  `imported_record_metadata` model.
- Finalize the provisional REST resources and state machines described below.
- Record durable outcomes in the owning semantics, data-model, architecture,
  OpenAPI, and package documents before implementation relies on them.

### 2. Add the persistent state foundation

- Add the minimum portable accounting tables and store access needed for one
  household's connection metadata, discovered accounts, mapping decisions, and
  cursor checkpoints.
- Reuse `account.external_system` and `account.external_id` as the canonical
  external-account link; do not create a second competing account mapping.
- Add a persistent local secret-state mechanism for Plaid access tokens outside
  the portable accounting database. Exact storage and file-permission behavior
  is resolved in Step 1.

### 3. Establish the Plaid provider seam and deterministic mock

- Add the official `github.com/plaid/plaid-go` dependency and the concrete
  `internal/providers/imports/plaid` adapter.
- The consuming import/loading service owns the narrow provider interface and
  Mina-shaped inputs, results, and normalized errors. Plaid SDK types do not
  escape the concrete provider package.
- Add a deterministic mock implementation for app tests and demo mode.
- Exercise the real adapter through the app boundary with an injected in-memory
  HTTP transport and representative Plaid JSON fixtures. This uses the actual
  SDK serialization without opening a network socket.

### 4. Deliver account discovery and mapping

- Add REST operations to list connections and discovered provider accounts and
  to map or ignore each account.
- Mapping supports linking to an existing Mina account or creating a compatible
  Mina balance account, while preserving an explicit unmapped state.
- Add generated CLI/MCP exposure decisions and app tests through the in-process
  REST client using the mock provider.
- Add the minimal UI state for reviewing unmapped, mapped, and ignored accounts.

### 5. Deliver cursor-safe transaction loading

- Add a loading service that consumes `/transactions/sync`-shaped pages and
  applies added, modified, and removed transactions atomically with the cursor.
- Restart a whole page sequence from the original cursor after Plaid's
  `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` error.
- Make replay idempotent through provider external IDs and preserve raw Plaid
  payloads in `imported_record_metadata`.
- Import only mapped accounts; report unmapped-account work instead of silently
  dropping or guessing a Mina account.

### 6. Add the concrete operation and demo/reconciliation scenario

- Register a named `plaid-transaction-loading` operation following Mina's
  existing concrete status/start/run-detail pattern.
- Initially disable startup loading and leave its schedule empty. The REST API,
  generated clients, Status UI, and CLI can trigger and observe manual runs.
- In `mina serve --demo`, force the deterministic mock provider even if real
  Plaid settings exist, seed one mock connection and its account mappings, and
  perform no automatic load.
- Script successive mock cursors so manual runs demonstrate initial imports,
  pending-to-posted modification, removal, and idempotent no-op replay.
- Make the resulting imported records visible in the minimal reconciliation
  workflow established in Step 1 so the demo proves loading and reconciliation,
  not merely that rows were inserted.

### 7. Implement the Link-session REST state machine

- Implement create, observe, advance/complete, callback, and expiry behavior
  against the mock provider first.
- A successful completion exchanges the public token exactly once and creates
  one persistent connection; retries are idempotent.
- Use the same state machine for initial Link and update mode.
- Keep short-lived Link tokens, hosted URLs, and callback-return state outside
  portable accounting data; a process restart may expire an unfinished Link
  session without damaging a completed connection.

### 8. Add the headless CLI flow

- Add a hand-written REST-backed CLI workflow that creates a Mina Link session,
  opens the Hosted Link URL when possible, always prints it as a fallback, and
  polls/advances the Mina REST session until terminal.
- Support a browser on another device: the browser callback is optional for the
  CLI because Mina can learn completion through Plaid `/link/token/get`.
- Add headless commands for listing discovered accounts, mapping/ignoring them,
  starting a manual load, and waiting for the concrete operation run.

### 9. Add the UI callback and recovery flows

- Add a connection/mapping screen that launches Hosted Link, resumes through
  the REST callback route, and renders the Link-session state machine.
- Add update-mode actions for connection errors and consent renewal.
- Keep public tokens, access tokens, and Plaid credentials out of frontend state;
  the UI receives only Mina session IDs, hosted URLs, statuses, and safe metadata.
- Prove browser callback, mapping, manual loading, and reconciliation with the
  mock provider in the existing frontend e2e class.

### 10. Cross the real-Plaid gates

- Add a credential-gated, opt-in Sandbox smoke recipe with only a few cases:
  create/exchange a Sandbox Item without automating Link, discover accounts,
  consume `/transactions/sync`, and exercise one update/error scenario.
- Use Plaid's Sandbox-only `/sandbox/public_token/create` to keep automation
  independent of Plaid Link UI changes.
- Run one manual Sandbox Link check for Hosted Link and the callback flow.
- Finally, use a Plaid Trial Item for a small manual acceptance matrix covering
  representative OAuth and non-OAuth institutions before enabling scheduled
  loading or declaring the integration production-ready.

## Decisions

### Provider and initial scope

- Plaid is a provider under Mina's existing provider concept. The concrete
  adapter belongs at `internal/providers/imports/plaid`, implements a
  service-owned interface, and is wired by `internal/runtime`.
- Plaid is the only aggregation provider in the MVP; do not create a new generic
  provider framework beyond the boundaries Mina already has.
- Use Plaid's Transactions product for account discovery and transaction sync.
  “Authentication” below means the Plaid Link connection flow, not Plaid's ACH
  Auth product.
- Initial institution targets are TD Bank, Barclays US, Discover, Capital One,
  Chase, Marcus, and American Express. Fidelity support is not required for the
  MVP.
- Mina is a single-household system with one Plaid credential set and one stable
  Plaid `client_user_id`. Do not model users, per-user credentials, ownership,
  invitations, or credential selection.
- The household supplies its own Plaid Trial credentials. Mina does not ship or
  operate a shared Plaid secret.
- Plaid's Trial allowance is ten Items, where an Item is normally one
  institution login and can contain multiple accounts.

### SDK and boundary

- Use Plaid's official Go SDK for Plaid API types, requests, and transport.
- Follow the existing provider boundary: the consuming service owns a narrow
  interface; the Plaid package owns authentication, SDK requests/responses,
  network side effects, and Plaid error normalization; runtime owns selection
  and construction.
- Plaid client credentials and access tokens never enter frontend code.
- Client credentials and access tokens are local secret/operational state, not
  portable accounting data. Connection identity, household client ID, account
  mappings, cursors, and imported provenance must travel with the accounting
  database so moving it cannot silently duplicate imports.

## Stateful connection and account-mapping design

### State ownership

| State | Lifetime and owner |
| --- | --- |
| Plaid client ID and environment secret | One household-wide local configuration/secret set; immutable for a running process and never exposed through write APIs. |
| Plaid access token | Persistent local secret state keyed by Mina connection ID; never stored in browser state or raw REST responses. |
| Household `client_user_id` | One stable opaque value in portable accounting state; all household Items use it. |
| Completed connection/Item identity | Portable accounting state, with safe institution metadata and last known connection condition. |
| Discovered provider account and mapping decision | Portable accounting state: `unmapped`, `mapped`, or `ignored`; mapped identity reuses Mina account external fields. |
| Transactions Sync cursor | Portable accounting state and committed atomically with the updates it covers. |
| Imported record provenance | Portable `imported_record_metadata`, including normalized fields and raw provider JSON. |
| Link session | Short-lived process state; losing it requires restarting Link but cannot corrupt a completed connection. |
| Operation runs | Existing process-local operation-run storage; accounting effects and cursor commits remain portable. |

### Provisional REST resources

The exact OpenAPI names are finalized in Step 1, but the resource behavior is:

- `POST /api/providers/plaid/link-sessions` creates an initial or update-mode
  session and returns a Mina session ID, Hosted Link URL, expiry, and status.
- `GET /api/providers/plaid/link-sessions/{id}` observes state without returning
  Plaid secrets or tokens.
- `POST /api/providers/plaid/link-sessions/{id}/complete` asks the backend to
  query `/link/token/get`, exchange a newly available public token exactly once,
  and return the new state. It is safe to retry while pending or after success.
- `GET /api/providers/plaid/link-sessions/{id}/callback` is a browser navigation
  adapter. It validates the opaque session ID and redirects to the Mina UI; the
  callback alone is not proof of success, and no token belongs in its URL.
- Connection and discovered-account resources expose health, account inventory,
  and `unmapped`/`mapped`/`ignored` decisions. Mapping mutations are explicit and
  independently usable by generated clients.
- Plaid transaction loading uses concrete background-operation APIs rather than
  a generic provider action endpoint.

### Link-session state machine

Mina exposes stable states such as `pending`, `succeeded`, `exited`, `expired`,
and `failed`; Plaid event details remain provider metadata. `succeeded` is
terminal only after token exchange and connection persistence finish. A browser
return is recorded separately and never implies success.

```text
create -> pending -> succeeded
                  -> exited
                  -> expired
                  -> failed
```

- CLI polling calls Mina REST, not Plaid directly. The backend owns
  `/link/token/get`, token exchange, and state transitions.
- UI completion uses the same backend transition. The callback merely brings the
  browser back to Mina and lets the UI resume observing/advancing the session.
- Update mode creates a new transient Link session tied to an existing
  connection. It must never create a duplicate completed connection.
- A truly headless bank login does not exist. A headless Mina process can print
  a Hosted Link URL, let the household complete it in any browser, and poll the
  Mina REST session without requiring an inbound webhook or browser callback.

### Account discovery and mapping state

- Successful initial Link creates a connection and refreshes its provider
  account inventory, but does not guess Mina account matches.
- Each discovered account is explicitly mapped to one Mina balance account or
  marked ignored. Newly appearing provider accounts return to `unmapped`.
- Mapping may select an existing compatible Mina account or create one through
  normal account behavior. The integration must not bypass account service
  validation.
- Transaction loading processes only mapped accounts and reports unmapped
  accounts as actionable work. Ignored accounts are intentionally skipped.
- REST is the owning capability boundary. UI and headless CLI are equal clients
  of the same discovery and mapping resources.

### Link flows

- Production bank login is interactive; Mina will not collect bank credentials
  or attempt an API-only/headless login.
- CLI flow: Mina REST creates a Hosted Link session; the CLI opens or prints its
  URL and polls the Mina session while the backend uses `/link/token/get`.
- UI flow: Mina opens Hosted Link with a completion callback URL understood by
  the REST API. The callback returns navigation to the UI, which resumes the
  same backend-owned session and completion logic.
- A browser callback is distinct from a Plaid server-to-server webhook. Public
  webhooks are not required for the MVP.
- Initial and ongoing transaction updates use `/transactions/sync` with a saved
  cursor. Manual loading is delivered first; scheduling stays disabled until
  the manual and demo workflows are proven.
- Reauthentication, consent renewal, and account-selection changes reuse the
  existing Item through Link update mode rather than creating another Item.

### Testing

- The normal app-test suite exercises Plaid-facing behavior through Mina's
  in-process generated REST client and a mock Plaid backend injected at runtime
  composition. These tests make no real network calls.
- The mock covers successful Link completion, failures and expiry, account
  discovery, paginated transaction sync, modified and removed transactions,
  mutation-during-pagination restart, provider errors, and update-mode recovery.
- A runtime-bound fixture mode exercises the real Plaid adapter and official SDK
  through an in-memory HTTP transport. It complements the domain-level mock by
  detecting request/response mapping drift without real sockets or credentials.
- Keep only a very small set of credential-gated, opt-in integration smoke tests
  against Plaid Sandbox. They verify SDK/request wiring and representative Link
  and transaction-sync behavior; they do not use real financial accounts or
  duplicate app-test scenarios.
- Sandbox smoke tests must fit Mina's existing test taxonomy and run through a
  Justfile-owned recipe. Exact placement is decided before implementation.
- Automated Sandbox tests bypass Link with `/sandbox/public_token/create`;
  Hosted Link itself receives only a small manual smoke check.

## Demo behavior

- `mina serve --demo` always selects the deterministic import mock and cannot
  contact Plaid, even when Plaid credentials are present in the environment.
- Demo seeding creates one completed mock connection, realistic discovered
  accounts, and explicit Mina account mappings. It does not preload imported
  transactions.
- Plaid transaction loading has startup disabled and no schedule in demo mode.
  The Status UI, REST API, or CLI manual trigger starts it.
- Successive manual runs return deterministic cursor pages: initial
  unreconciled imports, a pending-to-posted change plus another transaction, a
  removal, and then an idempotent no-op.
- The demo data must be usable in the minimal reconciliation workflow, including
  observing unmatched imports and confirming or matching them according to the
  semantics settled in Step 1.

## Open design questions

- How are pending, posted, modified, and removed Plaid transactions represented
  without violating Mina's accounting and import semantics?
- Does an unreconciled import immediately affect balances, or remain a candidate
  until confirmation/matching? Step 1 must settle this before loading persists
  imported records.
- What is the concrete local secret-store mechanism and recovery behavior when a
  portable database is moved without its Plaid access tokens?
- What callback URL works for the supported local UI deployment modes while
  satisfying Plaid's Production OAuth redirect requirements?
- Which representative institutions form the minimal Trial acceptance matrix?

## Plaid references

- [Link overview](https://plaid.com/docs/link/)
- [Hosted Link](https://plaid.com/docs/link/hosted-link/)
- [OAuth guide](https://plaid.com/docs/link/oauth/)
- [Transactions Sync](https://plaid.com/docs/api/products/transactions/#transactionssync)
- [Plaid Sandbox](https://plaid.com/docs/sandbox/)
- [Official Go SDK](https://github.com/plaid/plaid-go)
