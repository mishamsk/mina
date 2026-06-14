# github.com/mishamsk/mina/internal/services/exchangerateloading

## Purpose

- Owns exchange-rate loading planning, provider-facing contracts, provider error taxonomy, and upsert use-case decisions.

## Implicit Contracts

- Loaded rates are stored as active `USD -> currency` daily rates.
- Provider-settled dates bound loading windows; there are no fiat-currency-specific hard cutoffs.

## Boundaries

- Owns: provider-facing loading contracts, provider error taxonomy, load-window planning, and active USD-pair upsert decisions.
- Does not own: runtime scheduling, HTTP DTOs, SQL queries, database row types, or concrete network clients.

## Testing Notes

- Loader behavior is covered through REST-bound app tests with fake provider dependencies.
