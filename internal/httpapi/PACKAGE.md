# github.com/mishamsk/mina/internal/httpapi

## Purpose

- Adapts service use cases to the REST contract: generated OpenAPI routing and binding, transport validation, DTO mapping, and HTTP status/error mapping.
- Owns the generated OpenAPI server contract in `openapi`, derived from `api/openapi.yaml`.

## Implicit Contracts

- Generated route registration owns REST path and method declarations. `/api/openapi.json` is the only hand-registered route and serves the embedded generated specification.
- Generated binding and OpenAPI validation own declared transport shape. A matched-route guard additionally rejects unknown query names because the validator intentionally ignores them.
- Raw query parsing is limited to validation-error formatting, preserving submitted empty or duplicate values when OpenAPI defaults would otherwise obscure them.
- Generated binding, validation, and strict-handler errors all use the REST contract's stable JSON error envelope.
- `ProtectREST` derives public routes from OpenAPI security, accepts an API key or browser session, and requires a same-origin `Origin` for unsafe cookie-authenticated requests.
- `New` returns trusted, unprotected dispatch. Runtime applies REST protection before external exposure and applies MCP API-key protection around its trusted in-process handler; do not expose `New` directly.
- The adapter receives only the state-read-only online authentication service; credential administration is not in its dependency graph.
- Account balances, and account-register records when running balances are requested, load current credit limits separately to derive `remaining_credit` from the reported balance. This presentation mapping must not change service balance semantics.
- Household, Category, and Tag flow operations map the shared anchor/window configuration, presentation-ready period stacks, filtered totals, and selected trend without transport-side aggregation; the accounting-history range remains a separate read, and required response collections encode as arrays, including when empty.

## Boundaries

- Owns: HTTP status mapping, transport DTO conversion, REST validation/mapping, router middleware, and generated OpenAPI server code.
- Does not own: authentication administration, database lifecycle, CLI parsing, SQL, app configuration, or service-layer validation and decisions.
