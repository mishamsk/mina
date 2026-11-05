# Plan: Replace contextual amount currency binding with explicit suffixes

Retrospective record reconstructed after the work; it supersedes the currency-binding behavior in [the amount filtering plan](2026-10-11-transaction-amount-filtering.md).

## Goal

Keep semantic shape amounts, atomic intervals, and independent comparisons from the amount filtering plan, but replace contextual currency binding with an explicit currency on the amount operand.

## Decision

- The owner judged the contextual binding design far too complex for its value: Currency chips qualified amount predicates by AND branch, with flattening, OR/NOT set algebra, and leak-prevention rules across branches. It was implemented and then replaced.
- The replacement puts the currency on the amount itself: `amount=50USD`, `amount=19..20EUR`, `amount="0.1C::BTC"`. Standalone `currency:` terms only test transaction membership and never qualify amounts.

## Constraints

- `amount_usd` rejects a suffix; per-bound suffixes are invalid; one suffix follows a range's upper bound.
- Parser resolves the suffix into the existing decimal term, so SQL and projection matching share one representation; delete the binding machinery instead of keeping it alongside.
- Amount SQL derives shape candidates without unnecessary machinery; USD availability is the final per-shape/currency aggregate fitting DECIMAL(18,8) with no missing contributors.

## Success Criteria

- [x] `docs/transaction-filter-dsl.md`, `docs/webui-design.md`, `api/openapi.yaml`, and package docs describe suffix qualification and independent membership.
- [x] The Amount editor has an optional Currency input that writes the suffix; chips, drafts, and URLs preserve it independently of Currency chips.
- [x] REST app-tests cover fiat and crypto suffixes, case normalization, and invalid suffix forms.
- [x] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.

## Tasks

### Task 1: Explicit amount currencies

- [x] Replace contextual binding in docs, parser, matcher, store SQL, and the filter editor with operand suffixes; delete the binding resolver.
- [x] Commit as `refactor(filters): make amount currency qualification explicit`.

### Task 2: Simplify amount SQL

- [x] Drop the running-sum CTE that mirrored order-dependent intermediate USD overflow; use the final aggregate per the DSL contract.
- [x] Commit as `refactor(store): simplify amount filter USD aggregation`.
