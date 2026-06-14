# github.com/mishamsk/mina/internal/providers/exchangerates

## Purpose

- Owns exchange-rate provider package grouping.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: exchange-rate provider subpackage grouping.
- Does not own: app config source loading, runtime scheduling, SQL persistence, REST DTOs, or loader window planning.

## Testing Notes

- Concrete-provider behavior is covered through REST-bound app tests with apptest-owned HTTP fakes.
