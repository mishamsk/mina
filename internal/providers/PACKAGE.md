# github.com/mishamsk/mina/internal/providers

## Purpose

- Owns concrete external or local data providers for facts such as exchange rates or bank transactions.

## Implicit Contracts

- Providers implement service-owned interfaces.
- Provider data is not Mina accounting state until a service accepts and persists it.

## Boundaries

- Owns: network/file side effects, external request construction, response parsing, and provider-specific error normalization.
- Does not own: app config source loading, SQL persistence, REST DTOs, CLI parsing, or domain decisions.

## Testing Notes

- Concrete provider behavior is covered through runtime-bound app tests or integration smoke tests.
