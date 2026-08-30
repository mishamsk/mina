# github.com/mishamsk/mina/internal/services/accounts

## Purpose

- Owns account domain validation, use cases, and repository contracts.

## Implicit Contracts

- Each service instance keeps a process-local reference snapshot for FQN hierarchy checks and dependent-reference validation. Direct persistence changes must invalidate it before later service use.
- Every account mutation holds the app-wide exclusive reference lease through persistence and cache publication; dependent writes use the corresponding shared lease.
- Only `owned`, `party`, and `flow` accounts are user-writable. The `system` namespace and fixed system accounts remain readable and referenceable but reject creation and every mutation.
- An account-type change requires the injected transaction validator to reclassify every affected active transaction; without that validator, type changes are rejected.
- Account-currency transitions follow [account-currency semantics](../../../docs/accounting-semantics.md#account-currency): active credit-limit history blocks any real change, and a new single currency must match all active journal and recurring-definition records.
- Hidden active accounts are valid references only when the caller explicitly allows them, for both ID and exact-FQN lookup.
- Deletion is refused while active journal, template, recurring, or credit-limit references exist; list deleteability is derived from that same usage.
- FQNs are the hierarchy identity: prefix conflicts are rejected, and restructuring rewrites an active subtree while preserving custom display labels. Display-label validation and the final-one-or-two-segment fallback are shared service rules applied at this service boundary. References expose the FQN and presentation/search metadata needed by dependent read projections.
- Balance reads return only active `owned` and `party` accounts. Current balances include active posted and pending records; posted balances exclude pending records, and expected and cancelled transactions are excluded.
- Balance account filters must reference active accounts; hidden references are permitted regardless of `IncludeHidden`.
- Account lists intersect repeated account-type, visibility, featured, and shared fuzzy membership filters before totals and pagination, while preserving the requested canonical sort. Matches on active implicit groups retain their eligible descendant leaves; tombstoned rows match only their own terms.
- Search reads use the reference snapshot and caller-owned bound to return backend-ranked leaves and navigation groups with `has_more`, retaining literal exact-FQN matches and excluding requested leaf IDs. Contexts own navigation, record, shorthand balance/flow, exchange-currency, transaction-filter, and bulk source/replacement eligibility; bulk contexts consume only common-source and affected-currency facts from the transaction service.
- Creation availability is an advisory read over the same FQN validity, active path-conflict, and reserved `system` namespace checks repeated authoritatively by Create.

## Boundaries

- Owns: account hierarchy, reference validity, lifecycle rules, ranked search eligibility, creation availability, and account-specific transition validation.
- Does not own: transaction classification, bulk transaction fact loading, fuzzy text primitives, credit-limit history, or persistence and transport details.
