# Plan: Account page with register — Kata issue `6a1w`

Build the URL-addressable account page per `docs/webui-design.md` screen 4: header (FQN path, type badge, currency, current + posted balances, credit limit with history, external metadata, hidden marker), a paginated records register with running balance, and a non-modal side peek panel driven by arrow-key row walking. Link it from Overview, the balance strip, and the Accounts tree.

## Plan Context

- Ground truth: `docs/webui-design.md` §4 (`:217-223`), one-shared-browser records shape (`:43-50`), non-modal side peek Overlays rule (`:64-65`, `:278`), balances rule (`:102` — posted-only figure additionally), segmented FQN in headers/registers (`:108`), keyboard/tables rules (`:140,145,148`); `docs/webui-theme-arcade-cabinet.md`; `docs/frontend-architecture.md`. Read before starting.
- API facts (line numbers as of this plan's commit): `searchAccountJournalRecords` (`GET /api/accounts/{id}/records`) with `include_running_balance` (running balance over full active history, per currency, pending+posted contribute, cancelled excluded — `types.gen.ts:2355-2357`), `limit/offset`, `total_count`; `JournalRecord` carries `transaction_id`, signed `amount`, `running_balance?`, `category_id`, `tag_ids`, `memo`, `pending_date` (always), `posted_date?`, `posting_status` — but NO `initiated_date`. Header: `getAccount`, `listAccountBalances(account_ids:[id])` (current/posted/credit_limit per currency), `fetchCreditLimitHistory` wrapper exists (`ledger.ts:295-306`). No wrapper for the records search yet.
- Reuse: sticky/banded table shell + pagination footer (`transaction-browser.tsx:463-780`, footer testid `transactions-pagination-footer` pattern with Rows select / Page X of Y / Prev / Next); record-row cell patterns (`RecordsTable :328-397`, `DetailRecordsTable` in the detail panel); `buildLookupMaps` + `AmountText tone="neutral"` for signed amounts and the running-balance column (right-aligned, `positiveSign={false}`); `FqnPath` segmented rendering for the header; `use-transaction-detail`'s `fetchTransactionById` deep-link precedent; keyed page-cache store precedent (`store/transactions.ts` pages map) and single-snapshot precedent (`store/accounts.ts`); `Link` precedent (`overview-dashboard.tsx:364`). NO ArrowUp/Down row navigation exists anywhere — net-new.
- Operator decisions (do not relitigate):
  - Route: `/accounts/:accountId` (numeric id; group pages are the later t3ph task). Register pagination `page`/`pageSize` and peek selection `record=<record_id>` live in query params (functional `setSearchParams`).
  - Header per §4: segmented `FqnPath`, `AccountTypeBadge`, currency, current balance + posted-only balance per currency row (from the balances API; multi-currency accounts list each), credit limit + a compact history list when present (read-only here — management stays in the Accounts edit panel), external id/system when present, eye-off hidden marker. Missing/tombstoned account id → plain-language error state.
  - Register: records-shape table — date, transaction counterparty, category, memo, statuses (icon + tooltip), signed amount, running balance. Date column shows the record's `pending_date` as a local civil date (the record-level date available in the response; the API's chronological order remains authoritative). Counterparty cell: the containing transaction's `display_title`, resolved by fetching the page's distinct `transaction_id`s via `fetchTransactionById` through an in-memory cache (deduped, ≤ pageSize fetches per page, cached across pages and shared with the peek; a subdued placeholder while resolving). This satisfies "transaction counterparty" without a backend change.
  - Register is default chronological only in this slice (no filter/search/sort UI), so `include_running_balance=true` is always sent and the running-balance column always shows — the §4 hide-under-filters rule becomes operative when register filtering lands with the shared-browser unification (defer; note in the plan completion notes).
  - Peek panel: a non-modal `PeekPanel` (per the Overlays rule: no autofocus steal, no trap, list stays interactive) reusing the detail panel's inner sections (title/class/amounts/records subtable/metadata) — extract shared internals rather than duplicating; footer has "Open transaction" linking to `/transactions?transaction=<id>` (full detail/edit lives there; no delete in the peek). Selecting a row (click or Enter) opens/updates the peek; `record` URL param drives it; Esc closes and returns focus to the row; transaction data via `fetchTransactionById` (cached per transaction id).
  - Arrow-key walking: ArrowUp/Down on a focused register row moves row focus; when the peek is open it follows the focused row (updates `record` param + fetch). Guard with the existing `isInteractiveTarget` pattern; PageUp/Down/Home/End out of scope.
  - Links in: Accounts tree row NAME becomes a link to the account page (stopPropagation so the whole-row edit affordance still works elsewhere on the row); balance strip entries become links; Overview balance-row account names become links. Group/prefix rows stay non-links (t3ph).
