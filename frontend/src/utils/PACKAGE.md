# frontend/src/utils

## Purpose

- Owns shared formatting and date-value helpers.

## Implicit Contracts

- Treat date-only values as local civil dates; do not parse them as UTC instants or they can display on the wrong calendar day.
- Preserve `C::` custom-currency codes as their display marker. For other currencies, use the locale's narrow symbol when available and fall back to the normalized code.

## Boundaries

- Owns: shared value transformation and display formatting.
- Does not own: browser persistence, React state, API access, or route behavior.
