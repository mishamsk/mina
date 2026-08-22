# github.com/mishamsk/mina/internal/httpapi

## Purpose

- Adapts service use cases to the REST contract: generated OpenAPI routing and binding, transport validation, DTO mapping, and HTTP status/error mapping.
- Owns the generated OpenAPI server contract in `openapi`, derived from `api/openapi.yaml`.

## Implicit Contracts

- Generated route registration owns REST path and method declarations. `/api/openapi.json` is the only hand-registered route and serves the embedded generated specification.
- Generated binding and OpenAPI validation own declared transport shape. A matched-route guard additionally rejects unknown query names because the validator intentionally ignores them.
- Transaction responses expose the service-owned canonical `updated_at` ETag. Any operation with a required `If-Match` maps its absence to 428; the adapter otherwise forwards validators and maps service outcomes without parsing version semantics.
- Raw query parsing is limited to validation-error formatting, preserving submitted empty or duplicate values when OpenAPI defaults would otherwise obscure them.
- Generated binding, validation, and strict-handler errors all use the REST contract's stable JSON error envelope.
- Requests are bounded at 16 MiB with a specific invalid-request error. One matched-route middleware captures request JSON as downstream handlers read it, finishes unread rejected bodies asynchronously, audits every non-`GET` OpenAPI operation after its outcome is determined, defaults missing surface attribution to `rest`, rejects unsupported supplied values, applies the startup-compiled static payload-field denylist, and hands persistence off with a short deadline so the determined response is never delayed.
- External REST protection runs inside audit capture, derives public routes from OpenAPI security, accepts an API key or browser session, and requires a same-origin `Origin` for unsafe cookie-authenticated requests.
- `NewWithOptions` returns trusted, unprotected dispatch. Runtime constructs the separately protected external tree and applies MCP API-key protection around its trusted in-process handler; do not expose the trusted tree directly.
- The adapter receives only the state-read-only online authentication service; credential administration is not in its dependency graph.
- Account balances, and account-register records when running balances are requested, load current credit limits separately to derive `remaining_credit` from the reported balance. This presentation mapping must not change service balance semantics.
- Household, Category, and Tag flow operations map the shared anchor/window configuration, presentation-ready period stacks, filtered totals, and selected trend without transport-side aggregation; the accounting-history range remains a separate read, and required response collections encode as arrays, including when empty.
- Recurring-occurrence lists materialize only through the server's current civil date, while exact reads return permanent provenance and definition availability without catch-up; future-positioned transaction responses mark non-persisted recurring projections explicitly.
- Accounting-schema inspection maps the embedded service artifact directly and never reads the opened database or its catalog.
- Background-operation discovery maps every closed-registry ID to concrete status, start, typed-run, and filtered-history links.
- Audit response mapping preserves stored JSON number text instead of converting it through binary floating-point values.
- Audit response presence flags distinguish a captured JSON `null` value from an absent or invalid body.

## Boundaries

- Owns: HTTP status mapping, transport DTO conversion, REST validation/mapping, audit capture and redaction, router middleware, and generated OpenAPI server code.
- Does not own: authentication administration, database lifecycle, CLI parsing, SQL, app configuration, or service-layer validation and decisions.