- Preserve, do not regress: all suites (58 e2e); accounts page edit flow; transactions detail panel behavior (extraction must keep it byte-identical in behavior); Esc layering; balance strip/overview.
- Feature delivers webui-design screen 4 (account page half): update `PROJECT_STATE.md` in the final commit.

## Tasks

### Task/Commit 1: Account page data layer

- [x] `api/ledger.ts`: `fetchAccountRecordsPage(accountId, {limit, offset, includeRunningBalance})` wrapper; account-header fetch (account + balances(account_ids:[id]) + credit-limit history composed).
- [x] Stores: account-header single-snapshot slice keyed by accountId; register keyed page-cache slice (`${accountId}:${limit}:${offset}`) with the transactions-pages patterns (loading key, keep-previous-page, refresh helper); per-transaction peek cache reusing `fetchTransactionById`.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (no UI yet)
  - [x] Commit changes

### Task/Commit 2: Page, header, register table

- [x] Route `/accounts/:accountId`; `pages/account-page.tsx` thin composition; feature components for header + register table per the decisions (columns, counterparty resolution via the batched transaction cache, running-balance column, banded/sticky/pagination-footer patterns, content-shaped skeletons, empty/error states).
- [x] e2e (`account-page.spec.ts`): seed an account with several transactions; page shows header fields (balances current+posted, credit limit when seeded, hidden marker for a hidden account); register lists records chronologically with signed amounts and running balance matching the API (`include_running_balance=true` asserted on the request); pagination works (Page X of Y, prev/next, rows stay visible while loading).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Peek panel, arrow-key walking, inbound links

- [x] Extract the transaction detail panel's inner sections into shared internals; add the non-modal `PeekPanel` per the decisions (`record` URL param, Esc-close with focus return, "Open transaction" link, no focus steal).
- [x] Arrow-key row walking with the peek following; Enter opens/updates the peek; keyboard behavior guarded by `isInteractiveTarget`.
- [x] Links: accounts tree row name → account page (edit affordance preserved elsewhere on the row); balance strip entries → account pages; overview balance rows → account pages.
- [x] e2e: click a record → peek shows the containing transaction (title + records); ArrowDown moves focus and the peek follows; Esc closes and restores focus; "Open transaction" lands on `/transactions?transaction=<id>` with the detail open; tree/strip/overview links navigate to the account page; deep-link `/accounts/<id>?record=<id>` opens with the peek.
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
- [x] Run `just review-loop "Account page with register (kata 6a1w): /accounts/:accountId with header (FqnPath, type badge, current+posted balances per currency, credit limit history read-only, external metadata, eye-off), paginated records register (pending_date local date, counterparty via batched fetchTransactionById cache, signed amounts, running balance always on — register is default-chronological only this slice), non-modal PeekPanel extracted from detail panel internals with record URL param, ArrowUp/Down row walking with peek following, Esc focus return, Open transaction -> /transactions?transaction=id; links added from accounts tree names, balance strip, overview rows. Constraints: frontend-only; detail panel behavior unchanged; no register filter UI this slice; no delete in peek."`
- [x] Move this plan to `docs/plans/completed/`
