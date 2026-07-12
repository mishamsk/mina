# Plan: Account credit-limit UX — empty-state add button + credit-card indicator (Kata gwrc)

Two credit-limit UX refinements per Misha's 2026-07-11 review, governed by the operator-amended `docs/webui-design.md` accounts bullets (read them first; do not edit ground-truth docs):

1. Empty state: when an account has no credit-limit history, the credit-limit section renders as a single "Add credit limit" button; activating it reveals the full current editor UI. Once at least one entry exists, the current section renders as today.
2. Indicator: accounts WITH credit-limit history show a small credit-card icon immediately right of the account name — in the name area, never the actions column — on the chart-of-accounts row and the account page header. Pure indicator, no affordance.

## Plan Context

- Kata issue: `gwrc`.
- MANDATORY pre-reads: the amended `docs/webui-design.md` credit-limit bullets, `docs/webui-theme-arcade-cabinet.md` (indicators = bare glyphs, no press/hover affordance), `docs/frontend-architecture.md`, `docs/TESTING.md`.
- Surfaces (decided): chart-of-accounts rows AND the account register page header. No other surfaces.
- Data sources (from the issue): the accounts list has no credit-limit flag. Bulk indicator source for the tree: `credit_limit` on `GET /api/accounts/balances` (`AccountBalance.credit_limit`) — the accounts page already consumes balances for the BALANCE column; reuse that resource, do NOT add a new endpoint or N+1 per-account calls. Account page header: the account page already loads what it needs (balances and/or `GET /api/accounts/{id}/credit-limit-history` — reuse whatever is already fetched; add the history call only if nothing loaded exposes the flag).
- Note: `credit_limit` on balances reflects the CURRENT limit; an account whose history exists but nets to no current limit may report none — acceptance follows the balances flag for the tree (bulk), and the page header may use the more precise history if already loaded. Keep it simple and consistent; note the choice in the kata close.
- Empty-state button: arcade-styled secondary button inside the credit-limit section of the accounts side panel (and page header section if the editor also lives there — check `accounts-side-panel.tsx` credit-limit block and the account page). Activating reveals the existing editor UI (client-side state; no persistence until the user saves an entry). Only the FIRST-entry flow changes; sections with existing rows are untouched.
- Icon: a small credit-card glyph (pixelarticons set) right of the name, `--muted-foreground` tint per the theme's indicator rules, with an accessible label (e.g. `aria-label`/tooltip "Has credit limit"). Must not affect row activation or FQN truncation behavior.
- e2e (`accounts-page.spec.ts` patterns): empty-state button appears for an account without history and reveals the editor; after adding an entry the normal section persists; the indicator shows on the tree row and page header for an account with a limit (demo data seeds credit limits for the credit cards) and is absent otherwise; the icon carries no button role.
- Docs: no further ground-truth edits. No PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: Empty-state add button

- [x] Implement the first-entry empty state per Plan Context.
- [x] e2e coverage for the reveal flow and post-first-entry persistence.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `gwrc` (`kata comment gwrc --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Credit-card indicator

- [x] Implement the indicator on chart-of-accounts rows (balances-driven) and the account page header per Plan Context.
- [x] e2e coverage for presence/absence and non-affordance.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `gwrc`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Credit-limit UX (kata gwrc): first-entry empty state renders a single Add credit limit button revealing the existing editor; credit-card indicator right of the account name (name area, indicator affordance class) on chart-of-accounts rows (driven by AccountBalance.credit_limit from the already-consumed balances resource, no new endpoints) and the account page header; per operator-amended webui-design; e2e for reveal flow, indicator presence/absence, non-affordance"`
- [x] Move this plan to `docs/plans/completed/`
