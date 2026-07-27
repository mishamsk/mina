# Plan: Derive accounting meaning from account type, sign, and category intent

Mina's accounting semantics were reworked on this branch, and only the
documentation has moved so far. Categories used to carry economic intent and
were required on every journal record, so the physical bank posting had to be
categorized alongside the counterparty records that actually carry meaning, one
bank record could not balance several categorized ones, and a single `transfer`
intent could not distinguish an internal move from a loan. Meaning now comes
from three signals instead — account type, record sign, and a two-value category
intent — with `balance` accounts split into `owned` and `party`, categories
attached only to `flow` records, and classification derived in two layers: a
record-local role per record, and independent transaction shapes that reduce to
one class. The result is a significant refactor reaching storage, services,
public contracts, generated clients, and the browser.

The plan is complete when the backend and the frontend are fully in line with
the accounting documentation as updated on this branch.

## Plan Context

- `docs/accounting-semantics.md`, `docs/checkbook-accounting.md`,
  `docs/data-model.md`, and `docs/webui-design.md` describe the **target** state
  on this branch, not the current one. Everything below exists to close the gap
  between them and the code.
- `docs/accounting-semantics.md` is the concrete contract for account types,
  category intent, the category rule, record roles, transaction shapes, classes,
  and amounts. Its worked examples are the acceptance criteria.
- Removed with no replacement, so the gap is visible without a `git diff`: the
  `fee`, `refund`, `transfer`, `exchange`, `adjustment`, and `fx_gain_loss`
  category intents; the `fx_gain_loss` transaction class; the `balance` account
  type, split into `owned` and `party`; per-intent shape validation, replaced by
  exchange exclusivity as the only validated shape; and the `balancing` and
  `transfer` record roles, merged into one `balance` role.
- Added: the `system:exchange` fixed account, the `clawback` role/shape/class,
  the per-transaction shape list, the derived per-record role, the derived
  exchange effective rate, a dry-run classify endpoint, and an Exchange
  shorthand.
- Mina's migrations are evergreen: modify the existing files in
  `internal/store/migrations/`, never add one, and recompute
  `PinnedMigrationContentHash`.
- Regenerate REST, CLI, MCP, and frontend surfaces with `just openapi` and
  `just frontend-openapi` in the phase that changes `api/openapi.yaml`.

### How this plan runs

Two stages, each a sequence of phases. **Every phase is exactly one commit**, so
the branch history reads as: contracts, red tests, green backend, red frontend
tests, green frontend, then review-loop fixes.

- **Stage 1 is backend only.** The frontend is expected to be broken throughout
  it. Do not run, fix, or reason about frontend builds, frontend unit tests, or
  `just test-frontend-e2e` during Stage 1.
- Within each stage: change the model and contracts first, then restate the
  tests to the target shape, then implement until they pass.
- **Red phases are expected to be red.** Phases 2 and 4 land with failing tests
  and that is the correct outcome; do not weaken a test to make it pass, and do
  not fold implementation into them.
- A green phase may span more than one commit when that genuinely helps, as long
  as its last commit is green. Every other phase is one commit.
- No phase below carries per-step verification checkboxes. Choose the checks
  worth running as you go; `just pre-commit` applies to every commit because it
  does not run tests. The Success Criteria and the review loop are what
  guarantee the plan landed.

## Stage 1: Backend

### Phase 1: Model, schema, and contracts

Establish every new and changed type end to end, with no behavior rewritten yet.
Compilation is the bar; classification may still be the old implementation.

- [ ] Update `internal/store/migrations/`: `account_type` becomes
  `OWNED | PARTY | FLOW | SYSTEM`, `category_economic_intent` becomes
  `EXPENSE | INCOME`, `FX_GAIN_LOSS` disappears, `category_id` becomes nullable
  on journal, transaction template, and recurring definition records, and the
  four fixed system accounts — `system:suspense`, `system:correction`,
  `system:opening_balance`, `system:exchange` — are seeded. Recompute the pinned
  hash.
- [ ] Update the Go service types and DTOs to match: account types, the reduced
  intent enum, optional category, the `record_role` field, the transaction shape
  list with per-shape amounts, the `clawback` class, and the exchange effective
  rate.
- [ ] Update `api/openapi.yaml` for all of the above plus the dry-run classify
  endpoint and the Exchange shorthand endpoint, splitting the writable account
  type enum from the response and filter enum, and regenerate every owned
  surface.
- [ ] Commit as `Reshape accounting model and contracts`.

### Phase 2: Restate backend expectations

Rewrite what the backend is asked to do, without making it do it. This phase
ends red.

- [ ] Rewrite `internal/apptest/runtime` transaction and classification coverage
  against `docs/accounting-semantics.md`: every worked example with its shape
  list, class, and amounts; the category rule in both directions; every exchange
  exclusivity rejection; `transfer` alongside an economic shape never yielding
  `mixed`; and currency count classifying nothing.
