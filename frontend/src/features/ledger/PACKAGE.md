# frontend/src/features/ledger

## Purpose

- Owns shared ledger feature UI used by transaction browsing and entry.

## Implicit Contracts

- Transaction class, primary amounts, and record amounts come from REST responses.
- Client-derived counterparty text is display-only and must not become accounting truth.
- Client-derived counterparty titles are display-only lookup fallbacks and use `→` for transfer/exchange direction.
- Transaction-row lifted record values follow the uniformity rule in `docs/webui-design.md`; member display ignores unattributed records.
- `C::` currencies render as crypto-scale values with up to 8 decimals; other currencies render as fiat-scale 2-decimal values.
- Lookup-backed pickers use bounded REST lists and exclude hidden entities upstream.
- Entry supports the spend, income, refund, and transfer shorthand endpoints.
- Transaction-entry drafts are per tab and store UI form values only.
- The active entry tab is a persisted UI preference.
- Transfer fee rows are not expressible through the transfer shorthand endpoint.

## Boundaries

- Owns: ledger display atoms, transaction browser, bounded lookup pickers, and entry-panel UI mapping.
- Does not own: REST endpoint generation, accounting validation, or durable accounting persistence.

## Testing Notes

- Frontend e2e tests cover transaction expansion, pagination, multi-type entry, per-tab drafts, sticky entry fields, and picker keyboard submission.
