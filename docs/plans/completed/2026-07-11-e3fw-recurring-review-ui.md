# Plan: Recurring review screen for EXPECTED occurrences (`e3fw`)

Build the `/recurring` review page defined in `docs/webui-design.md` §8: the full-height table of EXPECTED recurring occurrences (scheduled date ascending, overdue emphasis) with Confirm and Dismiss actions, plus the Expected option in the transactions posting-status filter. This is the only UI path for confirming or dismissing occurrences.

## Plan Context

- Ground truth (operator-authored — do not edit docs): `docs/webui-design.md` §8 "Recurring review" — routed `/recurring` page in the primary sidebar section beneath Transactions; EXPECTED occurrences sorted by scheduled date ascending; columns: scheduled date, definition name (hierarchical path rendering), transaction summary (per the transaction-summary-line rules, derived from the definition shape), amount (standard amount rules), trailing actions; overdue (scheduled before today) rows carry a warning-treatment marker; Confirm = button-class action materializing immediately with the standard toast; Dismiss = button-class action behind the standard named confirmation (`ConfirmDialog`); API errors per standard feedback rules; quiet empty state; the transactions posting-status filter dimension includes Expected; definition management is out of scope. Semantics: `docs/recurring-transactions-semantics.md`. Theme: `docs/webui-theme-arcade-cabinet.md` (warning = yellow treatment, never color alone — pair with an icon/badge and tooltip).
- API surface (existing, no API work): `GET /api/recurring-occurrences` (status filter, sort by scheduled date, catch-up materialization on read — opening the page reflects occurrences through today), `POST /api/recurring-occurrences/{id}/confirm`, `POST /api/recurring-occurrences/{id}/dismiss`, `GET /api/recurring-definitions` for definition names/shapes. `posting_status=expected` is already supported by the transactions list APIs, and expected rendering already exists (`format.ts` postingStatusLabels, `line-icons.tsx` Calendar icon).
- Hard rule: the UI never re-derives accounting truths. Use only server-provided display values for the summary and amounts (check what the definition/occurrence responses expose — display title, record set with amounts/currencies). If the API provides no derived display amount for a definition shape, render the definition's record amounts verbatim (e.g., the primary record amount with currency) without classifying client-side; do not invent classification logic.
- Data access per `docs/frontend-architecture.md`: follow the established page-resource pattern (e.g., `use-members-resource.ts`) — a recurring feature directory owning the fetch/refresh hooks and page content; mutations refresh the occurrence list AND invalidate transaction/register/overview snapshots (a confirm materializes a real transaction).
- Sidebar: add "Recurring" between Transactions and Accounts (per the amended §Layout sidebar list), with a fitting pixel icon; collapsed-rail behavior consistent with other entries; the router registers `/recurring`.
- Overdue: compare scheduled_date to today's local civil date using the same local-date-safe comparison conventions as the day-navigation work (no `new Date("yyyy-mm-dd")` UTC parsing).
- Confirm/dismiss UX: Confirm fires immediately, shows "Occurrence confirmed." (or similar standard copy) and refreshes; Dismiss opens the shared `ConfirmDialog` naming the definition and scheduled date, destructive confirm, in-dialog API-error rendering; both actions disable during their in-flight request; row focus restoration follows the established row-delete patterns.
- Transactions filter: add Expected to the posting-status dimension in `transaction-filter-controls.tsx` (recently refactored — respect the `hiddenDimensions` mechanism and existing chip/URL wiring); expected lines then render with the existing label/icon; default lists remain unchanged when the filter is absent.
- Protect — do not regress: transactions page and drill-down embeddings (the filter-controls file is shared), toolbar geometry contracts, existing e2e suites, sidebar navigation behavior, command palette routed-page navigation (add the new page to palette navigation only if the palette derives pages automatically — do not hand-extend palette scope in this task).
- e2e (new `frontend/tests/e2e/recurring-page.spec.ts`): seed a recurring definition via `POST /api/recurring-definitions` with a schedule yielding at least one overdue and one future EXPECTED occurrence; the page lists them ascending with the overdue marker on the past one; Confirm removes the row, shows the toast, and the materialized transaction appears in the transactions list; Dismiss shows the named dialog, cancel keeps, confirm removes; empty state after processing all occurrences; direct nav and refresh; sidebar link navigates; a mocked API failure on confirm renders standard feedback. Plus: transactions page posting-status filter offers Expected and filtering shows an expected line with the Calendar icon/label.
- Update `PROJECT_STATE.md`: one line — recurring review screen surfaces EXPECTED occurrences with confirm/dismiss.
- Package docs: new recurring feature package doc if implicit contracts emerge (e.g., mutation refresh fan-out); otherwise "No implicit contracts."
- Follow `docs/TESTING.md`.
- Kata issue: `e3fw`.

## Tasks

### Task/Commit 1: Recurring review page with confirm/dismiss

- [x] Recurring feature (resource hooks + page content) and the `/recurring` route with sidebar entry: EXPECTED occurrences ascending with definition names, server-derived summary/amount rendering, overdue warning markers, loading/empty/error states.
- [x] Confirm (immediate + toast + refresh fan-out) and Dismiss (shared `ConfirmDialog`, destructive confirm, in-dialog errors) row actions, in-flight disabling, focus handling.
- [x] e2e: the page coverage matrix from Plan Context (list order, overdue marker, confirm flow incl. materialized transaction visibility, dismiss flow, empty state, direct nav/refresh, error feedback).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata `e3fw`
  - [x] Commit changes

### Task/Commit 2: Expected posting-status filter

- [x] Add Expected to the transactions posting-status filter dimension; expected lines render with the existing label/icon; defaults unchanged without the filter.
- [x] e2e: filter offers Expected; selecting it surfaces an expected line; removing it restores defaults.
- [x] Update `PROJECT_STATE.md` (one line) and the recurring package doc.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata `e3fw`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Recurring review page per webui-design §8: EXPECTED occurrences ascending with overdue emphasis, immediate Confirm with toast and refresh fan-out, Dismiss behind ConfirmDialog, Expected posting-status filter option; server-derived display values only; no definition management; transactions/drill-down embeddings unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `e3fw` only after the plan is moved to completed
