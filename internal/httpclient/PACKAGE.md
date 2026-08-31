# github.com/mishamsk/mina/internal/httpclient

## Purpose

- Generated REST client contract from `api/openapi.yaml` and remote or in-process transport construction.

## Implicit Contracts

- Generated request types carry the shared household-flow anchor/window configuration and separate accounting-history range read without client-side date alignment or report arithmetic.
- Generated transaction replacement requests preserve the required `If-Match` header and the mutually exclusive retained-record and new-record shapes from OpenAPI.
- Generated entity search requests preserve separate typed account, category, tag, and member contexts, caller bounds, exclusions, entity-shaped rows, and `has_more`; Account, Category, and Tag availability reads remain separate, and no generic entity-kind union is exposed.
- Generated entity-list requests expose shared fuzzy membership independently from canonical sorting and preserve repeated Account type filtering.
- Generated journal-record search responses expose the optional server-derived transaction display title used by record browsers.
- In-process requests synchronously invoke the supplied handler without a listener; the synthetic base URL is only for generated request construction.
- In-process responses are fully buffered, so this transport cannot support streaming response behavior.
- Callers supply an in-process handler that remains valid for the client's use; they own its runtime and lifecycle.
- Reusable request editing applies caller-declared client-surface attribution consistently to remote and in-process generated clients without changing credential behavior.

## Boundaries

- Owns generated REST client types and methods, credential and client-surface request editing, and remote or in-process transport construction.
- Contains no CLI or MCP metadata, catalogs, or wrapping invokers.
- Does not own application setup, handler lifecycle, server routing, or service behavior.
