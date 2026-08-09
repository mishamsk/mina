# frontend/src/api

## Purpose

- Configures the browser REST client and exposes generated operations with thin ledger request helpers.

## Implicit Contracts

- Configure the generated client from the current browser origin; do not introduce a separate frontend API origin or handwritten endpoint/DTO contract.
- A request captures the authentication generation at dispatch. Only a `401` for that same generation may signal authentication loss, so a stale response cannot log out a newer session.
- Normalize failures with no HTTP response as `NetworkFailure`; preserve HTTP error payloads for the shared error-message helpers.
- Helpers that return a complete lookup or management set must follow backend pagination; paged record browsers stay backend-paginated.

## Boundaries

- Owns: generated-client configuration, transport interception and normalization, and request shaping/composition needed by ledger consumers.
- Does not own: generated client output, authentication state, URL or resource-cache lifecycle, page behavior, or domain validation.
