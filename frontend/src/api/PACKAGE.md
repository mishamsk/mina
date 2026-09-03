# frontend/src/api

## Purpose

- Configures the browser REST client and exposes generated operations with thin ledger request helpers.

## Implicit Contracts

- Configure the generated client from the current browser origin; do not introduce a separate frontend API origin or handwritten endpoint/DTO contract.
- A request captures the authentication generation at dispatch. Only a `401` for that same generation may signal authentication loss, so a stale response cannot log out a newer session.
- Every configured browser request declares the `web-ui` client surface in the same interceptor that preserves authentication-generation handling.
- Handwritten API modules import generated runtime operations through `generated-access`, whose dependency on the configured client prevents import-order bypasses; generated types may be imported directly.
- Every completed non-`GET` browser request emits one process-local mutation event so mounted resource views can refresh after any REST outcome.
- Normalize failures with no HTTP response as `NetworkFailure`; preserve HTTP error payloads for the shared error-message helpers.
- Helpers that return a complete lookup or management set must follow backend pagination, preserve normalized search, visibility, canonical sort, and typed filters on every page request, and stop management pagination when the owning resource generation is superseded; paged record browsers stay backend-paginated.
- Category management reads may fetch one typed intent independently so an open editor excluded by the visible filter can reconcile server-owned deleteability without replacing its draft.
- Transaction page helpers require a typed sort field and direction and pass them directly to the generated client.
- The expected-transaction confirmation helper forwards the caller's actual date without deriving or normalizing schedule semantics.
- Transaction list helpers omit `filter` unless the caller supplies it or explicitly requests browser-default Expected inclusion; an explicitly empty value still reaches REST validation, while any valid expression owns lifecycle selection completely alongside separate class and search parameters.
- Complete transaction and recurring-definition replacements pass the caller's ETag through `If-Match`; responses retain the canonical ETag, and normalized failures preserve 412 so feature workflows can recover stale drafts.
- Flow-report helpers pass the shared typed anchor/window configuration without transforming report values; the accounting-history-range helper remains a separate generated read.
- Status consumes generated paged audit-entry DTO metadata and their JSON-presence flags without a persistent frontend cache; its thin response helper retains each JSON field's transport source for exact evidence formatting without JavaScript number coercion.
- Entity picker consumers compose the generated Account, Category, Tag, Member, and Transaction Template search operations with existing per-entity detail reads for selected presentation or template application and separate Account, Category, and Tag creation-availability reads where creation is enabled; handwritten API code does not add a generic picker contract or reinterpret returned order.
- Generated Account, Category, Tag, Member, Transaction Template, and Recurring Definition list operations accept backend-owned fuzzy membership; callers retain requested sorting and typed filters rather than matching list responses locally.
- Generated Account, Category, Tag, Member, Transaction Template, and Recurring Definition search operations expose separate typed ranked discovery with caller bounds and `has_more`; callers such as the command palette compose those generated operations directly without a cross-entity API union, and creation availability remains a separate Account, Category, and Tag read.

## Boundaries

- Owns: generated-client configuration, the sole handwritten runtime accessor for generated operations, transport interception and normalization, and request shaping/composition needed by ledger consumers.
- Does not own: generated client output, authentication state, URL or resource-cache lifecycle, page behavior, or domain validation.
