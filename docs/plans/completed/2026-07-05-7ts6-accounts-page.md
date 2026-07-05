# Plan: Accounts chart-of-accounts page — Kata issue `7ts6`

Build the Accounts page per `docs/webui-design.md` screen 5: FQN-hierarchy tree table (name path-indented, type badge, currency, balance, hidden state), toolbar (search, type filter, include-hidden), side-panel create/edit with credit-limit history management, tombstone delete with confirmation. Sidebar item enabled.

## Plan Context

- Ground truth: `docs/webui-design.md` §5 (`:225-231`), hierarchical-name rules (`:105-110` — trees indent by level, group by parent; search across full path), hidden-entity rules (`:131-133` — eye-off), forms/feedback (`:174-178`), currency comboboxes (`:212`); `docs/webui-theme-arcade-cabinet.md` (landmark panels `:89-90,127`, badges `:122`, banded tables `:93`); `docs/frontend-architecture.md` (bounded lookup exception, URL state, store rules, refresh-after-mutation). Read before starting.
- API facts (line numbers as of this plan's commit):
  - CRUD: `createAccount` (required `fqn`, `account_type`; optional `is_hidden/is_featured/currency/external_id/external_system`), `updateAccount` PATCH supports ONLY `is_hidden/is_featured/external_id/external_system` (`openapi.yaml:3604`) — FQN/type/currency are create-only; rename/move is the separate mrs9 restructuring API (out of scope, per the kata note). `deleteAccount` tombstones (204). Credit limits: `listCreditLimitHistory`/`createCreditLimitHistory` (per-account), `deleteCreditLimitHistory` (204); `credit_limit` non-negative decimal string + `effective_date`.
  - `listAccounts` (`include_hidden`, `include_tombstoned`, `account_type`, sort fqn) has NO search param; accounts are a deliberately bounded reference list (limit 500) — client-side search/filtering over one bounded fetch is sanctioned by the frontend-architecture bounded-lookup exception. `listAccountBalances` (one bare call, `include_hidden=true`) supplies the balance column incl. `credit_limit`.
  - No `api/ledger.ts` wrappers exist for account/credit mutations yet (read wrappers only, `:172-210`); transaction CRUD wrappers are the precedent.
- Frontend precedents: side panel + Esc `defaultPrevented` coordination + inline alertdialog delete confirm (`transaction-detail-panel.tsx:310-596`); form fields, `FieldError`, blur+submit validation, API-error field mapping, currency `<datalist>` combobox (`entry-panel.tsx:213-345,600-845`); banded sticky-header table structure (`transaction-browser.tsx:458-720`); `ClassBadge` as the badge model (no `AccountTypeBadge` exists — create one for `balance/flow/system`); `EyeOff` hidden marks (`entity-picker.tsx:189-191`); nav enablement = remove `disabled: true` from the Accounts stub (`app-shell.tsx:175`); routes in `pages/router.tsx:12-16`; overview resource generation/commit pattern + refresh helpers (`refreshFeaturedBalances`, `refreshOverview`); NO lookups re-fetch helper exists (lookups load once — pickers won't see new accounts without one).
- Operator decisions (do not relitigate):
  - Data: one accounts-page resource (feature slice + hook per the overview template): a single `listAccounts` fetch with `include_hidden: true` (tombstoned excluded) joined with one bare `listAccountBalances(include_hidden=true)` call. Search (full-FQN substring, case-insensitive), type filter, and the include-hidden toggle apply client-side over the bounded set; all three live in the URL (`q`, `type`, `hidden`) via functional `setSearchParams`.
  - Tree: derive from FQNs sorted by fqn — a row for every FQN node, indented by level; nodes that are real accounts show type badge / currency / balance (balance-type rows only; from the balances join) / hidden eye-off; pure-prefix group nodes render name only. Rows are non-links for now (account/group pages arrive in later fleet tasks). No collapse/expand in this slice. When search/type/hidden filtering hides an account, keep its ancestor group rows only if a visible descendant remains.
  - Side panel (non-modal, Esc-coordinated like the detail panel): Create mode — FQN, type, currency (datalist combobox over currencies in data + free entry, uppercase, pattern-validated), hidden checkbox, external id/system; blur+submit validation; API errors mapped to fields. Edit mode — FQN/type/currency shown read-only (API constraint; restructuring is mrs9), editable: hidden, featured, external id/system. Credit-limit section (balance-type accounts only): history list (effective date + amount, newest first), add-entry form (amount + effective date), per-entry delete with confirmation. Tombstone account delete: destructive button + alertdialog naming the account FQN and the tombstone consequence; API errors surfaced.
  - Mutations refresh: the accounts resource, `refreshFeaturedBalances()`, `refreshOverview()`, and a NEW lookups re-fetch helper (added to the store/resource layer) so entry pickers see created/hidden accounts; success toasts per the toast pattern.
  - Sidebar Accounts enabled; `/accounts` route added.
- Preserve, do not regress: all suites; entry panel and pickers; balance strip; overview; detail panel Esc layering.
- Feature delivers webui-design screen 5 (minus mrs9 restructuring): update `PROJECT_STATE.md` in the final commit.

## Tasks

### Task/Commit 1: Accounts data layer + mutation wrappers

- [x] `api/ledger.ts`: wrappers for `createAccount`, `updateAccount`, `deleteAccount`, `listCreditLimitHistory`, `createCreditLimitHistory`, `deleteCreditLimitHistory`, plus the accounts-page read fetch (accounts incl. hidden + balances join).
- [x] Accounts feature slice + resource hook (overview template: generation guard, keep-previous-data, error state); lookups re-fetch helper; mutation refresh wiring per the decisions.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (no UI yet)
  - [x] Commit changes

### Task/Commit 2: Tree table page + toolbar + routing

- [x] `pages/accounts-page.tsx` + feature components: tree table per the decisions (indent by level, `AccountTypeBadge`, currency, balance column, `EyeOff` hidden marks, banded/sticky-header/theme treatment, content-shaped skeletons); toolbar search/type/include-hidden bound to URL (`q`/`type`/`hidden`).
- [x] Route `/accounts`; enable the sidebar Accounts item.
- [x] e2e (`accounts-page.spec.ts`): tree renders demo accounts grouped/indented with group prefix rows; type filter narrows; search matches full FQN path; include-hidden toggle reveals a hidden account with eye-off; balance column shows only for balance accounts and matches the balances API; sidebar item navigates and is active.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Create/edit side panel, credit limits, delete

- [x] Side panel per the decisions (create + edit modes, validation, API error mapping, currency combobox, read-only FQN/type/currency in edit, hidden/featured/external fields).
- [x] Credit-limit history section with add + delete-with-confirmation; account tombstone delete with confirmation naming the FQN; success toasts; refresh wiring (accounts resource, featured balances, overview, lookups).
- [x] e2e: create an account via the panel (appears in tree; entry-panel picker sees it after lookups refresh — assert via the picker or the lookups request); edit toggles hidden (row gains eye-off; excluded from default view); add a credit limit to a card account (balances view/strip reflects remaining credit after refresh where practical); delete an account (confirmation names it; row disappears); validation errors render on the offending fields.
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
- [x] Run `just review-loop "Accounts chart-of-accounts page (kata 7ts6): FQN tree table (indent by level, synthesized group rows, AccountTypeBadge, balance column from balances API, eye-off hidden), toolbar search/type/include-hidden in URL over one bounded fetch (sanctioned bounded-lookup exception), non-modal side panel create/edit (PATCH limits edit to hidden/featured/external — FQN/type/currency create-only, restructuring deferred to mrs9), credit-limit history management, tombstone delete with naming confirmation, mutations refresh accounts+featured+overview+lookups. Constraints: frontend-only; rows non-links until account pages exist; no collapse/expand; Esc layering preserved."`
- [x] Move this plan to `docs/plans/completed/`
