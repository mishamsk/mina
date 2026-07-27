# frontend/src/features/accounts

## Purpose

- Owns the chart-of-accounts screen resource loading, mutation refresh coordination, and Accounts-specific presentation.

## Implicit Contracts

- The Accounts page uses one bounded accounts fetch joined with balances for `owned` and `party` accounts and filters that snapshot client-side.
- Mutations refresh Accounts, featured balances, Overview, and ledger lookups so account pickers see current account state.
- Account register and header snapshots discard fetch writes that predate invalidation; single-account metadata responses may merge into a mounted header instead.
- Account and group registers include expected recurring records after one occurrence catch-up read per mounted register; expected records stay excluded from running balances.
- Account deletion controls consume the API `deletable` signal verbatim; eligibility rules remain backend-owned.
- Fixed `system` accounts remain visible and selectable where ledger references are allowed, but Accounts and account-detail surfaces expose no mutation controls for them.

## Boundaries

- Owns: Accounts page resource snapshots, Accounts screen UI, and account mutation refresh fan-out.
- Does not own: REST endpoint generation, accounting validation, route registration, app shell navigation, or transaction entry workflows.

## Testing Notes

- Frontend e2e tests cover Accounts page rendering, URL-backed toolbar state, and side-panel account workflows.
