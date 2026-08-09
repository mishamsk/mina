# Plan: Add USD table mode and dual-amount transaction detail

## Goal

Add a native-currency/USD display toggle to every shared transaction table, backed by server-derived USD equivalents so transaction semantics remain API-owned. Each table row keeps one amount chip: native by default, or USD/`N/A` in USD mode. Full transaction detail always shows both native and USD chips for non-USD amounts.

## Constraints

- Limit the toggle to shared transaction tables on Transactions and Category/Tag/Member drill-down pages, and limit dual-amount presentation to the full transaction detail panel. Account registers and their peek panels, Overview, command-palette results, entry rails, and recurring-definition tables do not change.
- Do not add storage, migrations, exchange-rate lookups, query-time conversion, URL state, or IndexedDB persistence. Derived USD values use only stored journal-record `amount_usd` values returned with persisted transactions.
- The backend continues to own record roles, transaction shapes, and display amounts. A derived USD amount follows the same contributing records and sign transformation as its native display amount; if any contributor has `amount_usd = NULL`, the derived value is null rather than partial.
- USD table presentation is browse-only. Edit mode continues to show and edit authoritative native amounts; leaving Edit mode restores the browser's selected display mode. Full transaction detail ignores the table mode and always presents its non-USD amounts in both currencies.
- Preserve existing more-parts behavior: the table never invents a USD total for a row with no server-derived primary amount.

## Success Criteria

- [ ] Every persisted transaction `DisplayAmount` returned by REST includes nullable `amount_usd`, derived from the same records as `amount`; dry-run classifications and date-free recurring-definition amounts return null because those inputs have no stored valuation.
- [ ] Shared transaction tables default to exactly the existing native amount chip, while USD mode replaces it with one USD chip or one accessible `N/A` chip; mixed rows retain their existing `+` more-parts fallback without a synthetic amount.
- [ ] Full transaction detail shows native and USD chips for every non-USD display amount regardless of the table mode, using `N/A` for unavailable USD; USD-native amounts remain single-chip.
- [ ] The accessible toolbar icon toggle visibly distinguishes native/multi-currency and USD modes, returns to native mode without reloading data, and never changes how the independent detail amount pairs render.
- [ ] USD/native presentation preserves signs, lifecycle de-emphasis, right alignment, more-parts indicators, action collapse, keyboard operation, and supported-width containment.
- [ ] `just test`, `just pre-commit`, `just test-integration`, and `just test-frontend-e2e` pass.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-08-transaction-usd-amount-display.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Expose server-derived USD display amounts

Extend `transactions.DisplayAmount` and the OpenAPI `DisplayAmount` response with required nullable `amount_usd`. Persisted transaction classification must aggregate stored USD values alongside native values through the existing role, shape, transfer, exchange, sign, and primary-amount paths; one missing contributor makes only that derived USD amount unavailable. Classification requests and recurring definitions retain their current native derivation and emit null USD values.

- [ ] Update `api/openapi.yaml`, `internal/services/transactions`, and `internal/httpapi/strict_transactions.go`; document the stored-value/null-propagation contract in `docs/accounting-semantics.md` and `internal/services/transactions/PACKAGE.md`.
- [ ] Regenerate owned Go and TypeScript clients with `just openapi` and `just frontend-openapi`; do not hand-edit generated output.
- [ ] Extend app-boundary classification coverage in `internal/apptest/runtime/transaction_classification_test.go` for signed non-USD aggregation, multi-record/complex shapes, null propagation, and null-valued dry-run/recurring display amounts.
- [ ] Commit as `feat(transactions): expose USD display amounts`.

### Task 2: Add the table toggle and dual-amount detail

Add page-local native/USD display state to the shared transaction-browser controller and pass it to `TransactionBrowserToolbar` and `TransactionBrowser` from both owning page compositions. The browse toolbar uses a standard outline icon state toggle with `aria-pressed`, an accessible action label, and a tooltip; its glyph reflects the current multi-currency or `$` mode. Keep the selected state across paging, filtering, refreshes, detail opening, and temporary Edit mode, but reset to native when a browser instance mounts.

- [ ] Keep exactly one table amount chip: native in native mode, or the nullable USD value in USD mode. Reuse standard amount formatting and chip treatment, with a dedicated accessible `N/A` state, and leave existing `lineDisplayAmounts` and more-parts selection unchanged.
- [ ] Extend the full transaction detail amount rendering so every non-USD shape amount shows its native chip plus a USD/`N/A` chip beneath it, independent of the table mode. Keep USD-native detail amounts single-chip and keep the shared account-register peek on its existing native-only presentation.
- [ ] Preserve lifecycle styling, native amount editing, right alignment, and column-collapse behavior; adjust only the table replacement and detail stacking layout needed at supported widths.
- [ ] Add a focused `frontend/tests/e2e/transactions/amount-currency-display.spec.ts` covering one-chip native and USD table modes, USD rows without duplicates, stored non-USD values, null values, a complex server-aggregated amount, mixed-row `+`, Edit-mode native amounts, keyboard/accessibility state, and representative wide/narrow layout. Cover the full detail's mode-independent native+USD pairs and include one drill-down assertion to prove the shared table wiring.
- [ ] Update `docs/webui-design.md`, `frontend/src/features/ledger/PACKAGE.md`, and the existing implemented-web-UI summary in `PROJECT_STATE.md` with the final behavior; no theme-contract change is needed if existing toolbar-toggle and amount-chip treatments suffice.
- [ ] Commit as `feat(frontend): add USD transaction amount view`.
