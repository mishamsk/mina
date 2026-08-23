# Transaction Filter DSL

This document owns the filter expression language for `GET /api/transactions`: grammar, fields, matching semantics, limits, and error behavior. The `filter` query parameter carries one expression string; it is the only composable filtering input on that endpoint. `transaction_class`, `search`, `anchor_date`, `sort`, `sort_dir`, `limit`, and `offset` remain separate parameters outside the expression.

## Grammar

- A filter is a logical expression of terms joined by `and` and `or`, negated by `not`, and grouped with parentheses. `not` binds more tightly than `and`, and `and` binds more tightly than `or`; adjacent expressions must include `and` or `or`.
- Keywords `and`, `or`, and `not` are case-insensitive.
- Whitespace outside quoted values is insignificant, including around fields, operators, values, keywords, and parentheses. Whitespace inside a quoted value is data, and values containing whitespace must be quoted: `member : "Avery Blake"` is valid while `member : Avery Blake` is not.
- Membership terms have the shape `field:value`. Unquoted values cannot contain a colon; values containing a colon must be double quoted so the membership separator is unambiguous.
- Comparison terms use `field OP value`, where `OP` is one of `=`, `>`, `>=`, `<`, or `<=`.
- Values containing whitespace, parentheses, quotes, or colons beyond the membership separator must be double quoted with `"…"`; inside quotes, `\"`, `\\`, and `\*` represent a quote, backslash, and literal asterisk respectively. The asterisk escape distinguishes an exact entity FQN equal to `*` or ending in `:*` from an all-entity or hierarchy scope.
- An empty expression is invalid; `filter` must contain at least one term.
- Valid examples include `amount > -5`, `member : "Avery Blake"`, and `(tag:A or tag:B) and not lifecycle:cancelled`.

## Fields

- Membership fields: `account`, `category`, `tag`, `member`, `currency`, `role`, `class`, `lifecycle`, `settlement`, `shape`.
- Comparison fields: `amount`, `amount_usd`, `initiated`, `pending`, `posted`.
- Field names are lowercase and case-sensitive.

### Value vocabularies

- `account`, `category`, and `tag` take exact FQN or prefix-scoped values (for example `account:"checking:Chase"` and `category:"Food:*"`) as defined in Hierarchy scoping; `member` takes an exact household-member name.
- `currency` takes ISO 4217 codes or quoted crypto codes prefixed with `C::`, for example `currency:"C::BTC"`. Fiat values normalize to uppercase and must be exactly three letters; the `C::` prefix keeps the remainder of the value verbatim.
- `role` takes a `RecordRole` enum value: `expense`, `refund`, `income`, `clawback`, `exchange`, `adjustment`, `balance`.
- `class` takes a `TransactionClass` enum value: `spend`, `income`, `refund`, `clawback`, `transfer`, `currency_exchange`, `adjustment`, `mixed`.
- `lifecycle` takes a `LifecycleStatus` enum value: `active`, `expected`, `cancelled`.
- `settlement` takes a `SettlementSummary` enum value: `pending`, `posted`, `mixed`, `not_applicable`.
- `shape` takes a `TransactionShapeType` enum value: `spend`, `refund`, `income`, `clawback`, `adjustment`, `exchange`, `transfer`.
- `amount` and `amount_usd` take signed decimals within DECIMAL(18,8) precision.
- Date and timestamp values accept an absolute civil date (`YYYY-MM-DD`), an RFC3339 timestamp, or a signed relative offset such as `-30d` or `+1w`. Units are `s`, `m`, `h`, `d`, `w`, `mo`, `y`; `mo` means calendar months so `m` can mean minutes. Relative offsets resolve against the transactions service clock at request time, never wall time by another path. Calendar-month and calendar-year offsets preserve the clock's time and use calendar normalization rather than clamping: overflow from a nonexistent target date rolls forward (`2024-01-31 +1mo` becomes `2024-03-02`, and `2024-02-29 +1y` becomes `2025-03-01`).

### Field cardinality

- `account`, `category`, `tag`, `member`, `currency`, `role`, and `shape` are multi-valued per transaction.
- `class`, `lifecycle`, and `settlement` are single-valued per transaction; contradictory conjoined terms still parse and simply match nothing.
- Browser presentation and editing behavior for these cardinalities is owned by the [web UI design](webui-design.md#tables-and-filtering).

## Matching semantics

- Every leaf term is a transaction-level predicate. For record-derived fields — account, category, tag, member, currency, role, amount, amount_usd, pending, posted — the term means "at least one active journal record satisfies this". Transaction-derived fields test the attribute directly: `lifecycle` reads the lifecycle column, `settlement`, `shape`, and `class` use their server-derived summaries, and `initiated` compares the transaction's initiated civil date. Boolean operators compose these transaction-level predicates.
- Same-record conjunction is out of scope: `account:A and account:B` matches a transaction holding records on both accounts, because each term is an independent record-level existence test.
- `not term` matches transactions where no active record satisfies `term` (or the direct attribute test fails). Negation respects hierarchy scoping identically to the positive form.
- Single-valued transaction attributes conjoined with contradictory terms simply match nothing; validation does not special-case them.

## Hierarchy scoping

- For `account`, `category`, and `tag`, a quoted value ending in an unescaped `:*` scopes the term to that node and all its active descendants (for example `category:"Food:*"`); the quoted value without the suffix matches that exact FQN only. A bare `*` scopes to all entities of the kind. A literal asterisk is otherwise ordinary FQN content; an exact FQN equal to `*` or ending in `:*` escapes the relevant asterisk (for example `tag:"\*"` and `category:"Compat:\*"`).
- Scope values need not name an existing entity, because intermediate hierarchy segments are implicit groups rather than stored entities; an empty result is valid. Exact values must resolve to an existing active entity.
- Member values never scope; they match one name exactly.

## Default exclusion

- Without `filter`, expected transactions are excluded by default. Supplying any filter expression disables that implicit exclusion; the expression is then solely responsible for including or excluding lifecycle states.

## Composition with `transaction_class`

- The `transaction_class` query parameter and the parsed expression are independent predicates combined with AND. A request may supply either, both, or neither. A `class:` term inside the expression narrows further under the same AND.

## Limits

- Structural expression syntax outside quoted `account`, `category`, `tag`, and `member` values is limited to 4096 characters; quoted reference payloads are excluded so every otherwise-valid existing FQN or member name remains filterable. Expressions containing more than 100 terms, nested deeper than 10 levels, or using a relative-offset magnitude above 100000 units are rejected as invalid requests. These caps are deliberate guardrails against pathological input, not semantic boundaries.

## Errors

- Parse failures return the standard invalid-request envelope with a message naming the offending token and its byte offset. Missing boolean operators, malformed term forms, and violated limits report the applicable requirement.
- Exact entity values that do not resolve to an existing active entity return HTTP 400 with public code `invalid_request` and message `transaction filters reference missing or inactive resource`. Hierarchy scopes may name implicit or nonexistent groups and validly match nothing; hidden entities resolve normally.
- Invalid value shapes — unknown fields, bad enum values, malformed dates, and out-of-range decimals — are invalid requests.

## Reference zone

- Relative offsets resolve against the transactions service clock instant in UTC. RFC3339 timestamps require an explicit `Z` or numeric offset and normalize to UTC.
- Bare civil dates used with `pending` or `posted` resolve to midnight UTC, so an upper bound such as `posted<=2024-06-04` excludes timestamps later that day. `initiated` compares civil dates directly; when given a timestamp or relative offset, it compares the civil date containing the resolved instant in UTC.
