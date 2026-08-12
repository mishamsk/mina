# frontend/src/features/accounts

## Purpose

- Owns chart-of-accounts resources and management UI, plus reusable account and group register content.

## Implicit Contracts

- The chart snapshot includes hidden accounts but only its server-sorted first 500 rows; `q`, `type`, and `hidden` filter that snapshot locally and preserve unrelated URL parameters.
- Register snapshots are keyed by their account or group request. An exact cache miss may keep the last snapshot for that target visible while fetching; request-backed header, register, and transaction cache writes must reject results from an invalidated generation, while authoritative mutation responses may seed the transaction cache after invalidation.
- A cache-missing account or group register runs one occurrence catch-up per mounted resource before loading records; its record query keeps the API default that excludes expected occurrences.
- `page` and `pageSize` are register URL state; ledger owns the composable `transaction` detail parameter. Pointer interaction with register pagination closes detail before changing page state.
- Account mutations use `refreshAccountsAfterMutation`: refresh the chart, featured balances, Overview, and ledger lookups before success feedback. Bulk mutations also discard account/group registers and cached transactions; type or currency changes additionally discard template compatibility.
- Register-detail lifecycle mutations seed the returned transaction before invalidating register caches so the open panel remains complete during refresh; successful fallback detail fetches also repair an errored register transaction cache entry.
- Use API `deletable` and `has_credit_limit_history` signals as supplied; this package does not infer either rule. System accounts expose no mutation controls.
- Management-panel callers restore focus to the opener (or New account fallback) on close. Register detail delegates panel rendering, loading, URL state, and focus restoration to ledger; accounts owns register-specific mutation calls, refresh sequencing, notices, and close or reload outcomes. URL-first detail focuses the panel; walking between records keeps row focus, and moving within one transaction updates the restore row without closing detail.

## Boundaries

- Owns account-management and register resource coordination, including their refresh fan-out.
- Pages own route registration and individual-account route orchestration; `store` owns snapshot storage and invalidation primitives.
- `api` owns generated operations and backend validation; this package does not own accounting rules or transaction-entry workflows. Account presentation follows the [Accounts specification](../../../../docs/webui-design.md#5-accounts-chart-of-accounts--phase-2).
