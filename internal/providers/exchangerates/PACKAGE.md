# github.com/mishamsk/mina/internal/providers/exchangerates

## Purpose

- Groups concrete exchange-rate provider packages.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Does not own: provider-facing contracts, load-window planning, rate persistence, or runtime composition; these belong to `internal/services/exchangerateloading`, the rate service, and `internal/runtime`.
