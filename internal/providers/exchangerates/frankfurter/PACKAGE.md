# github.com/mishamsk/mina/internal/providers/exchangerates/frankfurter

## Purpose

- Implements `exchangerateloading` rate providers backed by Frankfurter v2 and its local USD-rate cache.

## Implicit Contracts

- Rates always use USD as the base; targeted requests reject `C::` currencies as unsupported pairs.
- Cache population accepts Frankfurter NDJSON or `application/json` arrays, requires rows to arrive in ascending date order and every row to have a valid date, USD base, uppercase three-letter quote, and positive rate, then stores them as NDJSON. Quotes may be outside Mina's currency set and must be retained.
- A malformed or empty existing cache is replaced only by a successful full refetch; an HTTP failure or malformed downloaded row leaves the existing cache untouched.
- Cache extension refetches and replaces the latest cached date so its complete quote set is retained.
- On a mid-body interruption, install only dates before the pending newest date and return non-deadline read errors. A fully framed JSON array retains its final date if trailing-data validation is interrupted.
- Cache downloads use the caller's context rather than a whole-response HTTP-client timeout. If its deadline expires after a complete date was received, population succeeds only when that safe prefix was installed.
- Population makes one attempt. Cache installation never replaces a concurrently installed cache that is equally or more current; runtime owns retries.
- HTTP and cache failures translate to the `exchangerateloading` provider error taxonomy so runtime can classify retryable failures.

## Boundaries

- Owns Frankfurter HTTP/cache I/O, response parsing, and provider-specific error translation.
- Does not own cache-directory discovery, retry policy, loading-window planning, or rate persistence.
