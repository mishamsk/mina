# Plan: Keep credit limits single-currency (follow-up to Kata xcvb)

This is a follow-up correction to the account-currency work in closed Kata issue
`xcvb`. Credit-limit history will be currency-less, available only on
single-currency accounts, and denominated by an account currency that cannot
change while active credit-limit history exists.

## Plan Context

### Target state

- Credit-limit rows never store or accept a currency. Their associated
  account's non-`NULL` currency is authoritative for the value, history
  display, and current-limit balance.
- Credit-limit creation is valid only for a single-currency account. Creating
  one on a multi-currency account returns an invalid-request error.
- Every actual account-currency change returns a conflict while any active,
  non-tombstoned credit-limit row exists, including a future-dated row.
  Omitting currency or setting its existing value is not a change, and
  tombstoned rows do not constrain later changes.
- Credit-limit creation and account-currency updates remain inside the shared
  account-reference serialization boundary so neither operation can race past
  the other's validation.
- The web UI exposes credit-limit management only for eligible single-currency
  accounts, renders every limit in the account currency, and prevents currency
  editing while active limit history exists.

### Implementation constraints

- This plan does not reopen `xcvb`; no separate open Kata issue currently owns
  the follow-up.
- Prefer reversal to new implementation wherever main at merge base
  `c766032bf6a81a749b3881df93a0b87617435539` already has the required
  currency-less credit-limit shape. Restore those service, store, OpenAPI,
  data-model, UI, documentation, and test paths instead of adding compensating
  fields, adapters, or compatibility layers.
- Keep the final full branch diff against that merge base minimal:
  currency-qualified credit-limit changes introduced by `xcvb` should disappear
  where possible, leaving only the smallest new deltas needed to reject
  multi-currency limits, block account-currency changes, hide invalid UI
  affordances, and validate external DB corruption.
- Do not reverse unrelated `xcvb` account-currency semantics, record
  enforcement, exchange behavior, or single-/multi-currency account UI.
- Mina is evergreen: remove the credit-limit currency column from the original
  model and migration. Do not add a migration, migration compatibility code, or
  a migration integration test.
- UI compatibility precedes OpenAPI field removal: the UI first stops
  sending/reading the optional credit-limit currency, then the backend contract
  removes it without leaving an unbuildable intermediate commit.
- Existing credit-limit eligibility by account type is unchanged; this
  follow-up narrows currency eligibility only.

## Tasks

### Task 1: Define the single-currency credit-limit semantics

Update only the owning business-semantics document first, without API or UI
design language.

- [x] Update `docs/accounting-semantics.md` so credit-limit history is
  currency-less, is valid only for a single-currency account, and inherits that
  account's currency.
- [x] Amend the account-currency transition rules so every actual currency
  change is forbidden while active credit-limit history exists, while
  tombstoned history does not constrain transitions.
- [x] Commit the task as
  `docs(accounting): constrain credit limits to account currency`.

### Task 2: Remove multi-currency credit-limit affordances from the web UI

Make the Accounts feature compatible with the final currency-less contract
before generated types change. Update `docs/webui-design.md`,
`frontend/src/features/accounts`, its package contract, and focused Playwright
coverage.

- [x] Restore main's account-denominated credit-limit request and rendering
  paths where they already match the target; add only the new eligibility and
  currency-lock behavior.
- [x] Show credit-limit history and its add affordance only for eligible
  single-currency accounts; a multi-currency account must expose no credit-limit
  add control or limit-currency field.
- [x] Remove credit-limit currency draft state, validation, and request data.
  Render history rows, account-header history, and delete confirmation amounts
  using the owning account's currency; preserve current-limit balance and
  remaining-credit displays.
- [x] Make account currency mode/code controls unavailable with a clear reason
  while active credit-limit history exists, and restore them after the final
  active history row is deleted. Preserve the credit-card history indicator.
