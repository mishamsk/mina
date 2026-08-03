# frontend/src/features/accounts

## Purpose

- Owns the chart-of-accounts screen resource loading, mutation refresh coordination, and Accounts-specific presentation.

## Implicit Contracts

- The Accounts page uses one bounded accounts fetch joined with balances for `owned` and `party` accounts and filters that snapshot client-side.
- Mutations refresh Accounts, featured balances, Overview, and ledger lookups so account pickers see current account state.
- Account register and header snapshots discard fetch writes that predate invalidation; single-account metadata responses may merge into a mounted header instead.
- Account and group registers run one occurrence catch-up read per mount, then use the default record query that excludes expected recurring records.
- Account deletion controls consume the API `deletable` signal verbatim; eligibility rules remain backend-owned.
- Accounts-tree credit-limit indicators consume the API `has_credit_limit_history` signal rather than inferring history from balance rows.
- Fixed `system` accounts remain visible and selectable where ledger references are allowed, but Accounts and account-detail surfaces expose no mutation controls for them.
- Account leaves in the Accounts tree render full FQNs with custom display-label overrides in parentheses; headers, group balance rows, and register account columns render effective display labels with full-FQN tooltips. Tree grouping, search, sorting, and restructure behavior remains FQN-owned.
- Account create/edit forms initialize the optional label from `display_label_override`; blank writes `null` to restore automatic FQN-derived presentation.
- Account and credit-limit presentation follows the owning [Accounts specification](../../../../docs/webui-design.md#5-accounts-chart-of-accounts--phase-2).

## Boundaries

- Owns: Accounts page resource snapshots, Accounts screen UI, and account mutation refresh fan-out.
- Does not own: REST endpoint generation, accounting validation, route registration, app shell navigation, or transaction entry workflows.

## Testing Notes

- Frontend e2e tests cover Accounts page rendering, URL-backed toolbar state, and side-panel account workflows.
