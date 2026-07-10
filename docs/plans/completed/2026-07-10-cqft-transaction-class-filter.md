# Plan: Promote transaction class to a standing toolbar filter (`cqft`)

Add an always-visible Transaction class dropdown to the transactions toolbar beside Search and Go to day, owning the existing URL-backed `class=` state and `transaction_class` API filter, and remove class from the generic Add Filter menu so there is exactly one source of truth.

## Plan Context

- Ground truth (already amended by the operator — do not edit docs): `docs/webui-design.md` — transaction class filters from a standing toolbar dropdown beside search and date jump; it is no longer an Add-filter dimension; the dropdown owns the URL-backed class state. Also `docs/accounting-semantics.md` for the class set and `docs/webui-theme-arcade-cabinet.md` for control styling.
- Current state: class is an enum dimension inside the Add Filter popover producing multi-value chips (`frontend/src/features/ledger/transaction-filter-controls.tsx:35,587-597,862-872`, `filters.classes` array) with URL-backed state and the `transaction_class` request filter wired through the existing filters module. The toolbar (`frontend/src/pages/transactions-page.tsx:~250-325`, labeled columns: Search, Go to day, then the 36×36 Add-filter trigger and inline chips from Kata `qwjb`) is the insertion point.
- Dropdown semantics:
  - A native select styled like the Accounts page type filter (`frontend/src/pages/accounts-page.tsx` "All types" select — h-9, labeled column "Class" following the toolbar's label pattern), options "All classes" plus the server-defined class set used by the existing enum editor.
  - Single-select owner of the class state: choosing a class writes the URL and applies the `transaction_class` API filter; "All classes" clears it. The UI no longer produces multi-class states.
  - Hand-crafted URLs with multiple `class` values must degrade deterministically without crashing: continue applying the multi-class filter to the API request, render the dropdown in a sensible state (e.g., first value or a transient "Multiple" indication), and normalize to the dropdown's single value on the next user change. Reload, direct links, and back/forward keep expected state.
- Remove class from the Add Filter menu: drop the dimension from the popover and remove class chips from the chip row (the dropdown displays the active class itself). One source of truth — no chip duplication for class.
- Toolbar geometry: preserve the Kata `qwjb` stability contract — inserting the dropdown must keep the Add-filter trigger 36×36 aligned with the control row and must not break the geometry e2e assertions (`frontend/tests/e2e/transactions-page.spec.ts:796-862`); update those assertions only where the toolbar's static composition legitimately changed.
- Protect — do not regress: search and date-jump behavior; remaining Add Filter dimensions and chips; URL-backed state for all other filters; transactions browser + pagination; entry panel; existing transactions e2e coverage (adapt tests that used class chips deliberately).
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `cqft`.

## Tasks

### Task/Commit 1: Standing class dropdown owning class state

- [x] Add the labeled Transaction class dropdown to the transactions toolbar beside Search and Go to day (accounts type-select styling, h-9, "All classes" default), reading and writing the existing URL-backed class state and driving the existing `transaction_class` API filter.
- [x] Remove the class dimension from the Add Filter popover and class chips from the chip row; the dropdown is the single source of truth. Multi-class URLs degrade deterministically per Plan Context.
- [x] Keep toolbar geometry stable per the qwjb contract; adjust the geometry e2e only for the legitimate static composition change.
- [x] Extend `frontend/tests/e2e/transactions-page.spec.ts`: selecting a class filters the list and writes the URL; "All classes" clears it; direct URL with `class=` preselects the dropdown and filters; reload and back/forward preserve state; the Add Filter menu no longer offers Transaction class; a multi-class hand-crafted URL still filters and does not crash the toolbar.
- [x] Update `PROJECT_STATE.md` with a one-line note that transaction class is a standing toolbar filter.
- [x] Update the ledger package doc only if a non-obvious contract emerges.
- [x] Add Kata `cqft` progress and verification evidence.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Promote transaction class to an always-visible toolbar dropdown owning the URL-backed class state; remove it from Add Filter; preserve qwjb toolbar geometry, other filters, and URL semantics"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `cqft` only after the plan is moved to completed
