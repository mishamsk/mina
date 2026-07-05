# Plan: Featured-accounts balance strip — Kata issue `d7jh`

Add the always-visible compact balance strip of featured accounts required by `docs/webui-design.md` Layout & Structure, mounted in the sidebar (AppShell) so it shows on every screen, fed by the featured-account flag and the balances API.

## Plan Context

- Ground truth: `docs/webui-design.md` (Layout & Structure: "A compact balance strip of featured accounts is visible from every screen (in or adjacent to the sidebar) … strip entries link to account pages"; Domain Display Rules: amounts/balances; Theme-Agnostic rules: skeletons shaped like content, no layout shift), `docs/webui-theme-arcade-cabinet.md` ("`BalanceStrip`: mono amounts in `--frame-foreground` on the frame; no accent fills so the strip stays glanceable"), `docs/frontend-architecture.md` (store rules, refresh-after-mutation). Read before starting.
- Current state (line numbers as of this plan's commit):
  - AppShell: fixed left sidebar wrapping every route (`frontend/src/pages/router.tsx:9`); scroll column `app-shell.tsx:187` with New Transaction button, `SidebarNav` (`:190`), Reference section (`:192`), `mt-auto` utility block (`:212`). Collapse state: `usePreferencesView().preferences.sidebarCollapsed` (`:151`). Collapsed items use `sr-only` labels + tooltips.
  - API: `listAccounts` supports `is_featured` and `account_type` query params (`types.gen.ts:1402`); `listAccountBalances` takes `account_ids` and rows now carry `current_balance`, `current_balance_usd`, `credit_limit?` (`types.gen.ts:42,1465`). No non-generated consumer of `listAccountBalances` yet.
  - Store pattern to copy: the `ledgerLookups` slice (`store/transactions.ts:44-46,112,196-248`) + orchestration effect (`use-transactions-resource.ts:96-137`).
  - Amount formatting: `formatDecimalAmount` (`features/ledger/format.ts:82`) + `currencyDisplayMarker` (`utils/currency.ts`); `AmountText` hardcodes light-surface colors, so the strip should reuse the formatting helpers with frame-token colors rather than forcing `AmountText` variants.
  - Demo seed (`internal/services/demo/demo.go:125-148`) sets no `is_featured` accounts — an out-of-the-box `--demo` run would render an empty strip.
- Operator decisions (do not relitigate):
  - Strip mounts in the sidebar scroll column between the Reference section and the `mt-auto` utility block, as its own labeled section ("Featured" style consistent with the Reference group label).
  - Expanded row: account leaf name (mono, `--frame-foreground`), current balance right-aligned (mono, tabular numerals, de-emphasized currency marker in `--frame-muted`), one row per balance row (account+currency). No accent fills, no chips. Current balance = posted+pending per the API row.
  - Collapsed rail treatment: the strip collapses to a single icon entry with a tooltip listing "leaf name balance marker" for each featured row — no amounts rendered in the 76px rail.
  - Entries render as non-links for now (account pages don't exist yet; linking is covered by later fleet tasks). No `credit_limit`/USD display in the strip — name + native current balance only.
  - Data: fetch featured `balance`-type accounts (`is_featured=true`, `account_type=balance`) then `listAccountBalances(account_ids)`; new store slice + resource hook following the lookups pattern; empty featured set renders nothing (no empty-state block in the sidebar). Refresh: strip balances refresh after transaction mutations (wire into the existing after-save/delete refresh path per the frontend-architecture mutation-refresh rule).
  - Loading: content-shaped skeleton rows sized like final strip rows; no layout shift; strip renders only rows that exist (skeleton row count may be a small fixed number).
  - Demo seed: mark two or three sensible demo accounts featured (e.g. the main checking + one credit card) in `internal/services/demo/demo.go` so `--demo` shows the strip; this small backend seed change is in scope.
- Preserve, do not regress: sidebar nav behavior and collapsed alignment (existing e2e), preferences persistence, existing suites.
- Feature delivers a `docs/webui-design.md` Layout item: update `PROJECT_STATE.md` in the final commit.

## Tasks

### Task/Commit 1: Featured balances data layer

- [x] API wrapper fetching featured balance accounts + their balances (two generated calls composed); store slice (snapshot/loading/error + `loadedAt`) and resource hook following the `ledgerLookups` pattern; invalidation/refresh hook-in after transaction save/delete.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (no UI yet)
  - [x] Commit changes

### Task/Commit 2: Strip UI in AppShell + demo seed + e2e

- [x] `BalanceStrip` component per the operator decisions above (placement respecting the frontend lint boundaries — if app-shell importing the ledger feature trips `no-restricted-imports`, place the component where the boundary allows and note it), mounted in AppShell; expanded rows, collapsed single-icon + tooltip treatment, skeleton loading, hidden when no featured accounts.
- [x] Demo seed: flag 2-3 demo accounts featured; run backend suites.
- [x] e2e (`status-page.spec.ts` shell coverage + helpers from `transactions-page.spec.ts`): strip shows featured accounts with balances on multiple routes; collapsed rail shows the icon treatment; an account created/updated as featured via API appears after reload; non-featured accounts absent; saving a transaction against a featured account refreshes its strip balance (if practical — else assert refresh via reload and note it).
- [x] Update `PROJECT_STATE.md`.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (demo seed changed)
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Featured-accounts balance strip (kata d7jh): sidebar section between Reference and utilities, mono frame-token amounts, one row per account+currency, collapsed rail degrades to icon+tooltip, non-links until account pages exist, data via is_featured+account_type=balance listAccounts + listAccountBalances with store slice per lookups pattern, refresh after mutations, demo seed gains 2-3 featured accounts. Constraints: no accent fills; content-shaped skeletons no layout shift; strip hidden when no featured accounts."`
- [x] Move this plan to `docs/plans/completed/`
