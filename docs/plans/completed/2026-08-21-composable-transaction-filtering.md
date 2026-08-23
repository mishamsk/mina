# Plan: Composable transaction filtering through a filter DSL — Kata 7y30

## Goal

Replace Mina's flat, field-level transaction filtering with one composable boolean filter expression that supports AND, OR, NOT, and nested grouping, delivered identically through REST, CLI, MCP, URL state, and the transaction browser. A hand-rolled Go parser in the transactions service owns the expression language; the browser's filter bar becomes a multi-row chip builder that generates it, so ordinary filtering stays as simple as today while expressive queries become possible.

- `filter=<expression>` is the only filtering input on `GET /api/transactions`.
- A domain semantics doc owns the grammar, matching semantics, and limits.
- The filter bar gains OR-ed rows and per-chip `any of` / `all of` / `none of` operators.

## Constraints

- Transaction-versus-record matching has one rule: every leaf term is a transaction-level predicate meaning "at least one active journal record satisfies this" for record-derived fields, or a direct attribute test for transaction-derived fields. Boolean operators compose those transaction-level predicates. Same-record conjunction is explicitly out of scope.
- The DSL replaces the flat filter params on `GET /api/transactions`: `account_id`, `category_id`, `category_fqn_prefix`, `tag_id`, `tag_fqn_prefix`, `member_id`, `currency`, `lifecycle_status`, `settlement`, `transaction_shape`, `record_role`, `amount_min`, `amount_max`, `amount_usd_min`, `amount_usd_max`, `initiated_date_from`, `initiated_date_to`, `pending_date_from`, `pending_date_to`, `posted_date_from`, `posted_date_to`.
- `transaction_class` stays a top-level query param, ANDed with the filter expression. It keeps its current repeated-value any-of semantics, its URL-backed multi-class state, and its standing toolbar popover. `class` also remains an ordinary DSL field, so a class condition can participate in OR groups and negation when needed; the param and any `class:` terms compose with AND.
- `search`, `anchor_date`, `sort`, `sort_dir`, `limit`, and `offset` stay separate query params and are unchanged. Free-text search does not become a DSL term.
- Scope is `GET /api/transactions` only. Journal-record search (`searchJournalRecords`, `searchAccountJournalRecords`) keeps its current filter params; account and group registers are unaffected.
- The DSL covers exactly the filter dimensions the transaction list supports today. Do not introduce new dimensions; in particular, do not add `reconciliation_status` to the transaction list even though `docs/webui-design.md` currently names it.
- Entity values are FQNs (accounts, categories, tags) or names (members). Numeric-ID value forms are out of scope.
- Parser and validation live in `internal/services/transactions`; the parsed expression travels on `transactions.ListOptions`; `internal/store` translates the expression to SQL. `internal/httpapi` passes the raw string through and makes no domain decisions.
- User-supplied values reach SQL only through parameter binding. No string interpolation of parsed values into query text.
- No new database indexes without representative read-benefit evidence, per `docs/architecture.md`.
- No unit tests. Parser behavior, including every parse-error case, is proven through `app-tests` against `GET /api/transactions` per `docs/TESTING.md`.
- Relative time values resolve through the transactions service's injected `Clock`, never wall time, so `app-tests` stay deterministic.

## Adopted DSL contract

Task 1 finalizes and documents this; later tasks implement it.

- Grammar: `or` of `and` of unary terms, with `(` `)` grouping and no depth limit beyond the enforced cap. Precedence `not` > `and` > `or`. Juxtaposition means implicit `and`. Keywords `and`, `or`, `not` are case-insensitive; `-` is a prefix synonym for `not`.
- Membership terms: `field:value`. Fields — `account`, `category`, `tag`, `member`, `currency`, `role`, `class`, `lifecycle`, `settlement`, `shape`. Unquoted values cannot contain a colon; values containing a colon must use `"…"` quoting with `\"` and `\\` escapes so the membership separator is unambiguous.
- Hierarchy scoping: `category:"Food:Groceries"` matches that leaf exactly; `category:"Food:*"` matches that node and all active descendants, replacing today's `*_fqn_prefix` params. Confirm `services.ValidateFQN` rejects `*` as a segment so the suffix is unambiguous.
- Comparison terms: `field=value`, `field>=value`, and `field<=value`. Fields — `amount`, `amount_usd`, `initiated`, `pending`, `posted`.
- Date and timestamp values accept an absolute form (civil date or RFC3339) or a signed relative offset resolved against the service clock: `-30d`, `+1w`. Units are `s`, `m`, `h`, `d`, `w`, `mo`, `y`; `mo` means months so `m` can mean minutes. The doc records the reference time zone.
- Expression composition is uniform across field arity. `account:A and account:B` matches one transaction holding records on both accounts, because each term is an independent record-level `EXISTS`. Terms on single-valued transaction attributes conjoined the same way simply match nothing; validation does not special-case them.
- `not tag:X` means no active record satisfies `tag:X`, and negation respects hierarchy scoping identically to the positive form.
- Without `filter`, expected transactions stay excluded. Supplying any filter expression disables that implicit exclusion, leaving lifecycle inclusion and exclusion entirely to the expression.
- The `transaction_class` param and the parsed expression are independent predicates combined with AND. A request may supply either, both, or neither.
- Enforced, documented caps on expression length, term count, and nesting depth reject pathological input with an invalid-request error. Suggested floors: 4096 characters, 100 terms, depth 10.
- Parse failures return the standard invalid-request envelope with a message naming the offending token and its byte offset. Unresolvable entity values return the existing invalid-filter-reference error.

