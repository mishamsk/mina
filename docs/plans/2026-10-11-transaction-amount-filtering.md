# Plan: Make transaction amount filters match semantic amounts

## Goal

Correct transaction amount filtering so a 19–20 range finds income or spending of 19.50, excludes 18 and 100, and does not match arbitrary journal legs. Make the distinction between an atomic range and independent comparisons explicit in both the DSL and the filter editor.

## Constraints

- Work in `fix-transaction-amount-filter`. This plan authorizes its described implementation only when execution is requested; writing the plan does not start implementation.
- Fix the existing `amount` and `amount_usd` fields; do not add compatibility fields or preserve their signed journal-record semantics.
- Reuse the shape amounts defined by `docs/accounting-semantics.md`; do not change accounting classification, stored records, display amounts, or schema.
- Aggregate contributions first, then take the absolute value. Never sum currencies, invent a transaction-wide total, or use compact-row presentation to decide which amounts are searchable.
- Keep domain validation and projected matching in `internal/services/transactions`, persisted filtering in `internal/store`, transport thin, and frontend accounting behavior presentational.
- Do not add frontend tests for backend filtering semantics. Use REST app-tests for the regression and semantic cases; run existing browser tests and manually check the changed editor.
- Use the `write-package-docs` skill for every package changed during implementation. Keep owning docs evergreen and short; leave `VISION.md`, `SCOPE.md`, and architecture documents unchanged.

## Agreed Behavior

- Each transaction supplies the amounts of every server-derived shape, separately by shape and native currency, including transfer amounts alongside economic shapes. Spend 54 plus lending 18 is searchable by either 54 or 18; neither the funding record's 72 nor a synthetic total is an amount candidate.
- A spend with ten expense records of 10 supplies a spend amount of 100, not ten candidates of 10. Mixed spend 100 and refund 20 supplies separate amounts of 100 and 20, with no net 80 or sum 120. Exchange exposes sold and bought amounts separately. Transfers and adjustments retain their existing shape aggregation, including meaningful zero amounts.
- `amount` compares the nonnegative magnitude of a native shape amount. `amount_usd` compares the nonnegative magnitude of that same shape/currency amount's existing stored USD equivalent. Missing contributors or an out-of-range USD aggregate make that candidate unavailable; do not use partial sums, zero substitution, or query-time conversion. Native amounts remain searchable when USD is unavailable.
- Amount operands are nonnegative DECIMAL(18,8) values. Negative or out-of-range operands are invalid requests rather than silently converted. Preserve decimal precision through aggregation and comparison.
- Each ordinary comparison is its own existence predicate. `amount>19 and amount<20` can match different candidates: amounts 10 and 100 satisfy that expression. Parenthesizing the two comparisons does not make them an atomic range.
- Add an inclusive atomic interval literal to the existing fields: `amount=19..20` and `amount_usd=19..20`. Both bounds must match one candidate. Exact equality such as `amount=20` keeps its ordinary meaning. Reject missing, malformed, negative, or reversed bounds; equal interval endpoints validly match that exact value.
- AND and OR combine complete predicates; NOT negates the complete match. `not amount=19..20` means no available candidate is inside the interval, including transactions with no available USD candidate when the field is `amount_usd`. Do not fuse separate comparisons, alter their Boolean meaning, or introduce general same-record conjunction.
- Native amount conditions are unqualified across currencies by default. A Currency restriction accompanying a native amount condition in the same AND branch must restrict the satisfying amount's native currency; a USD amount condition still values the selected native-currency candidate in USD. Document precise binding for any-of/all-of/none-of currency chips, grouping, OR, and NOT before implementing it; preserve transaction currency-membership checks and prevent one OR branch's currency restriction leaking into another.
- Account, category, tag, member, role, shape, and class filters select transactions without recomputing or restricting their amount contributions. A category filter matching a 10 contribution to a spend of 100 still tests the spend amount of 100. The standing Class dropdown continues to combine with the expression by AND; lifecycle inclusion rules stay unchanged.
- The Amount and Amount USD editors offer Between, At least, At most, Greater than, Less than, and Exactly. Between has two inputs and applies only when both bounds are valid; the other conditions have one input. Keep invalid or incomplete drafts visible without publishing an incomplete predicate.
- Render an atomic interval as one chip, such as `Amount between 19 and 20`; render comparisons as separate operator-bearing chips, such as `Amount > 19` and `Amount < 20`. Allow repeated amount-condition chips in one row with independent edit/remove identity.
- Explain Between with “Both bounds apply to the same transaction amount.” When separate lower and upper conditions for the same amount field coexist in one AND row, show “These conditions may match different amounts. Use Between to constrain one amount.”
- URL restoration and serialization preserve the distinction: existing paired comparisons remain independent comparison chips, never silently become Between. Unrepresentable expressions retain their exact source in Advanced. Preserve overlay parameters, OR rows, browser history, initiated-date ranges, and cache identity for every new condition.

