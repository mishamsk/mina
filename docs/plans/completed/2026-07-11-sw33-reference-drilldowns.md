# Plan: Category, tag, and member drill-down pages (`sw33`)

Add URL-addressable read-only detail pages `/categories/:categoryId`, `/tags/:tagId`, and `/members/:memberId`: entity metadata plus a newest-first transactions preview through the shared `TransactionBrowser`, a "View all transactions" link carrying the matching filter query, and (for categories/tags) descendants included by default with a "This level only" control. Direct navigation, refresh, loading, empty, and not-found states all work.

## Plan Context

- Ground truth: `docs/webui-design.md` §"One shared browser" (the browser is built once and embedded pre-filtered; identical behavior in every embedding, including the peek/detail panel) and §6 (every dictionary entity is a drill-down target with its own page embedding the shared browser pre-filtered to it; category and tag pages roll up descendants by default with a "this level only" toggle; member pages show the transactions attributed to that member through the same shared-browser embedding). Header pattern per §Layout (title + optional breadcrumb left, actions right); URL-addressable detail pages. Theme doc for page framing.
- Precedents to mirror: the account and account-group pages (`frontend/src/pages/account-page.tsx`, `account-group-page.tsx`) — routed entity pages embedding a browser with a header; route registration in `frontend/src/pages/router.tsx`.
- API reality: `GET /api/transactions` supports repeated `category`, `tag`, `member` id filters with flat `IN` semantics (`internal/store/transactions.go:404-420`); descendant rollup is CLIENT-side — resolve the descendant id set from the loaded reference tree data (categories/tags stores already derive FQN hierarchies) and pass all ids; "This level only" passes just the entity id. Do not add API surface.
- Page content:
  - Metadata header: entity FQN (segmented-path rendering per the FQN display rules), entity-specific badges (category intent badge; hidden indicator where applicable), and a "View all transactions" action linking to `/transactions?category={id}` / `?tag={id}` / `?member={id}` respectively (the transactions page already reads these URL filters; for the rolled-up default on categories/tags, the View-all link carries the same id set the preview uses).
  - Preview: the shared `TransactionBrowser` pre-filtered, newest-first (existing default ordering), with its standard pagination and the working peek/detail panel; the quick-delete and open-detail row actions must work here identically (the browser embedding contract from `pj89` — wire the required `onDeleteTransaction` with the standard refresh + toast).
  - Categories/tags: "This level only" toggle (URL-backed state so refresh preserves it) switching between rolled-up and exact-id filtering.
- States: loading skeletons shaped like the final content; empty preview state; not-found (unknown/tombstoned id) renders a clear not-found presentation, no crash; direct navigation and refresh work (all state URL-derived).
- Keep pages thin: data fetching through existing stores/clients; a shared drill-down page shell is fine if it reduces drift across the three pages without inventing an abstraction beyond them.
- Protect — do not regress: existing list pages and their routes; transactions page URL filters; shared browser behavior in its existing embeddings; command palette; all existing e2e.
- e2e (new spec or extensions per page): direct navigation to each page shows metadata + filtered preview; descendant rollup default vs "This level only" changes the visible set (fixture: parent/child categories with transactions on each); View-all link lands on `/transactions` with the filter applied; member page shows only attributed transactions; not-found id path; refresh preserves state; peek/detail panel works in the embedding.
- Update `PROJECT_STATE.md`: one line — reference drill-down pages exist.
- Package docs: add/update page or feature package docs only if a non-obvious contract emerges (e.g., descendant-rollup ownership).
- Follow `docs/TESTING.md`.
- Kata issue: `sw33`.

## Tasks

### Task/Commit 1: Category drill-down page and the shared page shell

- [x] Route `/categories/:categoryId` with the metadata header (FQN path, intent badge, hidden indicator, View-all link), shared-browser preview with descendant rollup by default and the URL-backed "This level only" toggle, loading/empty/not-found states, and the pj89 delete wiring.
- [x] e2e: direct nav, rollup vs this-level, View-all link, not-found, refresh, peek panel.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata `sw33`
  - [x] Commit changes

### Task/Commit 2: Tag and member drill-down pages

- [x] Route `/tags/:tagId` (same shape as categories, tag filter + rollup/toggle) and `/members/:memberId` (metadata + attributed-transactions preview, View-all link, no rollup control), reusing the Task-1 shell.
- [x] e2e: both pages' direct nav, filters, View-all, not-found; member attribution correctness.
- [x] Update `PROJECT_STATE.md` (one line) and package docs if contracts emerged.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata `sw33`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "URL-addressable category/tag/member drill-down pages embedding the shared TransactionBrowser pre-filtered with client-side descendant rollup and This-level-only toggle, View-all links, and full state handling; no API changes; existing embeddings and list pages unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `sw33` only after the plan is moved to completed
