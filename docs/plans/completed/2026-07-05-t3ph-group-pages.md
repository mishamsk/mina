# Plan: Account group pages — Kata issue `t3ph`

Add group pages per `docs/webui-design.md` §4: every non-leaf account FQN node gets a page with subtotal balances of its child `balance` accounts plus a combined register across the whole prefix (naturally including the group's `flow` accounts), with the same register/peek behavior as account pages.

## Plan Context

- Ground truth: `docs/webui-design.md` §4 (`:217-223`, group pages bullet), `docs/accounting-semantics.md:39-42` (prefix grouping mixes balance + flow), Domain Display Rules (≈USD aggregates, unconverted surfaced), `docs/frontend-architecture.md`, theme doc. Read before starting.
- Facts (line numbers as of this plan's commit):
  - Prefix register API: `searchJournalRecords` (`GET /api/records`) with `account_fqn_prefix` (node + descendants incl. flow; mutually exclusive with `account_id`; `types.gen.ts:2263-2299`). Its query type has NO `include_running_balance` — groups cannot request running balance (type-enforced). No `api/ledger.ts` wrapper for it yet.
  - No server-side prefix filter for accounts/balances — group subtotals are computed client-side from the existing accounts+balances snapshot (`fetchAccountsPage`/`useAccountsResource`), exactly like overview's `groupedBalances` (`overview-dashboard.tsx:43-74`) with `sumDecimalStrings` + `ApproximateUsdAmount` (both exported from `features/ledger`).
  - Reusable from 6a1w: `AccountPeekPanel` (fully generic), `AccountRegisterTable` (generic over `JournalRecord[]` but hardcodes 7 columns incl. Running in colgroup/thead/td and two skeleton grid templates — `account-register-table.tsx:72,81,205-233,317-402`), URL-state helpers + peek open/close/focus-restore in `account-page.tsx:23-161`, register page-cache patterns in `store/accounts.ts` (keys start with numeric accountId — group keys must not collide), lookups/transaction-cache machinery in `use-account-register-resource.ts` (account-agnostic).
  - Links to add: accounts-tree group rows currently render a bare span (`accounts-tree.tsx:380-384`; account rows already link); overview group card headers are plain text (`overview-dashboard.tsx:262-281`).
  - e2e helpers live in `accounts-page.spec.ts:3-128` (fixtures, formatters, URL assertion helper).
- Operator decisions (do not relitigate):
  - Route: `/accounts/group?prefix=<fqn prefix>` — static segment ranks above `/accounts/:accountId`; the prefix rides a query param (auto-encoded, matching the `q=` precedent). Invalid/missing prefix or a prefix with no matching accounts → plain-language error/empty state.
  - Page: header shows the group prefix (segmented `FqnPath`) + a subtotals card listing the prefix's descendant `balance` accounts (name linked to their account pages, currency, current balance) with a `≈ USD` group subtotal and unconverted annotation (overview pattern); below it the combined register.
  - Register: parameterize `AccountRegisterTable` with `showRunningBalance` and `showAccount` flags instead of forking — group register hides Running (API cannot supply it) and adds an Account column (record's account rendered via `FqnPath` dense rules, resolved from lookups). Row interaction (click/Enter peek, ArrowUp/Down walking, Esc focus return, `record` URL param, keep-previous pagination) identical to the account page. Group register store slice/keys must not collide with account register keys (e.g. `group:${prefix}:limit:offset`).
  - Data: new `api/ledger.ts` wrapper for `searchJournalRecords` with `account_fqn_prefix` (+ limit/offset); group register resource hook mirroring `use-account-register-resource` (reusing the shared lookups + transaction-cache machinery); group register pages invalidated by the same transaction-mutation path that invalidates account registers (a saved/deleted transaction invalidates group register caches too — simplest: invalidate all group register pages on transaction mutations).
  - Links in: accounts-tree group rows link to their group page; overview group card headers link to the root-prefix group page. `FqnPath` ancestor-segment linking is out of scope (net-new component feature not required by the acceptance).
  - Account-page ancestor navigation is NOT added this slice; no FqnPath changes.
- Preserve, do not regress: all 62 e2e; account page register/peek; accounts tree edit affordance; overview.
- Feature completes webui-design §4 (group half): update `PROJECT_STATE.md` in the final commit.

## Tasks

### Task/Commit 1: Group register data layer + table parameterization

- [x] `api/ledger.ts` wrapper for the prefix records search; group register store slice (non-colliding keys, keep-previous-page, loading/error, invalidation on transaction mutations) + resource hook reusing lookups/transaction-cache machinery.
- [x] Parameterize `AccountRegisterTable` (`showRunningBalance`, `showAccount`) including colgroup/thead/td and skeleton templates; account page keeps current behavior (both flags defaulted accordingly); add the Account column rendering.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (account page unchanged)
  - [x] Commit changes

### Task/Commit 2: Group page, routing, links, e2e

- [x] `pages/account-group-page.tsx` (thin) + feature components per the decisions: header, subtotals card (balance accounts linked, ≈USD subtotal, unconverted annotation), combined register with peek and arrow walking; skeletons/empty/error states.
- [x] Route `/accounts/group` (before `:accountId`); links from accounts-tree group rows and overview group card headers.
- [x] e2e: seed accounts under one prefix (balance + flow) with transactions; group page shows subtotal card (linked balance accounts, ≈USD subtotal) and the combined register containing BOTH balance and flow account records with the Account column; request carries `account_fqn_prefix` and NOT `include_running_balance`; no Running column rendered; peek + ArrowDown + Esc + deep-link `?record=` work; pagination works; tree group row and overview group header navigate to the page; sibling-prefix records excluded.
- [x] Update `PROJECT_STATE.md`.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Account group pages (kata t3ph): /accounts/group?prefix=... with client-side subtotals card (descendant balance accounts linked, ≈USD subtotal via overview pattern) and combined prefix register via GET /api/records account_fqn_prefix (no running balance — type-enforced; Account column added; AccountRegisterTable parameterized with showRunningBalance/showAccount instead of forked), same peek/arrow/Esc behavior, links from tree group rows and overview card headers, group register caches invalidated on transaction mutations. Constraints: frontend-only; account page behavior unchanged; no FqnPath segment linking."`
- [x] Move this plan to `docs/plans/completed/`
