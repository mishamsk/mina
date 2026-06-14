# github.com/mishamsk/mina/internal/providers/exchangerates/frankfurter

## Purpose

- Owns Frankfurter v2 exchange-rate provider clients.

## Implicit Contracts

- Targeted API requests use `base=USD`, `quotes=<currency>`, and date ranges.
- Cache population requests use `base=USD`, all available quotes, and NDJSON streaming.
- File-provider rows must be Frankfurter v2 NDJSON objects with `date`, `base`, `quote`, and `rate`.
- Cache row quotes are provider-owned three-letter uppercase ASCII codes and may be outside Mina's accepted domain currency set.
- Cache rows are ordered ascending by `date`; tail checks use the final row date.
- Cache population performs one bounded attempt; runtime retry policy owns subsequent attempts.
- Existing caches are extended by refetching the latest cached date through the requested end date.
- Interrupted cache streams may install validated partial rows, then still return the read error.
- Partial cache installs drop the newest streamed date because that date may be incomplete.
- HTTP status failures and malformed streamed rows leave the existing cache untouched.
- Weekend and holiday gaps are accepted by using only returned rows.

## Boundaries

- Owns: Frankfurter HTTP requests, fixed cache file name under Mina's app cache directory, cache file writes, cache file reads, response parsing, and provider-specific row mapping.
- Does not own: app config source loading, cache directory discovery, SQL persistence, REST DTOs, or loader window planning.

## Testing Notes

- Concrete behavior is covered through runtime-bound app tests, integration smoke tests, and fixture-backed cache tests.
