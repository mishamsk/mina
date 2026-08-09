# github.com/mishamsk/mina/internal/services/exchangeratecache

## Purpose

- Owns dense daily exchange-rate snapshot rebuild orchestration and read use cases.

## Implicit Contracts

- Active accounting `USD -> currency` exchange rates are the only source of truth; the runtime snapshot is disposable and eventually consistent.
- At most one rebuild runs at a time; overlapping requests are successful no-ops and use of the currently committed snapshot continues.
- A failed or canceled rebuild preserves the previous complete snapshot; initial rebuild failure leaves a usable empty snapshot.
- Dense rows span each currency's first through last active source date, preserve exact rates, linearly interpolate only bounded gaps, and record whether each row is interpolated.
- Snapshot reads use deterministic currency/date ordering, typed filters, and bounded pagination without exposing runtime identifiers.

## Boundaries

- Owns: rebuild admission, rebuild use-case orchestration, dense-rate read types, filter validation, and repository contracts.
- Does not own: source-rate writes, SQL interpolation or replacement, runtime-schema identifiers, transport mapping, or transaction backfill policy.

## Testing Notes

- Dense-rate behavior is covered through runtime-constructed REST boundary tests using the generated client.
