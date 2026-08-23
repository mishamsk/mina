# Plan: Tighten and modularize composable transaction filtering

## Goal

This fix plan corrects problems found after the first composable transaction filtering implementation. It makes the filter language require explicit boolean operators, accept insignificant whitespace outside quoted values, support strict comparisons, restore self-contained lease and reference lookup contracts, and divide the transactions filter implementation by responsibility.

## Constraints

- `docs/plans/completed/2026-08-21-composable-transaction-filtering.md` is immutable and must not change.
- Do not run review-loop.
- Boolean precedence remains `not` > `and` > `or`. `and` and `or` are required between expressions; juxtaposition is invalid.
- `not` is the only negation operator. A leading `-` is invalid, while negative decimals and signed relative offsets remain valid comparison values.
- Whitespace outside quoted values is insignificant, including around fields, operators, values, keywords, and parentheses. Whitespace inside quoted values is data, and a value containing whitespace must be quoted.
- Comparison fields accept `=`, `>`, `>=`, `<`, and `<=`.
- Strict comparisons are not editable as inclusive browser range chips. A URL containing one renders its exact source in the read-only Advanced state.
- This branch increased the frontend E2E suite from about 337 to 396 top-level Playwright tests. Reduce the suite to at most 350 tests by deleting backend-semantic filter cases; do not hide those cases inside fewer, longer browser tests. REST matching, parser errors, field validation, and reference validation belong in app-tests. Browser tests cover one focused browser-owned contract such as control interaction, focus, responsive layout, URL/history behavior, or request wiring.
- Add no new exhaustive test matrix. Modify existing table cases wherever they can prove the changed behavior.

## Success Criteria

- [ ] `docs/transaction-filter-dsl.md` and the `filter` description in `api/openapi.yaml` describe the same explicit grammar, whitespace rules, negation rule, and five comparison operators; the OpenAPI description contains no repository documentation path.
- [ ] REST accepts expressions such as `amount > -5`, `member : "Avery Blake"`, and `(tag:A or tag:B) and not lifecycle:cancelled`; it rejects `member:A currency:USD` and `-member:Avery` at the offending byte offset.
- [ ] Persisted DuckDB filtering and in-memory recurring projection filtering implement all five comparison operators, including strict initiated-date contradiction inference.
- [ ] Exact account/category/tag FQN lookup and member-name lookup apply `ReferenceOptions.AllowHidden` in the same way as ID lookup; transaction filtering is the only current FQN/name caller that passes `AllowHidden: true`.
- [ ] `recurring.Service.WithProjectedTransactions` acquires the reference and occurrence leases itself through `lease.Combine`, including when called under the transactions service's already-held shared reference lease.
- [ ] Transaction filtering has one implementation split across the seven named files below.
- [ ] No more than 350 top-level Playwright tests remain. The reduction comes from deleting backend-semantic filter coverage, not merging its assertions into longer browser tests, and strict-comparison Advanced behavior is covered by adapting an existing browser test rather than adding one.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Split the transactions filter implementation

Move the existing code from `internal/services/transactions/filter.go` into these files before changing behavior:

- `filter.go`: filter limits and `Service.resolveTransactionFilter` orchestration.
- `filter_types.go`: `FilterField`, `FilterCompareOp`, resolved expression nodes, and `FilterReferenceFQN`.
- `filter_lexer.go`: token kinds, token offsets, quoted-value scanning, keyword recognition, and syntax-length counting.
- `filter_parser.go`: precedence parsing, term splitting and decoding, value validation, currency normalization, and absolute/relative time parsing.
- `filter_resolver.go`: `Service.resolveFilterReferences` and invalid-reference translation.
- `filter_matcher.go`: `FilterMatchesTransaction` and evaluation of entity, member, currency, enum, decimal, date, and timestamp terms against projected transactions.
- `filter_inference.go`: impossible/tautological expression detection and class, lifecycle, settlement, and future-projection eligibility inference.

Delete each moved declaration from `filter.go`; do not leave forwarding wrappers or duplicate paths.

- [ ] Commit as `refactor(filters): split transaction filter implementation`.

### Task 2: Implement the revised grammar end to end

In `docs/transaction-filter-dsl.md`, replace the “OR of ANDs” and implicit-AND wording with logical unary expressions joined by explicit operators. Add valid examples with whitespace around term components and strict comparisons, add invalid juxtaposition and dash-negation examples, list all five comparison forms, and update parser-error descriptions accordingly. In `api/openapi.yaml`, remove `docs/transaction-filter-dsl.md` from the `filter` description and make that description self-contained with the same operators and quoting rule.

In `filter_lexer.go` and `filter_parser.go`, preserve source byte offsets while ignoring whitespace around term components. Require `and` or `or` after a complete unary expression. Tokenize `-5` and `-30d` as comparison values after a comparison operator, but reject `-` where a unary operator would begin. Update missing-form and wrong-operator errors to name `:`, `=`, `>`, `>=`, `<`, and `<=` accurately.

Add strict operator constants in `filter_types.go`. Handle all five operators explicitly in `filter_matcher.go` and `internal/store/transactions.go` without a default comparison fallback. In `filter_inference.go`, track whether initiated-date bounds are inclusive so equal strict/inclusive bounds such as `initiated>2026-02-01 and initiated<=2026-02-01` are recognized as impossible.

