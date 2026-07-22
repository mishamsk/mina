# Plaid MVP Working Decisions

## Minimal MVP checklist

- Add a Plaid integration boundary backed by Plaid's official Go SDK.
- Add local configuration for each user's Plaid Trial credentials and environment.
- Create Plaid Link sessions and exchange successful public tokens without exposing secrets to the browser.
- Support CLI connection through Hosted Link in the system browser plus `/link/token/get` polling.
- Support UI connection through a browser callback URL handled by Mina's REST API.
- Discover Plaid accounts and map them explicitly to Mina accounts.
- Import and incrementally synchronize Plaid transactions without creating duplicates.
- Handle broken connections and expired consent through Plaid Link update mode.
- Cover application behavior with an in-process mock Plaid backend and no real network calls.
- Keep only a very small, opt-in smoke suite against Plaid Sandbox.

Status: temporary design and scope record. It is not an implementation plan,
roadmap, or replacement for Mina's owning architecture and semantics documents.

## Decisions

### Provider and initial scope

- Plaid is the only aggregation provider in the MVP; do not build a generic
  multi-provider framework.
- Use Plaid's Transactions product for account discovery and transaction sync.
  “Authentication” below means the Plaid Link connection flow, not Plaid's ACH
  Auth product.
- Initial institution targets are TD Bank, Barclays US, Discover, Capital One,
  Chase, Marcus, and American Express. Fidelity support is not required for the
  MVP.
- Each Mina household supplies its own Plaid Trial credentials. Mina does not
  ship or operate a shared Plaid secret.
- Plaid's Trial allowance is ten Items, where an Item is normally one
  institution login and can contain multiple accounts.

### SDK and boundary

- Use Plaid's official Go SDK for Plaid API types, requests, and transport.
- Keep the application-facing boundary narrow and owned by Mina. Its purpose is
  to isolate the external network and make app tests deterministic, not to
  anticipate additional aggregation providers.
- Plaid client credentials and access tokens never enter frontend code.
- The storage location and portability policy for Plaid credentials, access
  tokens, cursors, Item metadata, and account mappings must be settled before
  implementation.

### Link flows

- Production bank login is interactive; Mina will not collect bank credentials
  or attempt an API-only/headless login.
- CLI flow: Mina creates a Hosted Link session, opens its URL in the user's
  browser, and polls `/link/token/get` until the session succeeds, fails, or
  expires.
- UI flow: Mina opens Link in the browser with a callback URL understood by the
  REST API. The callback identifies the Mina Link session; the backend verifies
  completion with Plaid and performs the public-token exchange.
- A browser callback is distinct from a Plaid server-to-server webhook. Public
  webhooks are not required for the MVP.
- Initial and ongoing transaction updates use `/transactions/sync` with a saved
  cursor. Manual or scheduled polling is sufficient for the MVP.
- Reauthentication, consent renewal, and account-selection changes reuse the
  existing Item through Link update mode rather than creating another Item.

### Testing

- The normal app-test suite exercises Plaid-facing behavior through Mina's
  in-process generated REST client and a mock Plaid backend injected at runtime
  composition. These tests make no real network calls.
- The mock covers successful Link completion, failures and expiry, account
  discovery, paginated transaction sync, modified and removed transactions,
  provider errors, and update-mode recovery.
- Keep only a very small set of credential-gated, opt-in integration smoke tests
  against Plaid Sandbox. They verify SDK/request wiring and representative Link
  and transaction-sync behavior; they do not use real financial accounts or
  duplicate app-test scenarios.
- Sandbox smoke tests must fit Mina's existing test taxonomy and run through a
  Justfile-owned recipe. Exact placement is decided before implementation.

## Open design questions

- Which Plaid and mapping state is portable accounting data, and which is local
  operational or secret state?
- What is the exact REST resource model for Link sessions, the browser callback,
  connection status, account mapping, and synchronization runs?
- How are pending, posted, modified, and removed Plaid transactions represented
  without violating Mina's accounting and import semantics?
- Does the MVP sync only on explicit user action, or also through an existing
  background-operation schedule?
- What callback URL works for the supported local UI deployment modes while
  satisfying Plaid's Production OAuth redirect requirements?

## Plaid references

- [Link overview](https://plaid.com/docs/link/)
- [Hosted Link](https://plaid.com/docs/link/hosted-link/)
- [OAuth guide](https://plaid.com/docs/link/oauth/)
- [Transactions Sync](https://plaid.com/docs/api/products/transactions/#transactionssync)
- [Official Go SDK](https://github.com/plaid/plaid-go)
