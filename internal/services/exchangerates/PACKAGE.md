# github.com/mishamsk/mina/internal/services/exchangerates

## Purpose

- Owns exchange-rate domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- The exchange-rate service is the only service-level writer for `exchange_rate` rows.
- Signed amount-USD derivation copies signed USD amounts.
- Non-USD derivation uses active `USD -> currency` rates: exact lookup date first, linearly interpolated interior gaps second, else `NULL`.
- `NULL` amount-USD is the only unresolved signal; inferred persisted values are not recomputed by this service.

## Boundaries

- Owns: currency validation, typed rate validation, typed filter validation, signed amount-USD derivation, tombstoned use-case rules, and active-rate conflict mapping.
- Does not own: HTTP DTOs, transport string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Exchange-rate behavior is covered through runtime-constructed boundary tests.