## Success Criteria

- [x] `GET /api/transactions?filter=…` is the only composable filtering path; every flat filter param listed in Constraints is gone from `api/openapi.yaml`, `transactions.ListOptions`, `internal/httpapi/strict_transactions.go`, and the store predicate builder. `transaction_class` survives unchanged and ANDs with the expression.
- [x] `app-tests` cover, through REST: same-field AND across two accounts; negation of a tag; mixed inclusion and exclusion in one query; an OR group nested inside an AND; hierarchy-scoped `:*` matching including under negation; relative-time comparison terms against the fake clock; `transaction_class` ANDed with an expression that also carries a `class:` term; every enforced cap; and representative parse-error and unresolved-reference messages.
- [x] Every filter previously expressible through the flat params is expressible in the DSL, and existing transaction-list scenarios still pass unchanged in meaning.
- [x] `mina client transactions list --filter '…'` and the `transactions_list` MCP tool accept the expression through regenerated surfaces with no hand-written surface code.
- [x] The transaction browser builds OR-ed filter rows with `any of` / `all of` / `none of` chips, round-trips them through the URL, and renders a read-only advanced state for expressions outside the chip-renderable subset.
- [x] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [x] `just openapi-check`, `just frontend-openapi-check`, and `just surface-check` pass.
- [x] Package docs are updated with the `write-package-docs` skill for every package touched, and `just prose-fmt` has run.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-21-composable-transaction-filtering.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Close Kata 7y30 with the commits and validation evidence.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Adopt and document the filtering model

Write `docs/transaction-filter-dsl.md` as the owning domain semantics doc for the model in Adopted DSL contract. No code changes.

Resolve and record the details the contract leaves open: the per-field value vocabulary and arity, taken from `internal/services/transactions/classification.go` and the existing OpenAPI enums; currency normalization inside DSL values, preserving today's fiat-uppercase and `C::`-prefix rules; the relative-time reference zone; and the exact caps. State the `lifecycle:expected` default-exclusion rule, the negation-plus-hierarchy rule, and the `transaction_class`-ANDs-with-expression rule explicitly, since all three are the kind of invariant that is invisible from the API surface.

- [x] `docs/transaction-filter-dsl.md` exists and fully specifies grammar, fields, transaction-level matching semantics, hierarchy scoping, negation, relative time, caps, and error behavior.
- [x] The doc contains no history, migration notes, or references to the flat-param model.
- [x] `just prose-fmt` has run.
- [x] Commit as `docs: adopt composable transaction filter DSL`.

### Task 2: Implement the DSL end to end behind a new `filter` param

Add the hand-rolled lexer, parser, AST, and validation to `internal/services/transactions`, carry the parsed expression on `ListOptions`, translate it to SQL in `internal/store/transactions.go`, and add `filter` as a query param on `listTransactions` in `api/openapi.yaml`. Leave the flat params in place for now so nothing breaks mid-sequence.

Reference resolution needs active-by-FQN lookups for categories and tags and by-name for members, mirroring the existing `accounts.ActiveReferenceByFQN`. Resolution must keep today's behavior of allowing hidden entities in filters. Reuse the existing `EXISTS`-over-active-records predicate helpers in the store rather than introducing a second matching mechanism. Enum-backed values must use the owning service enum validation rather than a separate hand-maintained list.

Regenerate REST server, REST client, and client-surface code; the CLI flag and MCP tool property come from generation, not hand-written code.

- [x] `GET /api/transactions?filter=…` executes the full expression language, proven by the `app-tests` named in Success Criteria.
- [x] Parsed values reach SQL only as bound parameters.
- [x] `just pre-commit`, `just test`, `just test-integration`, `just openapi-check`, `just frontend-openapi-check`, and `just surface-check` pass.
- [x] Commit as `feat(api): add composable transaction filter DSL`.

