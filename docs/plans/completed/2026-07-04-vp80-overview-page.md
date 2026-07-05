# Plan: Overview dashboard page — Kata issue `vp80`

Build the Overview landing page per `docs/webui-design.md` screen 1: grouped account balances with ≈USD subtotals and remaining credit, current-month spend/income pulse, and recent activity lines linking into Transactions. `/` lands on Overview and the sidebar item becomes enabled.

## Plan Context

- Ground truth: `docs/webui-design.md` §1 Overview (authoritative content spec), Domain Display Rules (amounts; "Aggregations across currencies display the USD equivalent, visibly marked as approximate: `≈ 1,234.56 USD`"; unconverted surfaced; balances incl. posted+pending; hierarchical names; hidden excluded), Theme-Agnostic rules (skeletons, no spinners), `docs/webui-theme-arcade-cabinet.md` (cards, stat tiles, typography), `docs/frontend-architecture.md` (store/resource rules, refresh-after-mutation). Read before starting.
- Current state (line numbers as of this plan's commit):
  - Routing: `pages/router.tsx:10-15` — `/` and `*` redirect to `/transactions`; sidebar Overview is a disabled stub (`app-shell.tsx:36`) already pointing at `/overview`.
  - APIs: `getTransactionMonthTotals` requires `month` (`YYYY-MM`), returns `{month, spend, income}` each `{amount_usd, unconverted_count}` (`types.gen.ts:354-369`); `listAccountBalances` (no ids → all active balance accounts) rows carry `current_balance`, `current_balance_usd`, `unconverted_count`, `credit_limit?` (`types.gen.ts:42-65`); account metadata (fqn/name/level/is_featured) via the existing lookups snapshot (`fetchLedgerLookups`).
  - No month-totals wrapper, no `YYYY-MM` helper (`utils/date.ts`), no `≈` display convention yet (zero matches), no compact transaction-line component — line-building helpers exported from `features/ledger/format.ts` (`buildLookupMaps`, `formatInitiatedDateParts`, `lineCategory/lineTags/lineMember/linePostingStatus/lineDisplayAmounts/lineMemo`), icons in `features/ledger/line-icons.tsx`, `AmountText`, `FqnPath`.
  - Patterns: status page section layout + `Card size="sm"` stat grid (`status-page.tsx:113-210`); featured-balances resource generation/commit pattern (`features/featured-balances/use-featured-balances-resource.ts:30-108`) as the template; `fetchFeaturedAccountBalances` is featured-only — do not repurpose it.
  - e2e: `status-page.spec.ts` "shell renders and navigates between routed pages" asserts `/` → `/transactions` (`:165`) — must be updated. Demo seed has featured accounts (Joint/Emergency/Sapphire), credit limits on cards, and 118 transactions.
- Operator decisions (do not relitigate):
  - Routing: `/` and the `*` fallback redirect to `/overview`; sidebar Overview enabled. Transactions keeps its route.
  - Balances section: one card per FQN root prefix (first segment of `fqn`), listing that root's active balance accounts (hidden excluded — API default) with leaf name (FqnPath dense rules), currency and current balance; rows for featured accounts sort to the top within their group (then fqn order); group subtotal rendered `≈ 1,234.56 USD` per the display rule, with a de-emphasized "N unconverted" annotation when any summed row has `unconverted_count > 0`. Credit-card rows (rows with `credit_limit`) additionally show remaining credit = `credit_limit + current_balance` (client arithmetic on server-provided values, sanctioned by the kata) labeled clearly; omit when no limit.
  - The `≈` approximate-USD rendering: extend `AmountText` with an `approximate` variant or add a tiny dedicated component — either way ONE reusable convention (mono, tabular, `≈` prefix, `USD` code suffix per the rule), reused by the pulse tiles.
  - Month pulse: two stat tiles (Spend, Income) for the current local month (`YYYY-MM` helper added to `utils/date.ts`), plain `≈ USD` numbers with unconverted annotation; no charts, no net figure (design lists spend and income only).
  - Recent activity: the latest ~8 classified transaction lines as a compact read-only list composed from the exported `format.ts` helpers + `ClassIcon`/`AmountText` (class icon, date, title, memo second line per rules, display amount). No pagination, no expansion; a "View all" link and per-line links target `/transactions` (line links may just go to `/transactions?transaction=<id>` since detail is URL-addressable). Fetch via the existing `fetchTransactionPage({limit, offset: 0})`.
  - Data layer: an overview store slice + resource hook following the featured-balances generation/commit template (snapshot: balances rows + month totals + recent transactions; loading/error; keep-previous-data on refresh); refreshed after transaction save/delete alongside the existing refresh path. Lookups come from the existing lookups slice.
  - Loading: content-shaped skeletons per section; no layout shift; previous data stays visible on refetch.
- Preserve, do not regress: transactions page behavior, balance strip, existing e2e (update the `/`-redirect assertions), suites green.
- Feature delivers webui-design screen 1: update `PROJECT_STATE.md` in the final commit.

## Tasks

### Task/Commit 1: Overview data layer

- [x] `api/ledger.ts`: month-totals wrapper (`month: YYYY-MM`) and an overview balances fetch (all active balance accounts via one bare `listAccountBalances` call; metadata via lookups). `utils/date.ts`: local `YYYY-MM` helper.
- [x] Store slice (snapshot/loading/error, devtools names, `useShallow` view, getters) + resource hook per the featured-balances template; refresh wiring after transaction save/delete.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (no UI yet)
  - [x] Commit changes

### Task/Commit 2: Overview page UI, routing, e2e

- [x] `pages/overview-page.tsx`: PageHeader (title, help text per page-help pattern), balances group cards, month pulse tiles, recent activity list — all per the operator decisions; skeletons per section; error states per existing patterns.
- [x] The `≈` approximate-USD display convention (AmountText variant or small component) with unconverted annotation.
- [x] Routing: `/` and `*` → `/overview`; enable the sidebar Overview item; update the shell e2e redirect assertions.
- [x] New `frontend/tests/e2e/overview-page.spec.ts`: `/` lands on Overview; balances grouped by root with a `≈ … USD` subtotal; featured account sorted first in its group; credit-card row shows remaining credit derived from the seeded limit; month pulse shows spend and income for the current month (seed a transaction in the current month via API for determinism); recent activity shows latest lines and links into `/transactions`; sidebar Overview navigates and is active.
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
- [x] Run `just review-loop "Overview dashboard (kata vp80): / lands on Overview; balances grouped by FQN root with ≈ USD subtotals (unconverted annotated), featured rows first, credit rows show remaining credit from server-provided limit; month pulse tiles from month-totals API; recent activity as compact read-only lines linking into Transactions; overview store slice + resource per featured-balances template, refresh after mutations. Constraints: frontend-only; no client-side accounting derivation beyond sanctioned limit+balance arithmetic; one ≈-USD display convention; hidden accounts excluded; skeletons content-shaped."`
- [x] Move this plan to `docs/plans/completed/`
