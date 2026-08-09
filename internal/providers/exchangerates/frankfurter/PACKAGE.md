# github.com/mishamsk/mina/internal/providers/exchangerates/frankfurter

## Purpose

- Implements `exchangerateloading` rate providers backed by Frankfurter v2 and its local USD-rate cache.

## Implicit Contracts

- Rates always use USD as the base; targeted requests reject `C::` currencies as unsupported pairs.
- Cache rows are validated Frankfurter NDJSON (`date`, USD `base`, three-letter uppercase `quote`, positive `rate`) in ascending date order. Quotes may be outside Mina's currency set and must be retained.
- A malformed or empty existing cache is replaced only by a successful full refetch; an HTTP failure or malformed downloaded row leaves the existing cache untouched.
- Cache extension refetches and replaces the latest cached date so its complete quote set is retained.
- On an interrupted cache stream, install only fully received dates and still return the read error; the pending newest date is discarded because it may be incomplete.
- Population makes one attempt. Cache installation never replaces a concurrently installed cache that is equally or more current; runtime owns retries.
- HTTP and cache failures translate to the `exchangerateloading` provider error taxonomy so runtime can classify retryable failures.

## Boundaries

- Owns Frankfurter HTTP/cache I/O, response parsing, and provider-specific error translation.
- Does not own cache-directory discovery, retry policy, loading-window planning, or rate persistence.