- [ ] Rewrite demo seeding and app-test fixtures to the target shapes —
  `owned`/`party` account types, no categories outside `flow` records, exchanges
  through `system:exchange`, the mortgage as one funding record against one
  servicing-bank flow account with four categories, the wire transfer's charge as
  an ordinary expense, and business expenses on a `party` balance.
- [ ] Add demo coverage for what the old model could not express: a
  multi-merchant spend, a refund netting inside its expense category, and a
  `party` balance that swings both ways.
- [ ] Cover the system-account catalog: the exact installed four, read access,
  the reserved namespace, non-deletability, and every protected mutation path.
- [ ] Cover the classify endpoint, including unbalanced drafts, category-rule
  violations, and exchange exclusivity violations.
- [ ] Commit as `Restate backend tests for derived accounting semantics`.

### Phase 3: Implement the derived model

Make Phase 2 pass.

- [ ] Rewrite classification as the two layers the semantics doc defines: a
  record-local role per record, an independent presence test per shape, and a
  class derived by counting economic shapes. Delete the per-intent shape
  validation this replaces.
- [ ] Implement the shape amounts exactly as documented, including the
  adjustment amount reading its own records and the transfer amount switching on
  the presence of `party` records.
- [ ] Enforce the category rule and exchange exclusivity as the only shape-level
  validation, with rejections that name the offending records.
- [ ] Protect the fixed system accounts in `internal/services/accounts` against
  creation, update, delete, restructure, and path-hidden mutation, preserving
  list, get, filtering, cache loading, and reference validation.
- [ ] Implement the classify endpoint and the Exchange shorthand, and make
  transaction class, transaction shape, and record role filterable.
- [ ] Repoint SQL list filtering and month totals at the derived semantics rather
  than the category-intent join.
- [ ] Update `internal/services/transactions`, `internal/services/categories`,
  `internal/services/accounts`, `internal/services/demo`, and `internal/store`
  package docs.
- [ ] Land the phase green on `just test`, `just test-integration`, and
  `just pre-commit`, and commit as `Implement derived accounting semantics`.

## Stage 2: Frontend

### Phase 4: Restate frontend expectations

Rewrite the browser's expectations against `docs/webui-design.md`. This phase
ends red.

- [ ] Rewrite frontend unit and e2e coverage for: multi-merchant spend entry,
  refund entry, Exchange entry with its effective-rate feedback, the Advanced
  grid offering categories only on `flow` rows, the classify preview in the
  editor footer, `clawback` wherever `refund` appears, class and role filters,
  and read-only fixed system accounts.
- [ ] Commit as `Restate frontend tests for derived accounting semantics`.

### Phase 5: Align the browser

Make Phase 4 pass.

- [ ] Update the entry modal per `docs/webui-design.md`: Spend takes multiple
  categorized merchant rows against one funding record, Refund is entered as
  money coming back, Transfer stays single-currency with an optional charge row,
  and Exchange is its own tab taking two accounts and two amounts with the
  server-derived effective rate as read-only feedback.
- [ ] Make the Advanced grid offer the category cell only on `flow` rows and
  show the server's live classify read — roles, shapes, class, display amount —
  in the footer, mapping category-rule and exchange-exclusivity errors onto the
  offending rows.
- [ ] Update transaction rows, detail panel, registers, badges, filters, and
  bulk category edit for optional categories, the two-value intent, `clawback`,
  and lifting category over categorized records only.
- [ ] Show the derived effective rate wherever both sides of an exchange are
  visible — transaction detail, the register peek, and the entry form.
- [ ] Render the fixed system accounts as read-only on the Accounts and account
  detail surfaces without removing them from the pickers that reference them.
- [ ] Land the phase green on `just test-frontend-e2e`, `just test`, and
  `just pre-commit`, and commit as
  `Align browser with derived accounting semantics`.

### Phase 6: Implemented-state docs

- [ ] Update `PROJECT_STATE.md` for the delivered model, and confirm README,
  Vision, accounting stance, accounting semantics, data model, hierarchy
  semantics, recurring semantics, OpenAPI, and UI design agree without
  duplicating rules.
- [ ] Commit as `Record derived accounting semantics in project state`.

## Success Criteria

- [ ] Backend and frontend behavior match the accounting and UI documentation as
  updated on this branch, including every worked example in
  `docs/accounting-semantics.md`.
- [ ] `just test`, `just test-integration`, `just test-frontend-e2e`, and
  `just pre-commit` pass.
- [ ] Each phase landed as its own commit, in order.
- [ ] Planned commits are present and the worktree is clean.
- [ ] With a clean worktree, run
  `just review-loop --plan "docs/plans/2026-07-25-accounting-semantics.md"`
  exactly once; resolve its findings, rerun affected validation, and commit the
  fixes. The plan is immutable ground truth for reviewers and fixers. Never
  invoke review-loop a second time; findings that remain after the fix commits
  go into the completion report instead.
- [ ] Move this plan to `docs/plans/completed/` and commit the move.
