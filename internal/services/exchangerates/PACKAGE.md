# github.com/mishamsk/mina/internal/services/exchangerates

## Purpose

- Owns source exchange-rate use cases and repository contract.
- Derives prospective signed USD amounts from source rates.

## Implicit Contracts

- USD derivation copies the signed amount; non-USD derivation divides by an active `USD -> currency` rate.
- Non-USD conversion uses an exact rate or linear interpolation strictly inside two brackets. Missing brackets, a rounded-zero result, and decimal overflow return `nil`.
- Derivation does not persist or backfill values; callers decide whether to use its result, while `transactions` owns backfill of unresolved journal records.
- A create conflicts only with an active rate for the same currency pair and effective timestamp; tombstoned rates do not block a new active rate.

## Boundaries

- Owns: source-rate validation, lifecycle use cases, and signed USD derivation.
- Does not own: provider loading, dense-rate cache construction, journal-record backfill, persistence, or transport mapping.
