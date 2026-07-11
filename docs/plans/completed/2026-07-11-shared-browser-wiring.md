# Plan: Shared browser-page wiring + one apiErrorMessage helper (Kata 5qj0, fpa2)

Two consolidation refactors that must NOT change user-visible behavior:

1. `fpa2`: `apiErrorMessage` is defined 24 times across `frontend/src` (14 copies with a hardcoded `"The API request failed."` fallback, 10 with a caller-supplied fallback; the branch logic is byte-identical in all 24). Consolidate into one canonical helper.
2. `5qj0`: `frontend/src/features/reference/reference-drilldown-page.tsx` (818 lines) mirrors large blocks of `frontend/src/pages/transactions-page.tsx` (620 lines): `TransactionSearchInput` near-verbatim, the search/date-jump/class toolbar controls, and the browser/detail/toast/quick-delete wiring. Extract shared pieces into `src/features/ledger/` so the upcoming toolbar redesign (`d8z6`) lands once. Also close three review-flagged e2e gaps in the drill-down embedding.

## Plan Context

- Kata issues: `5qj0` (shared wiring) and `fpa2` (error helper). One sub-branch.
- MANDATORY pre-reads: `docs/frontend-architecture.md` (package boundaries; pages thin, features own Mina-specific behavior), `frontend/src/api/PACKAGE.md`, `frontend/src/features/ledger` exports (`index.ts`), and `docs/TESTING.md`.
- This is a behavior-preserving refactor. Every existing e2e spec must pass unchanged (`transactions-page.spec.ts`, `reference-drilldowns.spec.ts`, `reference-row-actions.spec.ts`, `reference-table-layout.spec.ts`); do not modify existing specs except where an element id/test hook genuinely must change — prefer keeping the current DOM ids (`transactions-*` vs `reference-transactions-*`) via an `idPrefix` parameter.
- fpa2 (decided): canonical helper `apiErrorMessage(error: unknown, fallback = "The API request failed."): string` in a new non-generated `frontend/src/api/error-message.ts`, re-exported from `src/api/index.ts`. Rationale: `src/api` already owns `isNetworkFailure`/`normalizeNetworkFailure` (the primitives it builds on) and the REST error envelope is API-domain knowledge; `src/lib` explicitly does not own API concerns. Migrate ALL 24 definitions/call sites (14 Shape-A files rely on the default; 10 Shape-B files pass their fallback) and delete the local copies. Copy inventory (file:line as of plan authoring): Shape A — `features/ledger/use-transaction-detail.ts:29`, `features/ledger/use-transactions-resource.ts:40`, `features/ledger/entry-panel.tsx:795`, `features/featured-balances/use-featured-balances-resource.ts:12`, `features/tags/use-tags-resource.ts:16`, `features/accounts/use-account-register-resource.ts:85`, `features/accounts/use-accounts-resource.ts:22`, `features/members/use-members-resource.ts:15`, `features/overview/use-overview-resource.ts:26`, `features/categories/use-categories-resource.ts:17`, `features/recurring/use-recurring-review-resource.ts:32`, `features/command-palette/command-palette.tsx:228`, `features/reference/reference-drilldown-page.tsx:70`, `pages/transactions-page.tsx:50`. Shape B — `features/tags/tags-side-panel.tsx:57`, `features/tags/tags-page-content.tsx:44`, `features/accounts/accounts-tree.tsx:66`, `features/accounts/accounts-side-panel.tsx:98`, `features/categories/categories-page-content.tsx:48`, `features/categories/categories-side-panel.tsx:87`, `features/recurring/recurring-page-content.tsx:52`, `pages/tags-page.tsx:30`, `pages/categories-page.tsx:34`, `pages/accounts-page.tsx:33`.
- 5qj0 extraction design (decided) — everything lands in `src/features/ledger/` (it already owns `TransactionBrowser`, `TransactionDetailPanel`, `useTransactionDateJump`, `useTransactionDetail`, `useTransactionsResource`, filter URL helpers):
  - `TransactionSearchInput` → one exported ledger component parameterized by input `id` (currently `transactions-search` vs `reference-transactions-search`; tx `pages/transactions-page.tsx:73-113`, ref `features/reference/reference-drilldown-page.tsx:251-291`).
  - Toolbar controls (search field wrapper, date-jump prev/date/next, class select; tx `:400-490`, ref `:620-711`) → a shared ledger toolbar component parameterized by `idPrefix`, the filters value source, the four setter callbacks, and an optional extra-controls slot (the drill-down renders its "This level only" checkbox there). The DIVERGED filter setters (`addEntityFilter`, `setSearchFilter`, `setTransactionFilters`, `setTransactionClassFilter` — scoped-strip and navigate-on-kind logic in the drill-down, `ref:451-557`) stay page-owned and are passed in as props; do NOT try to unify them.
  - Browser-page wiring → one ledger feature hook (e.g. `use-transaction-browser-page.ts`) composing: params memo, `useTransactionDateJump` (accepting the drill-down's `readFiltersFromSearchParams` injection, ref `:370`), `useTransactionsResource` + derived `loading`/`errorMessage`/`totalCount`, notice/toast state + show/dismiss helpers, `useTransactionDetail` wiring, `deleteTransactionFromRow` (row quick-delete), `setPage`, `onPageSizeChange`, and the date-jump focus-restore effect. Divergent detail-panel actions (tx passes `onDuplicate`/`onEdit`/`onSplit`; drill-down omits them) and the drill-down's `restoreTransactionDetailFocus` wrapper remain page-owned via hook options/returns.
  - tx-only blocks (keyboard "n" handler, entry panel, `setLastTransactionsPageSearch`) and ref-only blocks (skeleton/error/not-found, header card, `filtersFor`, `stripScopedFilterKind`, route helpers) stay where they are.
  - Both pages (and thereby `category/tag/member-page.tsx`) end up composing the shared pieces; net deletion of duplicated lines from both files.
- New e2e coverage (review-flagged gaps confirmed absent; add to `reference-drilldowns.spec.ts` following its fixture patterns):
  - Transaction-row quick-delete inside the drill-down embedding (confirm → tombstone → refresh, mirroring the transactions-page quick-delete spec at `transactions-page.spec.ts:3664` but in the drill-down).
  - Empty-preview: a drill-down whose filter matches zero transactions renders the empty state.
  - Hidden-descendant rollup exclusion: a hidden descendant leaf (fixtures currently only use `is_hidden: false`) is excluded from the default rollup filter (`pages/tag-page.tsx:34`, `category-page.tsx:43`).
- Docs: update `frontend/src/api/PACKAGE.md` for the new helper; update the ledger feature package doc if one exists. No PROJECT_STATE.md change (refactor). No ground-truth doc changes (`docs/webui-design.md`, theme doc untouched).

## Tasks

### Task/Commit 1: fpa2 — one canonical apiErrorMessage

- [x] Add `frontend/src/api/error-message.ts` with the canonical helper (default fallback `"The API request failed."`), re-export from `src/api/index.ts`, and update `src/api/PACKAGE.md`.
- [x] Migrate all 24 definitions/call sites listed in Plan Context to import from `@/api`; delete every local copy; no message-text changes anywhere.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `fpa2` (`kata comment fpa2 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: 5qj0 — shared search input and toolbar controls

- [x] Extract `TransactionSearchInput` and the shared toolbar controls component into `src/features/ledger/` per the design in Plan Context (parameterized ids via `idPrefix`, page-owned setters passed as props, extra-controls slot); export via the ledger feature index.
- [x] Migrate `transactions-page.tsx` and `reference-drilldown-page.tsx` to compose them; current DOM ids and behavior preserved exactly; delete the duplicated blocks.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (all existing specs unchanged)
  - [x] Update progress in Kata issue `5qj0` (`kata comment 5qj0 --agent ...`)
  - [x] Commit changes

### Task/Commit 3: 5qj0 — shared browser-page wiring hook + drill-down e2e gaps

- [x] Extract the browser-page wiring feature hook per the design in Plan Context; migrate both pages; page-owned divergences stay injected (scoped filter reading, detail actions, notice naming).
- [x] Add the three missing e2e tests (drill-down row quick-delete, empty-preview, hidden-descendant rollup exclusion) to `reference-drilldowns.spec.ts`.
- [x] Update the ledger feature package doc if present (new shared wiring contract).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `5qj0` (`kata comment 5qj0 --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Shared browser-page wiring consolidation (kata 5qj0, fpa2): one canonical apiErrorMessage(error, fallback?) in src/api replacing 24 verbatim copies; TransactionSearchInput, toolbar controls, and browser/detail/toast/quick-delete wiring extracted into src/features/ledger with page-owned divergences injected as params (scoped filter setters stay in the drill-down); behavior-preserving refactor, existing e2e specs unchanged and green; three new drill-down e2e tests (row quick-delete, empty-preview, hidden-descendant rollup exclusion)"`
- [x] Move this plan to `docs/plans/completed/`
