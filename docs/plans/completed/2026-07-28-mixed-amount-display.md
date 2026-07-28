# Plan: Mixed-class amount display — one honest amount plus a more-parts indicator (unfiled fleet Brief B)

Mixed-class transaction rows render at most one amount — the spend/income economic amount when identifiable, otherwise none — always with a compact accessible indicator that more parts exist. Row height is constant across all classes; no `/`-joined or `×2`-style composite values appear in any list row; exchange and simple-class rendering are unchanged; complete amounts stay in the transaction detail.

## Plan Context

- Unfiled user-reported regression (no Kata ref) from the accounting-semantics merge; this plan restates its full ground-truth scope from the fleet plan's Brief B (`docs/plans/2026-07-26-ui-papercuts-fleet.md`).
- Observed live 2026-07-26 on the demo dataset: a mixed spend+transfer row renders amounts on two lines (violating `docs/webui-design.md`'s single-height row rule) and/or two inline values whose second reads like `100x2` — nonsensical to a reader.
- Mechanism (operator-verified): `lineDisplayAmounts` (`frontend/src/features/ledger/format.ts:308`) returns, for mixed transactions, `primary_amounts` **plus** all transfer-shape amounts, and row surfaces render the whole array. Amounts are server-provided (`primary_amounts`, `shapes[].amounts`) per `frontend/src/features/ledger/PACKAGE.md` — no client-side re-derivation of accounting truths; this change only selects and presents server values.
- Decided presentation rule (user-decided direction; implement, do not relitigate):
  - List rows for mixed-class transactions show **exactly one** amount when the spend/income economic amount is identifiable — concretely: `primary_amounts` contains exactly one entry → show it. Zero or multiple `primary_amounts` entries → show no amount. In both cases the row always shows a compact **more-parts indicator**.
  - The more-parts indicator is indicator-class (per the affordance rules): a micro chip/badge in the `MixedSentinel` visual family, with an accessible name and a tooltip enumerating every part amount (all shape amounts with their currencies, formatted by the standard amount rules). It must fit inside the standard row height beside the amount chip.
  - Mixed spend+transfer specifically: the spend amount (the economically meaningful one) shows, with the indicator.
  - Surfaces using the row rule: transactions browser rows, overview recent activity, command-palette transaction results, and the entry-modal rail rows — every compact list embedding. The transaction detail panel (and the delete-confirmation description) keep complete part amounts — that is where "the rest" lives.
  - Exchange rendering (sold-side amount) and all simple-class rendering are byte-identical to today.
- Acceptance (from the brief): constant row height across all classes; at most one amount with the accessible indicator on mixed rows (indicator only when no identifiable spend/income part); no `/`-joined or `x2`-style composites anywhere in list rows; exchange/simple unchanged; full amounts reachable in detail. Verify against the demo dataset's mixed transactions.
- `docs/webui-design.md` currently states "mixed: compact shape amounts with no synthetic total" (Progressive disclosure) and "mixed shows shape amounts and no synthetic total" (Amounts and currency). The implemented rule diverges by design — update both statements minimally to the new rule (one identifiable economic amount or none, plus a more-parts indicator; complete amounts in detail; never a synthetic total). The operator reviews the doc diff.
- Ground truth: `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md` (in-table markers, indicator treatment), `docs/accounting-semantics.md` (display-amount table), `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Row amount selection and the more-parts indicator

- [x] Reproduce the current breakage on the demo dataset (record which transaction and what renders), then implement the row rule: split the row-amount selection from the detail-amount selection in `format.ts`, render the single amount + indicator on all four row surfaces, keep detail/delete complete.
- [x] Manually verify with `just dev --demo`: the demo's mixed spend+transfer row shows the spend amount + indicator on one line, constant row height against neighbors; a mixed row with no single economic amount (construct via REST if the demo lacks one) shows indicator only; exchange and simple rows unchanged; detail panel shows all parts; tooltip lists every part amount.
- [x] Update the two `docs/webui-design.md` statements and `frontend/src/features/ledger/PACKAGE.md` if its amount wording changes.
- [x] Commit the task as `fix(frontend): render one honest amount plus more-parts indicator for mixed rows`.

### Task 2: End-to-end coverage

- [x] e2e coverage with REST-created fixtures: (a) mixed spend+transfer row — exactly one amount chip, indicator present with accessible name, tooltip lists all parts, row height equals a simple row's height; (b) mixed with no identifiable economic amount — no amount chip, indicator present; (c) exchange row unchanged (sold-side amount only); (d) detail panel lists complete part amounts. Follow `docs/TESTING.md`.
- [x] Commit the task as `test(frontend-e2e): pin mixed-row amount display rule`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-28-mixed-amount-display.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
