# Plan: Fit-based folding and centered folded layout for reference-table row actions (`ja9z`)

Make the trailing row-action cluster on Accounts, Categories, and Tags fold into the overflow (⋯) menu only when the actions column genuinely cannot fit the full action cluster, and center the persistent toggles plus the overflow trigger in the actions cell when folded. Preserve hover/focus reveal, persistent toggle visibility, Arcade Cabinet affordance styling, and all existing table interactions.

## Plan Context

- Ground truth: `docs/webui-design.md` — per-row actions live in one narrow trailing column; button-class actions are revealed on row hover and row focus; state toggles stay persistently visible; actions never collapse into an overflow menu for count reasons — only the narrow-screen column-collapse rule folds them. `docs/webui-theme-arcade-cabinet.md` — affordance classes for icon buttons, the overflow control, and flat toggle icons.
- Current defects (REF-2 audit, Kata `ja9z`):
  - `frontend/src/styles.css:459-467` folds all `.accounts-table` button actions at container width ≤960px even when they fit — at a 1200px viewport the Accounts actions column still has ~123px usable. `frontend/src/styles.css:469-477` does the same for `.reference-table` at ≤720px.
  - When folded, the persistent toggles and the overflow trigger are biased to one side of the actions cell instead of centered.
- Mechanism today: `frontend/src/components/row-actions.tsx` renders hover/focus-revealed icon buttons (`.row-actions-button`, opacity-based reveal in `frontend/src/styles.css:228-236`) plus persistent toggles (`.row-actions-toggle`); the overflow trigger is hidden by default (`styles.css:239-241`) and shown by the per-table container queries. Toggles already stay visible when folded — keep that.
- Fold trigger must be derived from actual fit: fold only when the actions cell's available inline size cannot fit that table's full action cluster (all buttons + toggles + gaps). Prefer a CSS container-query solution keyed to the actions cell's real available width (e.g., make the actions cell its own inline-size container); do not add JavaScript resize measurement, and do not fold per-row differently within one table — the threshold is keyed to the table's full cluster so every row folds at the same width.
- The mechanism must live in the shared `RowActions` component and shared CSS/classes so tables gaining actions later (Members, reference delete actions) inherit it without per-page hacks. Members currently renders no row actions; no Members-specific change belongs in this plan.
- Protect — do not regress: transactions-table and account-register-table column-collapse rules in `frontend/src/styles.css` (their fold behavior is owned by the documented collapse priority and is out of scope); the `RowActions` usage in `frontend/src/features/ledger/transaction-browser.tsx`; hover/focus reveal of button actions; persistent toggle visibility in all states; keyboard access (row focus reveals buttons; folded overflow trigger reachable and its menu operable by keyboard); empty/error/skeleton states; sticky headers and internal table scrolling (`frontend/tests/e2e/reference-table-layout.spec.ts` must stay green); Arcade affordance styling.
- No `PROJECT_STATE.md` update: this corrects existing documented behavior, it adds no new capability.
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `ja9z`.

## Tasks

### Task/Commit 1: Fold row actions only when they do not fit, center the folded cluster, and verify in the browser

Replace the arbitrary per-table fold breakpoints with a fit-derived trigger on the actions cell, fix folded-state centering, and add browser regression coverage tied to measured geometry rather than fixed breakpoints.

- [x] Rework the fold trigger for `.accounts-table` and `.reference-table` row actions so button actions fold into the overflow menu only when the actions cell cannot fit the table's full action cluster; all actions remain visible (hover/focus-revealed) whenever they fit, including a 1200px-wide viewport on Accounts.
- [x] When folded, render the persistent toggles and the overflow trigger horizontally centered within the actions cell on Accounts, Categories, and Tags; header and cell alignment agree in both folded and unfolded states.
- [x] Keep flat toggles visible in every state; keep edit/move/delete (and the folded overflow trigger) revealed on row hover and keyboard row focus; the overflow menu opens and activates actions via keyboard.
- [x] Keep the fold/centering mechanics in shared `RowActions` markup and shared CSS classes; no changes to transactions-table or account-register-table collapse rules and no breaking change to the `RowActions` API used by the transaction browser.
- [x] Add frontend e2e coverage: on Accounts, Categories, and Tags, (a) at 1440×900 and 1200×900 a hovered/focused row shows all button actions and no overflow trigger; (b) at a genuinely narrow layout the button actions are folded, the overflow trigger plus toggles remain visible and are centered in the actions cell within a small geometry tolerance, and the overflow menu opens and triggers an action; (c) assert fold state against the measured fit predicate (folded if and only if the measured actions-cell width cannot fit the measured action cluster) rather than hardcoded breakpoints where practical.
- [x] Keep tests at browser/API boundaries; no Tailwind class-string assertions; reuse existing e2e fixture conventions (unique names that sort after demo data).
- [x] Update `frontend/src/components/PACKAGE.md` (or the owning feature package doc) only if the fold contract becomes an implicit cross-package invariant that is not obvious from the code; no package-doc change is needed because the typed `foldCount` prop names the contract.
- [x] Add Kata `ja9z` progress and verification evidence.
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
- [x] Run `just review-loop "Fold reference-table row actions only when the actions cell genuinely cannot fit them; center folded toggles and overflow; preserve hover/focus reveal, persistent toggles, keyboard access, and transactions/account-register collapse rules"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `ja9z` only after the plan is moved to completed
