# github.com/mishamsk/mina/internal/providers

## Purpose

- Owns concrete external or local data providers for facts and artifacts such as exchange rates, bank transactions, or database backups.

## Implicit Contracts

- Providers implement service-owned interfaces.
- Production concrete providers are constructed and imported only by runtime composition.
- Inbound provider data is not Mina accounting state until a service accepts and persists it.
- Backup providers own destination artifacts, not Mina's opened accounting database.

## Boundaries

- Owns: network/file side effects, external request construction, response parsing, destination artifact lifecycle, and provider-specific error normalization.
- Does not own: app config source loading, SQL persistence, REST DTOs, CLI parsing, runtime composition, or domain decisions.

## Testing Notes

- Concrete provider behavior is covered through runtime-bound app tests or integration smoke tests.
