# Plan: Post-fleet UI follow-ups sweep — amount-chip depth, bare parts indicator, decluttered detail record table, lifecycle test relocation

Multi-amount transaction rows render their amount chip with the same raised chip treatment as every other amount chip; the more-parts indicator is a bare, vertically centered `+` glyph with a hover tooltip and no independent click/focus target; the transaction detail record table shows only role glyph, account, amount, and category per row with everything else in the per-record disclosure as plain text; and the `mina_transaction_lifecycle.txt` integration script is removed with its unique coverage living in regular Go tests.

## Plan Context

- Unfiled user feedback on the ui-papercuts fleet result (no Kata refs); this plan is the single follow-up sweep and restates the full ground-truth scope. It runs on sub-branch `ui-followups` off `ui-papercuts`.
- Four user directives (implement, do not relitigate):
  1. **Amount chip on multi-amount rows looks flat.** On the transactions list, a multi-amount (more-parts) transaction's amount chip visually lacks the raised arcade chip treatment its single-amount neighbors have. Operator hypothesis (verify live before fixing): `frontend/src/features/ledger/transaction-browser.tsx:1850` adds `overflow-hidden` to the amount cell's flex container when `hasMoreParts`, which clips the chip's offset `--shadow-chip` box-shadow. Required outcome: the amount chip on multi-amount rows uses the exact same visual design (border, shadow, height, typography) as single-amount chips, on every surface where the row rule renders an amount plus the indicator (transactions browser, overview recent activity, command palette, entry-modal rail). Preserve truncation/overflow correctness — the chip must not overlap neighbors or overflow the cell.
  2. **`+ parts` indicator is ugly.** Replace the `MorePartsIndicator` chip (`frontend/src/features/ledger/mixed-sentinel.tsx`) with a bare, vertically middle-aligned `+` icon: no words, no chip frame (indicator-class per `docs/webui-theme-arcade-cabinet.md` — bare glyph, no press/hover affordance), not independently clickable or keyboard-focusable (remove `tabIndex`; clicks fall through to the row). Keep the hover tooltip enumerating all part amounts and keep an accessible name on the glyph so screen readers still announce it in row content. Apply on all surfaces using the shared component; drop now-dead `compact`/`focusable` props if nothing needs them. Update e2e tests that pin the `+ parts` text or its focusability; the previously recorded residual "palette more-parts tooltip not independently keyboard-focusable" is now the designed behavior everywhere.
  3. **Detail record table is cramped; category chip overlaps the amount.** In `TransactionDetailPanel`'s record table (`frontend/src/features/ledger/transaction-detail-panel.tsx`, `DetailRecordsTable`), stop cramming everything into one row. Row columns become: the narrow record-role glyph column, Account, Amount, Category — nothing else. Tags, Member, Status, and Memo columns are removed; those values appear only in the existing click-open per-record disclosure, rendered as **plain text** (tag FQNs, member name — no chip components for categories, tags, or members in the disclosure). The disclosure already lists dates, posting status, role, source, and memo; add tags and member to it. Keep: cancelled-row strikethrough treatment, the role glyph column (deliberate operator decision — it is the y8fz record-role vocabulary shared with the register peek and takes no meaningful width), category rendered as the full-chip FQN path with its filter behavior, account path links, row-activation disclosure toggle, and the panel's fully read-only contract. The category chip must never overlap or crowd the amount at any panel width — verify at narrow widths live. The register peek record table and the transaction list are out of scope.
  4. **`cmd/mina/testdata/script/mina_transaction_lifecycle.txt` is not warranted as an integration script.** Delete the file. Before deleting, check whether the behaviors it pins (direct post → `posted_date` end-of-day stamp with null `pending_date`; pending create → `pending_date` end-of-day stamp with null `posted_date`; bulk post of pending records → preserves `pending_date`, sets `posted_date`) are already covered by regular Go tests (service/apptest level, e.g. `internal/services/transactions`); add regular-test coverage only for behaviors not already pinned. Do not add any new integration scripts.
- Amounts and lifecycle values are server-derived; no client-side re-derivation (hard rule, `docs/webui-design.md`). Directive 3 changes presentation only.
- `docs/webui-design.md` updates (minimal, replace-not-append): the Screen 2 transaction-detail description (record table columns and disclosure contents) and any statement describing the more-parts indicator's form if its wording no longer matches. `frontend/src/features/ledger/PACKAGE.md` if its amount/indicator wording changes. The operator reviews the doc diff.
- Ground truth: `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, `docs/accounting-semantics.md`, `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test`, `just test-integration` (directive 4 touches integration scripts), `just test-frontend-e2e`.

## Tasks

### Task 1: Amount-chip depth on multi-amount rows

- [x] Reproduce the flat chip live on the demo dataset (`just dev --demo`), record the mechanism, and fix it so multi-amount rows' amount chips are visually identical to single-amount chips on all four row surfaces; verify no chip/indicator overlap or cell overflow on long amounts.
- [x] Commit as `fix(frontend): restore raised chip treatment on multi-amount row amounts`.

### Task 2: Bare `+` more-parts indicator

- [x] Rework `MorePartsIndicator` per directive 2 (bare centered `+` glyph, tooltip kept, accessible name kept, no independent click/focus target), adjust all call sites and affected e2e tests, and verify live on the transactions list, overview, command palette, and entry-modal rail.
- [x] Commit as `fix(frontend): replace parts chip with bare plus indicator`.

### Task 3: Declutter the detail record table

- [x] Restructure `DetailRecordsTable` per directive 3 (role/account/amount/category rows; tags, member, status, memo as plain text in the disclosure only; no chips in the disclosure), update column widths so category never overlaps the amount at any panel width, update `docs/webui-design.md` minimally, and verify live on the demo dataset including a record with tags + member + memo and a cancelled record, at narrow and wide panel widths.
- [x] Update or add e2e coverage pinning the new column set and the disclosure contents (tags and member reachable via disclosure, no chip test-ids inside the disclosure).
- [x] Commit as `fix(frontend): declutter detail record table into row plus disclosure`.

### Task 4: Relocate lifecycle coverage out of integration scripts

- [x] Verify which behaviors pinned by `cmd/mina/testdata/script/mina_transaction_lifecycle.txt` are already covered by regular Go tests; add regular-test coverage for any that are not, then delete the script.
- [x] Commit as `test: move transaction lifecycle coverage from integration script to unit tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-29-ui-followups-sweep.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
