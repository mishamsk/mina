# github.com/mishamsk/mina/internal/services/exchangeratecache

## Purpose

- Owns dense daily exchange-rate snapshot rebuild orchestration and reads.

## Implicit Contracts

- The snapshot is a disposable derivation of active accounting `USD -> currency` rates. Source-rate writes do not refresh it, so callers must schedule rebuilds and reads may lag those writes.
- Each service instance admits one rebuild at a time. An overlapping request succeeds without waiting or scheduling another rebuild.
- A rebuild publishes a complete replacement or preserves the previous snapshot; an unavailable initial snapshot reads as empty.
- Each destination currency spans its first through last active source date; exact rates are retained, only bracketed gaps are interpolated, and derived rows are marked.

## Boundaries

- Owns: rebuild admission, snapshot-query validation, and the repository boundary.
- Does not own: source-rate writes, snapshot construction or persistence, rebuild scheduling, transport mapping, or transaction backfill.
