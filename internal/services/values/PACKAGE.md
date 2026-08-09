# github.com/mishamsk/mina/internal/services/values

## Purpose

- Owns shared civil-date, decimal, and currency value rules for service packages.

## Implicit Contracts

- `CivilDate` is UTC midnight: `CivilDateFromTime` selects a UTC calendar day, while `LocalCivilDateFromTime` selects the source location's day. Choose deliberately around UTC boundaries.
- `Decimal` is bounded to `DECIMAL(18,8)` and always formats with eight fractional digits. Addition and subtraction are exact at that scale; multiplication and division use half-to-even rounding to it before revalidating the bounds.
- Fiat currency codes must be canonical ISO 4217 codes. Crypto codes need only a non-empty, whitespace-trimmed suffix after `C::`; callers must not assume ticker or case validation.

## Boundaries

- Owns value validation, normalization, and arithmetic bounds.
- Does not own transport or persistence conversions, or domain-specific amount and currency compatibility rules.
