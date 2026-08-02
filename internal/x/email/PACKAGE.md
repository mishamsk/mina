# internal/x/email

## Purpose

- Owns pure, app-agnostic email canonicalization and minimal shape checks.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: normalization and minimal shape validation for email identity values.
- Does not own: authentication, account existence, deliverability, or transport behavior.

## Testing Notes

- Covered through app and process scenarios of package consumers; no package-specific unit tests.
