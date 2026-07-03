# github.com/mishamsk/mina/internal/services/exchangerateloading

## Purpose

- Owns exchange-rate loading planning, provider-facing contracts, and provider error taxonomy.

## Implicit Contracts

- Loaded rates are stored as active `USD -> currency` daily rates.
- The loader plans provider windows only; `exchangerates.Service` owns `exchange_rate` writes.
- Provider-settled dates bound loading windows; there are no fiat-currency-specific hard cutoffs.
- A tracked currency is any non-USD currency seen in active journal records.
- Forward loading is unconditional for tracked currencies, even when all records already have `amount_usd`.
- Historical back-loading starts only from unresolved record dates that lack exact active rates.
- A newly tracked currency with no unresolved missing dates starts at the provider-settled date, not its earliest record date.

## Boundaries

- Owns: provider-facing loading contracts, provider error taxonomy, and load-window planning.
- Does not own: runtime scheduling, HTTP DTOs, SQL queries, database row types, or concrete network clients.

## Testing Notes

- Loader behavior is covered through REST-bound app tests with fake provider dependencies.
