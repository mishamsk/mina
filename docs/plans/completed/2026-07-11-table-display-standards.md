# Plan: Table display standards — page sizes, FQN width, single-line amounts (Kata 80qv, a4py, s4wf)

Three small, disjoint table-display fixes from Misha's 2026-07-11 UI review, one commit each:

1. `80qv`: standardize page sizes — every table defaults to 25; transaction tables (including account/group registers) offer 25/50/100 with 50 default.
2. `a4py`: chart of accounts Name column middle-truncates FQN segments (e.g. `bank:Chase:fees` truncating "Chase") even with abundant free width — let the column consume available width and truncate only under genuine constraint.
3. `s4wf`: register AMOUNT/RUNNING cells can wrap the currency marker onto a second line — amounts must be single-line at every collapse-ladder step.

## Plan Context

- Kata issues: `80qv`, `a4py`, `s4wf`. One sub-branch, three independent commits.
- MANDATORY pre-reads: `docs/webui-design.md` (tables/amount display rules — amounts are tabular, right-aligned, single-line; no doc changes needed or allowed), `docs/frontend-architecture.md`, `docs/TESTING.md`.
- 80qv decisions (decided):
  - Transaction tables = the shared transaction browser AND the account/group registers (per the issue's recommendation): options 25/50/100, default 50.
  - All other paginated tables default to 25 (audit for any other Rows selects/page-size constants; the reference tables currently may not paginate — touch only what exists).
  - Code anchors: `frontend/src/features/ledger/transaction-page-position.ts:11-12` (`defaultTransactionPageSize = 10`, `transactionPageSizes = {10,25,50}`), `transaction-browser.tsx:84` (`pageSizeOptions = [10,25,50]`), register page sizes in `frontend/src/features/accounts/account-register-table.tsx` / `account-group-page-content.tsx` / `pages/account-page.tsx`.
  - URL `pageSize` validation keeps working against the NEW option sets: an out-of-set value (including old `10`) falls back to the new default — assert this.
  - e2e: many specs assert or navigate URLs with `pageSize=10/25/50` and select "25" in Rows — update all affected assertions/interactions deliberately; keep each spec's behavioral intent. Specs that relied on tiny pages to force pagination may select 25 explicitly.
- a4py direction: the Name column in `frontend/src/features/accounts/accounts-tree.tsx` renders `FqnPath` (`:686,:709`; component in the ledger feature). Let the Name column grow into available table width (the table uses fixed percentage columns per the design doc — rebalance the percentages or make Name the flexible column) so FQNs render fully whenever space allows; middle-truncation only under real constraint. Verify at 1200/1440/1920 widths with deep demo hierarchies (e2e assertions at two viewport widths: short FQNs fully visible at wide viewport; truncation still engages at narrow).
- s4wf direction: plain-text `AmountText` cells in the register (`account-register-table.tsx:463,477` incl. running balance) and any other non-chip table AmountText must never wrap — enforce single-line (e.g. `whitespace-nowrap` on the cell/inline container) and ensure the column min-widths in the collapse ladder accommodate the widest amount rather than wrapping. Acceptance per the issue: AMOUNT and RUNNING cells never wrap at any collapse step; rows stay single-height; e2e asserts single-line rendering (bounding-box height or `whitespace` computed style) at the problematic width (1440x900, Joint register on demo data — the reported repro).
- No ground-truth doc edits. Update `frontend/src/features/ledger/PACKAGE.md` or accounts feature docs only if a documented contract changes (page-size defaults are not doc-level contracts). No PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: 80qv — page-size standardization

- [x] Update the transaction page-size set/default (25/50/100, default 50) in `transaction-page-position.ts` and the Rows options in `transaction-browser.tsx`; apply the same set/default to the account/group registers; default 25 for any other paginated table page-size definitions found in the audit.
- [x] Keep URL validation: out-of-set `pageSize` (incl. legacy 10) falls back to the new default.
- [x] Update affected e2e specs deliberately; add assertions for the new defaults and the fallback behavior.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `80qv` (`kata comment 80qv --agent ...`)
  - [x] Commit changes

### Task/Commit 2: a4py — chart of accounts Name column width

- [x] Let the accounts-tree Name column consume available width per Plan Context; truncation only under genuine constraint.
- [x] e2e: wide-viewport full-FQN assertion + narrow-viewport truncation assertion.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `a4py` (`kata comment a4py --agent ...`)
  - [x] Commit changes

### Task/Commit 3: s4wf — single-line register amounts

- [x] Enforce single-line AMOUNT/RUNNING (and other plain-text table AmountText) rendering per Plan Context.
- [x] e2e: single-line assertion at the reported repro (Joint register, 1440x900) and at a collapse-ladder step.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `s4wf` (`kata comment s4wf --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Table display standards (kata 80qv, a4py, s4wf): page sizes standardized (transaction browser + registers 25/50/100 default 50, other tables default 25, URL pageSize falls back to default on out-of-set values incl. legacy 10); accounts-tree Name column grows into available width with truncation only under real constraint; register amount/running cells enforced single-line at all collapse steps; three disjoint commits; no ground-truth doc changes"`
- [x] Move this plan to `docs/plans/completed/`
