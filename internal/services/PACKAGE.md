# github.com/mishamsk/mina/internal/services

## Purpose

- Documents the app-owned service package pattern for Stage 1 domain use cases.
- Implemented Stage 1 service packages are `accounts`, `categories`, `tags`, `members`, `exchangerates`, `creditlimits`, `transactions`, and `values`; `journalrecords` and `recordbulk` remain target packages.

## Implicit Contracts

- Service packages own domain types, validation, use cases, and repository interfaces.
- Service packages must not import HTTP, OpenAPI, TUI, scheduler, SQL, generated DB, Cobra, process I/O, store, or runtime packages.
- Public service structs and repository contracts carry app-owned value types for civil dates, audit timestamps, and decimals.
- Callers must provide service-declared types; transport string parsing belongs to the owning adapter.

## Boundaries

- Owns: domain rules and repository contracts for app behavior.
- Does not own: HTTP DTOs, transport string parsing, database row types, SQL queries, process configuration, or generated adapter code.

## Testing Notes

- Prefer boundary scenario tests through runtime and HTTP adapters; add focused service tests only when boundary coverage cannot isolate a domain rule clearly.
