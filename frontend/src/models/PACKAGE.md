# frontend/src/models

## Purpose

- Owns frontend UI-state shapes plus canonical transaction-filter and sorting values that are not generated API DTOs.

## Implicit Contracts

- Transaction filters retain the original DSL text, including an explicitly empty invalid value, require explicit boolean operators, ignore whitespace outside quoted values, accept complete quoted values and nonempty comparison operands before editable canonicalization, decode DSL quote, backslash, and literal-asterisk escapes, stop structural parsing at the backend's nesting cap, parse the row-renderable inclusive subset into ORed rows of ANDed membership/range chips, and serialize frontend-built expressions canonically with explicit grouping for each OR row; dash negation, strict comparisons, and other unsupported expressions keep their exact source for read-only Advanced display, REST and URL state share that source, and structured cache signatures distinguish every field and an absent filter from an explicitly empty one.
- Membership chips model `any of`, `all of`, and `none of` directly; equivalent conjoined same-field negations merge into one `none of` chip, and a one-value `all of` uses redundant grouping as a UI round-trip hint without duplicating its backend predicate. Enum vocabularies are constrained by generated REST types, and the row adapter rejects structures it cannot represent without semantic loss, including empty entity values rejected by REST.
- Entity-overview links construct only their owning exact or descendant FQN scope; literal asterisks stay distinct from the `:*` scope marker.
- Entity-chip mutations require row-renderable filters; Advanced expressions remain unchanged until Clear. Exact entity activation narrows a same-field hierarchy scope instead of joining the scope's alternatives.
- Required drill-down and preview scopes remain independently ANDed with activated entity filters without duplicating exact predicates already required in a row; member drill-downs replace URL-backed member chips with their fixed member, no-op scope removal preserves the exact source and chip order, and removing a member-only OR alternative preserves its match-all meaning rather than narrowing the expression.
- Category and Tag scopes encode exact FQNs or explicit `:*` prefixes in the expression; numeric entity IDs never enter transaction-filter state.
- Status view selection, filters, pagination, and detail identity are URL query state rather than frontend-owned persisted models.
- Editable journal-record drafts retain server record identities; only newly introduced draft records lack an identity.

## Boundaries

- Owns UI data shapes and transaction-filter canonicalization only.
- Does not own generated API DTOs, transaction URL parsing or writing (ledger), or browser persistence and compatibility handling (services and stores).
