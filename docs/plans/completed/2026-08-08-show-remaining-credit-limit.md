# Plan: Show server-derived remaining credit as card standing

## Goal

Make accounts with a current effective credit limit read like their bank counterparts: the server derives remaining credit for current balances and account-register rows, frontend account surfaces render it as the default card standing, and Mina's signed full and posted balances remain available for accounting detail.

## Constraints

- Define remaining credit once in `internal/services/creditlimits` as `credit_limit + signed balance`, equivalent to bank-facing `credit limit - positive amount owed`; use `values.Decimal` arithmetic and propagate calculation errors without clamping or absolute-value conversion.
- Reuse the existing account-balance aggregation, account-record running-balance window query, and `CurrentByAccounts` credit-limit lookup. Do not change store SQL, migrations, database models, or add an orchestration layer.
- `AccountBalance.remaining_credit` is present only with a current effective limit. Account-register `JournalRecord.remaining_credit` is present only from `GET /api/accounts/{account_id}/records` when `include_running_balance=true` supplies a running balance and the account has a current effective limit.
- Apply the API runtime clock's current effective limit to every returned register row. Do not reconstruct historical limits from credit-limit history.
- Generic record search, transaction reads, and account-register requests without running balances must not perform credit-limit lookups or expose a derived remaining value.
- Preserve group-page balance rows and USD subtotals as signed accounting aggregates; remaining credit is not a group balance and must not be summed into them.

## Success Criteria

- [x] REST responses, generated clients, and owning semantic/package docs expose and describe server-derived remaining credit with the exact presence and sign rules above.
- [x] The featured-account strip, Overview leaf rows, Accounts tree, and account page use `AccountBalance.remaining_credit` as the primary amount for accounts with a current effective limit, while raw full/posted balances remain visible on the account page and accounts without a current effective limit retain their existing labels and values.
- [x] Individual credit-limit account registers render separate right-aligned, single-line balance-after and `JournalRecord.remaining_credit` columns; ordinary account registers retain only balance-after, and group registers remain unchanged.
- [x] Focused app tests prove current balance and register remaining values include pending and posted activity, exclude cancelled activity through their existing balance inputs, use the current effective limit, remain absent without a current limit or running-balance request, and stay negative when over limit.
- [x] Focused Playwright coverage proves every named frontend surface renders the server-returned remaining value, preserves raw full versus posted detail, and retains table width/collapse, keyboard row, pagination, and peek-panel behavior.
- [x] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-08-show-remaining-credit-limit.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Expose server-derived remaining credit

Add the remaining-credit semantic to `docs/accounting-semantics.md` and `internal/services/creditlimits`, then extend `AccountBalance` and `JournalRecord` in `api/openapi.yaml`. The account-balances handler reuses its existing current-limit batch; the account-record handler performs one current-limit lookup for the requested account and enriches only records that already have a running balance. Regenerate Go and frontend clients through the Justfile and extend the existing account-balance and account-record app scenarios rather than adding a new test class.

- [x] API responses satisfy the server-side success criteria without store changes or per-record lookups.
- [x] Update `internal/services/creditlimits/PACKAGE.md` and `internal/httpapi/PACKAGE.md` only where the implemented derivation or response-composition contract is implicit; leave store and transaction-service contracts unchanged.
- [x] Commit as `feat(accounts): expose remaining credit`.

### Task 2: Make remaining credit the default card display

Update `docs/webui-design.md`, the account feature, Overview, and featured balances to render the generated remaining-credit fields without client-side credit arithmetic. Credit-limit account headers lead with `Remaining credit` and retain `Full balance` (posted plus pending), `Posted balance`, and `Credit limit` as additional values. Account registers show `Balance` and `Remaining credit` columns only when the API supplies both values. Update responsive table styling and existing focused Playwright scenarios; replace the relevant `PROJECT_STATE.md` account-display statements concisely.

- [x] Frontend surfaces satisfy the display and interaction success criteria without re-deriving remaining credit.
- [x] Update frontend package docs only if the implementation adds an implicit contract not already owned by `docs/webui-design.md`.
- [x] Commit as `feat(accounts-ui): show remaining credit`.
