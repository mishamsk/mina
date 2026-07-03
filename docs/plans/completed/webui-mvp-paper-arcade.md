# Plan: Web UI MVP — Paper Arcade theme + minimal Transactions slice

Implement the Paper Arcade base theme (`docs/webui-theme-paper-arcade.md`) and a deliberately minimal slice of the web UI design (`docs/webui-design.md`): app shell with sidebar navigation, a read-only-plus-entry Transactions page (transaction lines with inline expansion to records), and a docked spend-only entry panel. The goal is a vertical slice good enough for manual smoke testing, validating theme/usability decisions, and establishing frontend coding patterns — not feature completeness.

## Plan Context

- Validation slice, not milestone 1. Everything here must follow `docs/webui-design.md` and `docs/webui-theme-paper-arcade.md`, but most of their scope is intentionally excluded: no filters/search, no inline editing, no bulk operations, no peek panel, no Overview/balance strip (needs the balance API), no command palette, no income/refund/transfer/advanced entry tabs, no inline-create in pickers, no keyboard-complete tables (only `N` open entry, `Esc` close, `Cmd+Enter` submit).
- No backend plan is needed: `Transaction` responses already carry `transaction_class`, `primary_amounts`, `components`, and full nested `records`; `GET /api/transactions` is paginated; `POST /api/transactions/spend` covers entry; demo data comes from `mina serve --demo`.
- Counterparty titles: derived client-side from nested records purely as a display convention (per the summary-line rules in `docs/webui-design.md`); server-provided titles remain a listed Backend Addition for later. Class and amounts are always server values.
- Accounts, categories, tags, and members load as deliberately bounded lookup lists (allowed by `docs/frontend-architecture.md`) to resolve names and feed pickers.
- Routing is currently a hand-rolled path switch in `frontend/src/pages/router.tsx`. This plan introduces `react-router` (routes: transactions, status) and records the decision in `docs/frontend-architecture.md` in the same commit.
- Fonts (`@fontsource/silkscreen`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`) and icons (`pixelarticons`) install as npm packages bundled into the build; no runtime network fetches. Lucide remains as fallback where a pixel glyph is missing.
- Mina-specific display atoms (`AmountText`, `FqnPath`, `ClassBadge`) carry accounting meaning, so they live under `frontend/src/features/` (shared ledger feature area), not `components/`, per frontend package boundaries.

## Tasks

### Task/Commit 1: Paper Arcade theme foundation

Install fonts and icons, implement the token layer, and restyle the existing shadcn primitives to the theme spec. After this task the status page and all future screens render in Paper Arcade without per-screen styling work.

- [x] Add `@fontsource/silkscreen`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `pixelarticons` to `frontend/` dependencies; import font faces in `styles.css`
- [x] Implement the token layer in `frontend/src/styles.css`: shadcn variable values, extended namespace (`--color-money-in`, `--color-class-*` ink/bright pairs, `--shadow-pixel`, `--border-ink`), font family tokens, radius `0`, focus ring per spec
- [x] Restyle existing `components/ui` primitives (button, badge, card, checkbox, separator) per theme component notes: 2px ink outlines and pixel shadow on landmarks, button press-in active state, square badge
- [x] Add skeleton primitive with stepped dither animation honoring `prefers-reduced-motion`
- [x] Verify WCAG AA contrast for every token pair listed in the theme spec's verification contract; adjust only toward higher contrast
- [x] Manual smoke: status page renders in Paper Arcade via Vite dev server against `mina serve --demo`
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: App shell, routing, and navigation

Introduce the persistent app shell so every screen shares one structure. After this task the sidebar, page-header pattern, and routing exist; Status moves under the shell; Transactions has an empty routed page.

- [x] Add `react-router`; replace the hand-rolled path switch with routes for Transactions and Status; update `docs/frontend-architecture.md` routing ownership in the same commit
- [x] Build the sidebar per `docs/webui-design.md` Layout & Structure: all nav sections listed (Overview, Transactions, Accounts, Reference group, Status/Settings), with only Transactions and Status navigable and the rest rendered as disabled placeholders; collapsible to icon rail (persisted UI preference)
- [x] Build the shared page-header pattern (title left, actions right, toolbar row slot)
- [x] Landmark styling per theme (Silkscreen titles, ink outlines); data area stays quiet
- [x] Add/adjust e2e coverage: shell renders, navigation between Transactions and Status works
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Transactions page — lines, expansion, pagination

The minimal shared-browser core: classified transaction lines that expand inline to records, with server pagination. After this task demo data is browsable and the theme's "quiet data" rules are validated on a real dense table.

- [x] Add API entry points in `frontend/src/api` for transactions list plus bounded lookups (accounts, categories, tags, members); snapshot store per frontend-architecture rules
- [x] Build ledger display atoms under `features/`: `AmountText` (mono, tabular, sign, de-emphasized currency code, class-aware color), `FqnPath` (de-emphasized ancestors, truncation, tooltip), `ClassBadge` (bright fill + ink text per class, Silkscreen micro-label)
- [x] Build the transaction line row: initiated date, client-derived counterparty title, class badge, primary category path, display amount(s) from `primary_amounts`
- [x] Inline expansion to the records subtable: account path, signed amount, category, tags, member, memo, statuses (read-only)
- [x] Server-driven pagination (prev/next + page size), loading skeletons, empty state (pixel sprite + Silkscreen headline), error state with expandable API error
- [x] Add e2e coverage: demo data renders transaction lines; expanding a row shows its records; pagination works
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes
  - [x] With a clean worktree, run `just review-loop "<Transactions page slice: server-derived class/amounts only; counterparty title client-side display convention; bounded lookups for names; quiet-data theme rules>" <current commit sha>`

### Task/Commit 4: Docked spend entry panel

The entry pattern's proof: a non-modal docked panel on the Transactions page, spend tab only, optimized for batch entry. After this task the create→refresh loop, picker patterns, and the theme's signature press/stamp interactions are all exercisable.

- [x] Build `EntityPicker` (type-ahead combobox over bounded lookups, full-FQN search, hidden entities excluded) with account-type filtering variants: funding → `balance`, merchant → `flow`
- [x] Build the docked entry panel: opens via header action and `N`, closes via `Esc`, transactions list stays visible and interactive
- [x] Spend form mapping to `POST /api/transactions/spend`: date (defaults today), amount + currency, funding account, merchant, category, optional tags/member/memo; `Cmd+Enter` submits
- [x] Batch ergonomics: "Save and add another" default keeps the panel open with sticky date/funding account; session tally with stepped score-counter increment; saved transaction appears in the list via refetch-after-mutation
- [x] API validation errors map to fields; entered data never lost; draft persists to IndexedDB
- [x] Add e2e coverage: create a spend through the panel; it appears in the transactions list; save-and-add-another keeps sticky fields
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 5: State docs and smoke checklist

Close the slice: record progress and capture what the MVP is meant to validate so the manual pass is repeatable.

- [x] Update `PROJECT_STATE.md`: minimal web UI transaction browsing and spend entry implemented; Paper Arcade theme foundation in place
- [x] Update frontend package docs (`PACKAGE.md`) only where this work created implicit contracts not obvious from code
- [x] Manual smoke pass against `mina serve --demo`: theme legibility on dense table, press-in buttons, badge readability, expansion flow, batch entry rhythm — note usability findings for the design/theme docs rather than fixing ad hoc
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "<Web UI MVP: Paper Arcade theme + minimal Transactions slice; constraints: theme spec token contract, quiet-data rules, no client-side accounting derivation, scope exclusions per plan context>"`
- [x] Move this plan to `docs/plans/completed/`
