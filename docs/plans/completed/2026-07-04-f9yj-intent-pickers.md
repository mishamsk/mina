# Plan: Entry pickers fetch intent-filtered categories — Kata issue `f9yj`

Adopt the categories API's `economic_intent` filter (already merged) in the entry panel: category pickers fetch pre-filtered lists from the backend instead of filtering a full client-side lookup. Closes the remaining acceptance of kata `f9yj`.

## Plan Context

- Ground truth: `docs/frontend-architecture.md` (REST data access; bounded lookup lists; Zustand store rules), `docs/webui-design.md` (pickers; hidden entities excluded from pickers by default), `api/openapi.yaml` (`listCategories` with repeatable `economic_intent`, `openapi.yaml:172-180`; enum `openapi.yaml:2105-2115`). Read before starting.
- Current state (line numbers as of this plan's commit):
  - Generated types already expose `economic_intent?: Array<CategoryEconomicIntent>` (`frontend/src/api/generated/types.gen.ts:906-919`, union at `:128`).
  - The only categories fetch is the batched `fetchLedgerLookups` (`frontend/src/api/ledger.ts:55-99`) with `include_hidden: true, include_tombstoned: true` — feeding `LedgerLookupsSnapshot` (`frontend/src/store/transactions.ts:22-28`) used by the browser/detail panel for **display-by-id** (must keep full, unfiltered, hidden+tombstoned included).
  - Client-side intent filtering: `entry-panel.tsx` `tabConfigs[*].categoryIntents` (`:94-139` — spend → expense+fee, income → income, refund → refund, transfer → transfer) applied in the options memo (`:513-543`) after a `visibleCategory` hidden/tombstoned filter (`:406-407`).
  - Category picker is the shared `EntityPicker` (`features/ledger/entity-picker.tsx`), options via `options.categoriesByTab[activeTab]` (`entry-panel.tsx:881-890`). No inline-create for categories today (out of scope here).
- Operator decisions (do not relitigate):
  - The shared `fetchLedgerLookups` categories call stays exactly as is — it serves id-resolution display and must keep hidden/tombstoned/other-intent categories.
  - Add a separate picker-scoped source: a fetch helper in `frontend/src/api/ledger.ts` taking an intent set and passing repeatable `economic_intent`, with `include_hidden`/`include_tombstoned` left at their API defaults (excluded) so the server owns picker visibility — the client-side `visibleCategory` filter for picker options goes away.
  - Cache per intent set (the four tab sets), fetched lazily when a tab first needs it, stored in the transactions/ledger store following the existing snapshot patterns (setState helpers, devtools names, `useShallow` selectors). Keep it a bounded lookup (same `limit: 500`, `sort: "fqn"`).
  - Loading/error UX: while a tab's filtered list is loading, the picker may show the existing lookup-derived filtered options as a fallback or a loading state — pick the simplest correct behavior; entered draft state must never be lost.
- Preserve, do not regress: entry e2e ("keyboard spend entry creates a transaction and keeps sticky fields", "entry panel creates each shorthand transaction type"), hidden-excluded-from-pickers behavior, browser/detail category name resolution incl. hidden/tombstoned, draft persistence.
- This completes a business-scoped API-adoption item: update `PROJECT_STATE.md` (entry pickers fetch intent-filtered categories) in the final commit.

## Tasks

### Task/Commit 1: Intent-filtered category fetch + store cache

- [x] Add a picker-scoped fetch helper in `frontend/src/api/ledger.ts` (repeatable `economic_intent`, bounded, defaults exclude hidden/tombstoned) and a store-side cache keyed by the normalized intent set, following the existing Zustand store rules (setState action helpers with `StoreName/actionName` devtools names, snapshot getter, `useShallow` selectors, usable outside React).
- [x] Leave `fetchLedgerLookups` and `LedgerLookupsSnapshot` untouched.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (no behavior change yet)
  - [x] Commit changes

### Task/Commit 2: Entry panel adoption + e2e

- [x] Wire the entry panel's category picker to the intent-filtered source: each tab's options come from the cached intent-set fetch (lazily triggered), replacing the client-side `categoryIntents`/`visibleCategory` filtering of the full lookup for picker options. The `tabConfigs` intent sets remain the single source of which intents each tab requests.
- [x] Extend e2e (`frontend/tests/e2e/transactions-page.spec.ts`): assert the picker triggers a `/api/categories?economic_intent=...` request with the right repeated params for a tab; picker options contain only intent-appropriate categories and exclude a hidden category (mirror the hidden-tags contract test) while the transaction list still resolves that hidden category's name; existing entry flows keep passing.
- [x] Update `PROJECT_STATE.md`: entry pickers fetch intent-filtered categories from the API.
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
- [x] Run `just review-loop "Entry pickers fetch intent-filtered categories (kata f9yj FE adoption): separate picker-scoped fetch with repeatable economic_intent (API defaults exclude hidden/tombstoned), store cache keyed by intent set, shared fetchLedgerLookups untouched for display id-resolution. Constraints: frontend-only; tabConfigs intent sets stay the source of truth; hidden categories excluded from pickers but resolvable in lists; draft state never lost."`
- [x] Move this plan to `docs/plans/completed/`