## Success Criteria

- [ ] REST app-tests reproduce the Income plus 19–20 failure and prove corrected shape aggregation, absolute magnitudes, independent comparisons, atomic intervals, negation, currency binding, and invalid-value handling.
- [ ] Split spend 100 matches 100 and not 10; spend 54 plus lending 18 matches both amounts; candidates 10 and 100 satisfy separate bounds but fail a 19–20 interval.
- [ ] Persisted transactions and recurring projections agree; filtering happens before pagination, total counts, and date-anchor positioning. Missing USD values never satisfy positive USD comparisons or intervals.
- [ ] Manual browser checks show distinct Between and comparison controls/chips, the explanatory text, repeated conditions, nonnegative validation, and faithful URL/Back restoration while Income remains selected.
- [ ] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass before application-code commits. Domain coverage belongs in app-tests; existing browser coverage verifies integration without a new semantic test matrix.
- [ ] Run `just prose-fmt` before finishing. Regenerate affected contracts with `just openapi` and `just frontend-openapi`; do not edit generated files by hand.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-10-11-transaction-amount-filtering.md"` once, resolve findings, and rerun affected validation. Do not invoke the review loop more than once; report remaining findings.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean. Do not merge or push without a separate request.

## Tasks

### Task 1: Specify the filter contract before implementation

- [ ] Update `docs/transaction-filter-dsl.md` with semantic amount candidates, nonnegative comparisons, atomic interval syntax, currency binding, Boolean behavior, limits, and validation errors; replace signed-record statements and examples.
- [ ] Update `docs/webui-design.md` with the condition selector, labels, repeated amount chips, explanatory text, and draft/URL behavior. Preserve unrelated filter and initiated-date rules.
- [ ] Use the counterexamples above to check that the documented rules distinguish aggregate amounts, interval matching, independent predicates, and currency-qualified matching without relying on incidental parser grouping.
- [ ] Commit as `docs(filters): define semantic amounts and atomic ranges`. Pure documentation work requires no tests or broad validation.

### Task 2: Deliver the backend fix and its explicit UI controls

- [ ] Extend the existing DSL parser and resolved types, projected matcher, and store SQL to implement the documented amount and interval predicates. Preserve parameter binding, bounded queries, and service/store boundaries; do not filter a hydrated unbounded list or only the selected page.
- [ ] Cover the semantics through generated REST clients in `internal/apptest/runtime`, following `docs/TESTING.md` and `docs/BACKEND-TESTING.md`. Include simple income, split spending, economic-plus-transfer amounts, mixed amounts, exchange/transfer, native currencies, USD availability, relative projection evaluation, Boolean composition, and count/position behavior with representative fixtures rather than duplicate setup for every operator.
- [ ] Update `api/openapi.yaml` and generated contracts. Update affected service/store package contracts in the same implementation commit.
- [ ] Update `frontend/src/models/transaction-filters.ts` and `frontend/src/features/ledger/transaction-filter-controls.tsx` to represent atomic intervals and independent comparisons without merging them. Preserve every condition's chip identity and serialization, including exact and strict comparisons, duplicate fields, URL restoration, and Advanced fallback.
- [ ] Update affected frontend package contracts; manually verify the editor and run the plan-wide application checks before committing.
- [ ] Commit as `fix(filters): match semantic amounts and distinguish ranges`.
