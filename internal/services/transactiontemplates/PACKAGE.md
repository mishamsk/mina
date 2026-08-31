# github.com/mishamsk/mina/internal/services/transactiontemplates

## Purpose

- Owns reusable, partial transaction-record defaults for manual entry and recurring-definition seeding.

## Implicit Contracts

- Templates may contain partial, unbalanced records; consumers must complete and validate the resulting transaction.
- Active template FQNs follow the shared [hierarchy rules](../../../docs/hierarchy-semantics.md): `Replace` preserves the FQN, while `Restructure` atomically moves or renames its active subtree.
- Every mutation holds the app-wide exclusive reference lease across hierarchy/reference validation and persistence; references must be active, although hidden accounts, categories, and tags are valid.
- `CompatibleShorthands` is derived, not persisted. Complete amounts use transaction classification; partial shapes may still match structural spend, refund, income, or charged-transfer entry. A valid template without a match returns an empty list.
- Shorthand compatibility requires identical tags and no conflicting supplied member or memo values, because each shorthand has one shared value for those fields.
- Lists apply shared fuzzy membership before canonical sorting and pagination, retaining descendants when an implicit group matches; ranked search derives navigation-only groups from eligible active leaves and lets transaction-entry callers restrict candidates by compatible shorthand.

## Boundaries

- Owns template validation and lifecycle, FQN operations, active-reference error mapping, shorthand compatibility, and ranked search eligibility.
- Does not own record completion or balancing, recurring schedules, persistence, or transport mapping.
