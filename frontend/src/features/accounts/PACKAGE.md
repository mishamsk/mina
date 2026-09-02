# frontend/src/features/accounts

## Purpose

- Owns chart-of-accounts resources and management UI, plus reusable account and group register content.

## Implicit Contracts

- A failed group-register entity-filter lookup warns without navigating. Leaving the register or unmounting aborts and discards pending lookups; same-route query changes keep them alive.
- Chart snapshots are keyed by normalized `q`, repeated `type`, and `hidden`; each load follows all server-filtered pages in canonical FQN order, and only `nonzero` remains a local balance-presentation filter. Repeated types use any-of matching; no valid type selects all. The modal type picker absorbs its dismissing pointer event so it cannot activate an underlying tree row; its trigger names the current selection and exposes the full summary in a tooltip.
- The focused account search field retains its raw draft, including trailing whitespace; its URL query normalizes on each change without navigating for normalized no-ops, and blur or browser history navigation releases the draft.
- The account search field opts out of browser value-history suggestions so Mina's server-filtered search remains the only search experience.
- A failed chart load replaces any mismatched cached chart with its error and Retry affordance until the requested snapshot loads successfully.
- Account trees derive ancestor rows only from returned leaves and use group reads solely for canonical hidden metadata; they do not repeat server-owned search or type membership in the browser.
- The `nonzero` chart filter follows the [Accounts toolbar rules](../../../../docs/webui-design.md#accounts).
- Register snapshots are keyed by their account or group request. An exact cache miss may keep the last snapshot for that target visible while fetching; request-backed header and register writes must reject results from an invalidated generation.
- A cache-missing account or group register runs one occurrence catch-up per mounted resource before loading records; its record query keeps the API default that excludes expected occurrences.
- `page` and `pageSize` are register URL state; ledger owns the composable `transaction` detail parameter. Pointer interaction with register pagination closes detail before changing page state.
- Account/group register pagination joins the shared compact Controls surface; in the compact shell, register rows grow with the document without a vertical table scroller, keyboard row walks keep their target above the fixed app toolbar, and loading skeletons stay horizontally clipped, while roomy layouts retain the bounded sticky-header register.
- Account mutations use `refreshAccountsAfterMutation`: refresh the chart, featured balances, Overview, and ledger lookups before success feedback. Bulk mutations also discard account/group registers and cached transactions; type or currency changes additionally discard template compatibility.
- Register-detail lifecycle mutations seed the returned transaction before invalidating register caches so the open panel remains complete during refresh; expected-occurrence confirmation forwards the dialog's actual date and reloads the resulting transaction, and successful fallback detail fetches seed the transaction cache.
- Register rows render the record-search response's server-derived transaction display title and account-ID context; omitted enrichment renders as unavailable, and full transaction loading begins only when detail opens.
- Register category chips re-read the category by stable ID before constructing a Transactions DSL filter, so external renames cannot submit stale FQNs.
- Use API `deletable` and `has_credit_limit_history` signals as supplied; this package does not infer either rule. System accounts expose no mutation controls.
- Management-panel callers restore focus to the opener (or New account fallback) on close; successful deletion prefers the visible search field and otherwise uses the table. Register detail delegates panel rendering, loading, URL state, and focus restoration to ledger; accounts owns register-specific mutation calls, refresh sequencing, notices, and close or reload outcomes. URL-first detail focuses the panel; walking between records keeps row focus, and moving within one transaction updates the restore row without closing detail.

## Boundaries

- Owns account-management and register resource coordination, including their refresh fan-out.
- Pages own route registration and individual-account route orchestration; `store` owns snapshot storage and invalidation primitives.
- `api` owns generated operations and backend validation; this package does not own accounting rules or transaction-entry workflows. Account presentation follows the [Accounts specification](../../../../docs/webui-design.md#5-accounts-chart-of-accounts--phase-2).