In `frontend/src/models/transaction-filters.ts`, remove implicit conjunction and dash negation from the parser, accept whitespace around term components, and recognize `>` and `<`. Route expressions containing strict comparisons to the read-only Advanced state without rewriting their source into inclusive row operators. Update `frontend/src/models/PACKAGE.md` to describe this parser boundary.

Regenerate the OpenAPI server (`internal/httpapi/openapi/openapi.gen.go`), Go client (`internal/httpclient/openapi.gen.go`), frontend client (`frontend/src/api/generated/`), CLI catalog (`internal/clientcli/surface.gen.go`), and MCP catalog (`internal/mcpserver/surface.gen.go`).

Modify existing app-test cases instead of adding parallel coverage:

- Replace the successful “implicit and by juxtaposition” expression with an error-table case for `member:Blake currency:USD`, including the second term's byte offset.
- Replace the successful dash-prefix expression with an error-table case for `-member:Avery` at byte 0.
- Put whitespace around the field separator and comparison operator in existing successful expression cases, while retaining a quoted value containing whitespace.
- Change one persisted amount case to `>` and one persisted timestamp case to `<`; retain the existing negative-decimal and signed-relative-offset cases.
- Change the existing projected amount row in `TestFutureTransactionPositionProjectsExpectedOccurrencesWithoutMaterializingBoundary` to a strict comparison so it exercises the in-memory matcher while the recurring provider re-enters the reference lease.
- Change the existing incompatible initiated-bound case in `TestFutureTransactionPositionRejectsUnboundedProjectionBoundary` to use an equal strict/inclusive boundary.

- [ ] Commit as `fix(filters): make transaction filter grammar explicit`.

### Task 3: Restore reference and projection ownership contracts

Change the service APIs and the matching interfaces in `internal/services/transactions/transactions.go` to these policies:

- `accounts.Service.ActiveReferenceByFQN`, `categories.Service.ActiveReferenceByFQN`, and `tags.Service.ActiveReferenceByFQN` take their package `ReferenceOptions` after the FQN and reject hidden active references unless `AllowHidden` is true.
- `members.Service.ActiveReferenceByName` takes `members.ReferenceOptions` after the name and applies the same hidden check.
- `Service.resolveFilterReferences` passes `AllowHidden: true` for exact filter terms.
- The `system:exchange` lookup in `internal/services/transactions/shorthand.go` passes `accounts.ReferenceOptions{}`.

Revert the transaction-filter exception wording in `internal/services/accounts/PACKAGE.md`, `internal/services/categories/PACKAGE.md`, `internal/services/tags/PACKAGE.md`, and `internal/services/members/PACKAGE.md` to the uniform hidden-reference contract.

Restore `recurring.Service.WithProjectedTransactions` to `lease.Combine(ctx, []lease.Func{s.refs.WithSharedLease, s.occurrences.WithExclusiveLease}, ...)`. Remove the caller-lease comment from that method and from `transactions.FutureProjectionProvider`. Update `internal/services/recurring/PACKAGE.md` and `internal/services/transactions/PACKAGE.md` so neither assigns lease acquisition to the caller. If this re-entry fails, fix `internal/x/lease` rather than removing either acquisition from `WithProjectedTransactions`.

Use the existing all-four-entity hidden-reference cases in `TestTransactionFilterDSLActiveReferenceBoundary` and the existing future-projection scenario as evidence; do not add duplicate cases unless one of those paths no longer reaches the changed API.

- [ ] Commit as `fix(services): restore reference and projection contracts`.

### Task 4: Reduce Playwright coverage to browser-owned contracts

In `frontend/tests/e2e/transactions/filter-composition.spec.ts`:

- Delete `server-invalid expressions remain read-only Advanced filters`; its syntax and validation cases belong in `TestTransactionFilterDSLErrorMessagesBoundary`.
- Delete `blank entity terms remain exact read-only Advanced filters`; blank reference validation belongs in app-tests.
- Adapt `non-renderable deep links remain exact in the advanced filter state` to use a valid strict comparison with surrounding whitespace. Keep its assertions that the exact source reaches REST, stays in the URL across reload, renders unchanged in Advanced, and clears through the browser control.

Do not add replacement Playwright tests. Retain representative browser-only coverage for row/chip editing, URL history, request wiring, focus restoration, and responsive containment.

Across the frontend E2E suite, remove at least 46 of the current 396 top-level tests so no more than 350 remain. Start with tests added by this branch in `frontend/tests/e2e/transactions/filter-composition.spec.ts`, `frontend/tests/e2e/transactions/filter-composition-entities.spec.ts`, `frontend/tests/e2e/transactions/filter-composition-focus.spec.ts`, `frontend/tests/e2e/transactions/filtering.spec.ts`, and `frontend/tests/e2e/reference-drilldowns.spec.ts`. Delete cases whose result is determined by backend expression parsing, validation, reference resolution, or returned-row matching. Keep only representative cases that exercise a distinct browser-owned interaction, focus, layout, URL/history, or request-wiring contract.

Do not concatenate deleted assertions or filter variants into retained tests. If a retained test currently checks several equivalent filter expressions or entity kinds, reduce it to one representative UI path and leave the expression and entity matrix to app-tests.

- [ ] Commit as `test(frontend): reduce filter browser duplication`.
