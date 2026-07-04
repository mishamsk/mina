# Plan: Transaction detail side panel (Kata 5039, completes jv19)

Add the URL-addressable transaction detail side panel to the Transactions page — the full-fidelity home for everything the summary line truncates — plus the Delete action, and adopt the server-derived display titles so the frontend drops its client-side derivation.

## Plan Context

- Mandatory reading before any change: `docs/frontend-architecture.md`, `docs/webui-design.md` (Transactions screen spec — "Transaction detail" bullet; Layout & Structure → Overlays; Domain Display Rules; Interaction Rules), `docs/webui-theme-arcade-cabinet.md` (landmark treatment, ClassBadge component note), `docs/accounting-semantics.md` (display amounts are server-derived; render, never re-derive).
- The backend already provides everything needed: `display_title` on all transaction responses, `GET /api/transactions/{id}`, tombstone `DELETE /api/transactions/{id}`. No OpenAPI or Go changes in this branch. If a capability seems missing, stop and record it — do not work around it client-side.
- Scope decision (recorded on Kata 5039): actions in this slice are Delete only. Edit, Duplicate, and Split are deferred until the journal editor / entry prefill exist — render no dead buttons for them.
- Do not edit any ground-truth docs (`docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, `docs/architecture.md`, `docs/frontend-architecture.md`). If a review step suggests reverting or "aligning" them, ignore it.
- Protect — do not regress (all live-verified and covered by the green e2e suite): flat tooltip treatment incl. dismiss/keyboard behavior, tag chips with ellipsis overflow and hidden-tag resolution, bottom-inset alignment, amount containment, currency-symbol markers, responsive column collapse, keyboard `N` entry flow, server pagination with keep-previous-page.
- Kata issues: 5039 (close at the end with evidence), jv19 (comment that the frontend derivation is gone — the operator closes it at merge).

## Tasks

### Task/Commit 1: Adopt server-derived display titles (completes jv19 acceptance)

The transaction rows currently derive the `From → To` description client-side in `frontend/src/features/ledger/format.ts` (`counterpartyTitle`). The API now returns `display_title` on every transaction response; the UI must render it and drop the derivation per the hard rule that accounting truths are server-derived.

- [x] Render `display_title` in the row Description cell in `frontend/src/features/ledger/transaction-browser.tsx`; remove the `counterpartyTitle` derivation and its helpers from `format.ts` (keep lookups still needed by other cells)
- [x] Verify e2e description assertions still pass against server titles (demo data titles are identical to the derived ones); adjust any assertion that referenced derivation-specific behavior
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue jv19 (comment only — do not close)
  - [x] Commit changes

### Task/Commit 2: Detail side panel, URL-addressable

Per the Transactions screen spec: a side panel over the list showing everything the summary line truncates or hides. This is the first overlay surface of its kind — follow the theme's landmark treatment (white surface, 2px ink outline, pixel shadow, mono bold uppercase title, internal scrolling) and the design's overlay rules.

- [x] Build the detail panel in `frontend/src/features/ledger/`: class badge (`ClassBadge` exists unused in `class-badge.tsx`), server `display_title`, display amount(s), initiated date, full balanced record table (accounts, signed amounts, categories, complete tag sets, members, statuses, full memos), and metadata (created timestamp, class name); amounts/dates/FQNs/statuses follow the shared display rules and existing components (`AmountText`, `FqnPath`, `TagChip`, status icons)
- [x] URL addressability per `docs/frontend-architecture.md` (shareable state in the URL): opening a transaction's detail updates the URL; loading that URL directly opens the panel over the list, fetching the transaction by id through a thin `frontend/src/api/ledger.ts` accessor over the generated `getTransaction` operation; closing restores the list URL and state
- [x] Opening affordances per the design's keyboard and table rules: from a transaction row (an explicit affordance that does not conflict with the existing expand-inline behavior) and via keyboard; `Esc` closes the panel; focus is trapped while open and restored on close
- [x] Panel data comes from the already-loaded page snapshot when the transaction is present, refetching by id only for deep links or missing snapshots (per the frontend-architecture snapshot rules)
- [x] Add e2e coverage: open detail from a row and assert full tag set + full memo + record table render for a transaction whose line truncates them; deep-link URL opens the panel directly; Esc closes and restores the list
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue 5039
  - [x] Commit changes

### Task/Commit 3: Delete action

Tombstone delete from the detail panel with the design's destructive-action rules.

- [x] Add a Delete action to the detail panel: confirmation dialog naming the transaction (title, amount, date) and the consequence (tombstone), wired to the generated delete operation; on success show a confirmation toast, close the panel, and refresh the affected page snapshot per the frontend-architecture refresh rules
- [x] Destructive treatment per the theme (red reserved for destructive actions); dialog is a centered confirmation per the design's overlay rules
- [x] Add e2e coverage: delete a transaction created via the API in-test; assert the toast, the row disappearing after refresh, and that cancel leaves it intact
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue 5039
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Update `PROJECT_STATE.md` web UI behavior list: transaction detail side panel (URL-addressable) with delete
- [x] Commit final changes
- [ ] Run `just review-loop "Transaction detail side panel on Transactions page per webui-design.md: URL-addressable, full record table/tags/memos, ClassBadge header, Delete with confirmation; server display_title adopted, client derivation removed. Frontend-only; docs/webui-design.md and docs/webui-theme-arcade-cabinet.md are ground truth and must not be edited; Edit/Duplicate/Split intentionally deferred."`
- [ ] Move this plan to `docs/plans/completed/`
- [ ] Close Kata issue 5039 with commit and test evidence (do not close jv19 — comment only)