### Task 3: Migrate the frontend to the DSL without changing visible behavior

Replace the flat `TransactionFilters` shape in `frontend/src/models/transaction-filters.ts` with an expression model plus a DSL serializer and parser, switch the single funnel `transactionFilterQuery` in `frontend/src/api/ledger.ts` to emit `filter=`, and move URL state in `frontend/src/features/ledger/transaction-page-position.ts` from the per-dimension params to one `filter` param. Update the embedding callers in `frontend/src/features/entity-overviews/entity-overview-page.tsx` and `frontend/src/features/reference/reference-drilldown-page.tsx`.

The filter bar still renders one row of per-dimension `any of` chips, so this task is a representation change only. The class popover keeps its own `class` URL param and `transaction_class` request param and stays outside the expression model. The TS side needs a tokenizer and serializer, not a second full validator — the server stays the authority on validity.

- [x] The Transactions page, category and tag drill-downs, member drill-downs, and chip-activation filtering behave exactly as before, now over `filter=` in both the URL and the REST request.
- [x] Existing `frontend/tests/e2e/transactions/filtering.spec.ts` scenarios pass with URL expectations updated to the new param.
- [x] `just frontend-check` and `just test-frontend-e2e` pass.
- [x] Commit as `refactor(frontend): drive transaction filters through the filter DSL`.

### Task 4: Remove the flat filter params

Delete the replaced params from `api/openapi.yaml`, the corresponding fields from `transactions.ListOptions`, their mapping in `internal/httpapi/strict_transactions.go`, their branches in the store predicate builder and `validateTransactionListOptions`, and any now-unused `internal/apptest` helpers. Regenerate all affected code.

- [x] No flat transaction-list filter param remains in the OpenAPI contract, service options, transport mapping, or store predicate.
- [x] `just pre-commit`, `just test`, `just test-integration`, `just openapi-check`, `just frontend-openapi-check`, and `just surface-check` pass.
- [x] Commit as `refactor(api): remove flat transaction filter params`.

### Task 5: Redesign the filter bar for OR rows and chip operators

Read `docs/webui-design.md` and `docs/webui-theme-arcade-cabinet.md` before changing UI. Rework `frontend/src/features/ledger/transaction-filter-controls.tsx` and its host bar so the filter bar holds one or more rows: chips within a row are ANDed, rows are ORed, and the whole bar serializes to `(row) or (row)`. A single row is the ordinary case and must look and feel no heavier than today's bar.

Each entity, currency, and enum chip gains an `any of` / `all of` / `none of` operator, chosen in the existing dimension editor popover and shown in the chip label. Offer `all of` only for fields that can hold several values in one transaction; single-valued transaction attributes offer `any of` and `none of` only. Range chips keep their current form and gain no operator. Allow more than one chip per dimension in a row when the operators differ.

Add `Transaction class` to the Add-filter menu as an ordinary chip dimension, so a class condition can sit inside an OR row or be negated. The standing popover remains the easy path for the common case; the two narrow the list together.

The transaction-class popover is unchanged: it stays a standing toolbar control owning its own URL-backed multi-class state, ANDed with the expression by the server. It never reads or writes the expression, so a `class:` term appearing inside a filter row narrows the result further and the popover keeps reporting only its own state.

Expressions that fall outside the chip-renderable subset, which can arrive by hand-edited URL, CLI-shared link, or a future text entry point, render as a read-only advanced state showing the expression with a Clear action. The bar must never silently rewrite an expression it cannot represent.

Update the filter-bar and filter-dimension bullets in `docs/webui-design.md` to the new reality: multi-row composition, chip operators, the advanced read-only state, class as both a standing popover and a chip dimension. Remove the stale `reconciliation status` dimension from that list.

- [x] Filter rows can be added, populated, and removed; chips carry and edit their operator; the bar round-trips through the URL and survives reload and Back.
- [x] The Filter toggle's close-and-clear behavior, auto-open-on-deep-link behavior, and chip-activation filtering all work across multiple rows.
- [x] A deep link carrying a non-renderable expression shows the read-only advanced state and still returns the correct rows.
- [x] New `frontend/tests/e2e` coverage exercises an OR row, an `all of` chip, and a `none of` chip; spec files stay under 25 tests each.
- [x] `docs/webui-design.md` describes the new filter bar with no leftover single-row or `reconciliation status` wording.
- [x] `just frontend-check` and `just test-frontend-e2e` pass.
- [x] Commit as `feat(frontend): compose transaction filters with OR rows and chip operators`.
