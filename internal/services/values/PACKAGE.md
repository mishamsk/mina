# github.com/mishamsk/mina/internal/services/values

## Purpose

- Owns shared application value types for service packages.
- Centralizes civil-date, audit-timestamp, and decimal parsing and formatting rules.

## Implicit Contracts

- Civil dates parse and format exactly as `YYYY-MM-DD`.
- Audit timestamps normalize to UTC and format as RFC3339.
- Decimals enforce `DECIMAL(18,8)` and format with exactly 8 fractional digits.

## Boundaries

- Owns: service-layer value semantics for dates, timestamps, and decimals.
- Does not own: HTTP DTOs, OpenAPI generated types, SQL scanning, SQL binding, or storage conversions.

## Testing Notes

- Cover through runtime and HTTP boundary scenarios that parse or emit these values.
