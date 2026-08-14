# frontend/src/api

## Purpose

- Configures the browser REST client and exposes generated operations with thin ledger request helpers.

## Implicit Contracts

- Configure the generated client from the current browser origin; do not introduce a separate frontend API origin or handwritten endpoint/DTO contract.
- A request captures the authentication generation at dispatch. Only a `401` for that same generation may signal authentication loss, so a stale response cannot log out a newer session.
- Every configured browser request declares the `web-ui` client surface in the same interceptor that preserves authentication-generation handling.
- Every completed non-`GET` browser request emits one process-local mutation event so mounted resource views can refresh after any REST outcome.
- Normalize failures with no HTTP response as `NetworkFailure`; preserve HTTP error payloads for the shared error-message helpers.
- Helpers that return a complete lookup or management set must follow backend pagination and preserve typed filters on every page request; paged record browsers stay backend-paginated.
- Category management reads may fetch one typed intent independently so an open editor excluded by the visible filter can reconcile server-owned deleteability without replacing its draft.
- Transaction page helpers require a typed sort field and direction and pass them directly to the generated client.
- Flow-report helpers pass the shared typed anchor/window configuration without transforming report values; the accounting-history-range helper remains a separate generated read.
- Status consumes generated paged audit-entry DTO metadata and their JSON-presence flags without a persistent frontend cache; its thin response helper retains each JSON field's transport source for exact evidence formatting without JavaScript number coercion.

## Boundaries

- Owns: generated-client configuration, transport interception and normalization, and request shaping/composition needed by ledger consumers.
- Does not own: generated client output, authentication state, URL or resource-cache lifecycle, page behavior, or domain validation.