- [x] Cover single-currency add/history/delete behavior, absence of the
  multi-currency affordance, inherited-currency rendering, and currency-control
  locking/unlocking in `frontend/tests/e2e/accounts-page.spec.ts`; retain
  Overview credit-remaining coverage.
- [x] Run `just pre-commit`, `just test`, and `just test-frontend-e2e`.
- [x] Commit the task as
  `fix(accounts-ui): restrict credit limits to single currency`.

### Task 3: Enforce currency-less credit limits across backend and client contracts

Make the account service the authority for the transition rule and the
credit-limit service the authority for write eligibility, then remove the
credit-limit currency field from every persistence and API/client surface.

- [x] Use the merge-base credit-limit service, store, HTTP mapping, OpenAPI,
  model, documentation, and tests as the reversal baseline; delete
  branch-added currency-qualified types and logic when main's simpler shape
  already satisfies the target.
- [x] Remove credit-limit currency from `CreditLimitHistory`, create/persist
  inputs, current-limit values, DuckDB queries, `docs/data-model.md`, and
  `internal/store/migrations/00006_create_credit_limit_history.sql`. Re-pin the
  reviewed embedded model through the repository-owned workflow without adding
  a migration.
- [x] Reject credit-limit creation when account-reference validation resolves a
  multi-currency account. Reject every real account-currency change while
  `ActiveUsage.CreditLimitHistory` is true, while preserving fixed-system
  protections, record-based transition validation, and serialized
  create/update behavior.
- [x] Remove currency from the OpenAPI credit-limit create request and history
  response; restore current-limit balance mapping to the account's single
  currency; update endpoint/account-transition descriptions and
  `api/client-surfaces.yaml`; regenerate REST, frontend, CLI, and MCP artifacts
  through Justfile-owned recipes.
- [x] Update demo seeding, `PROJECT_STATE.md`, and the accounts, credit-limits,
  DB-validation, and affected frontend package contracts to describe
  account-denominated limits without duplicating the owning semantics.
- [x] Replace the obsolete invalid-credit-limit-currency DB validation fixture
  with a focused error invariant for an active credit-limit row associated with
  a multi-currency account. Keep this launched CLI database-corruption case in
  `mina_db_validate.txt`; do not add migration coverage.
- [x] Add app-test boundaries for single-currency creation and current-limit
  reads; multi-currency creation rejection; same-value account updates;
  single-to-multi and single-to-different rejection with active, including
  future-dated, history; and permitted transitions after all active history is
  tombstoned. Remove coverage that treats a credit-limit row's own currency as
  authoritative.
- [x] Audit the repository so no credit-limit model, database row, OpenAPI
  schema, generated client, client-surface description, demo fixture, or UI
  path still accepts, stores, or returns a credit-limit currency.
- [x] Review the full branch diff against
  `c766032bf6a81a749b3881df93a0b87617435539` and remove avoidable
  credit-limit churn or replacement layers; retain unrelated `xcvb` work.
- [x] Run `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e`.
- [x] Commit the task as
  `fix(creditlimits): inherit account currency`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] Credit-limit history is currency-less and can be created only for a
  single-currency account; active history prevents every real account-currency
  change at the service boundary.
- [x] Multi-currency account UI exposes no credit-limit creation affordance, and
  all credit-limit displays use the owning account currency.
- [x] External DB corruption that combines active credit-limit history with a
  multi-currency account is reported by `mina db validate`.
- [x] The full branch diff contains no avoidable currency-qualified
  credit-limit changes or compensating layers where restoring main satisfies
  the target state.
- [x] `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e` pass.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run
  `just review-loop --plan "docs/plans/2026-07-30-single-currency-credit-limits.md"`
  exactly once; resolve its findings, rerun affected validation, and commit the
  fixes. The plan is immutable ground truth for reviewers and fixers. Never
  invoke review-loop a second time; report any remaining findings in the
  completion summary.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
