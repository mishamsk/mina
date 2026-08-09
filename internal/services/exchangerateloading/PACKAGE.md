# github.com/mishamsk/mina/internal/services/exchangerateloading

## Purpose

- Owns exchange-rate load planning and execution, provider-facing contracts, and provider error taxonomy.

## Implicit Contracts

- Needed currencies are a lazily loaded snapshot of the repository's active non-USD journal-record currencies. Invalidate it whenever those currencies can change; otherwise later loads can omit newly used currencies.
- For every tracked currency, loading begins at its latest active USD rate (inclusively) through the provider's settled date. If an unresolved record lacks an exact rate before that point, it instead backfills from seven days before the earliest such date to retain an interpolation bracket.
- A provider that cannot report a settled date uses the loader clock's current civil date. A latest rate after the settled date suppresses that currency's request.
- Provider results are passed as active `USD -> currency` daily upserts. Providers must return rates for the requested currency and window; this service does not verify that association.
- Unsupported pairs and unavailable dates skip only their currency. Other provider errors do not stop remaining currencies: successful rates are persisted together, then the first error is returned.
- Provider implementations must wrap transient outages in `ErrProviderUnavailable` or `ErrProviderTimeout`; runtime classifies only those errors as retryable.

## Boundaries

- Owns: provider-facing loading contracts, error taxonomy, load-window planning, and rate-load orchestration.
- Does not own: runtime scheduling or retry policy, exchange-rate validation or persistence, HTTP DTOs, SQL queries, database row types, or concrete providers.
