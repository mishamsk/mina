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
- Picker reads use the reference snapshot, return at most 20 backend-ranked unselected leaves and navigation groups while retaining a literal exact-FQN match, return requested active context-eligible selections separately without consuming the result bound, and report the complete context-eligible leaf count before query and hierarchy filtering. Active hidden selections and exact-FQN queries remain eligible without relaxing context rules. Contexts own record, shorthand balance/flow, exchange-currency, transaction-filter, and bulk source/replacement rules; bulk contexts consume only common-source and affected-currency facts from the transaction service.

## Boundaries

- Owns: account hierarchy, reference validity, lifecycle rules, account picker eligibility and result bounds, and account-specific transition validation.
- Does not own: transaction classification, bulk transaction fact loading, fuzzy text primitives, credit-limit history, or persistence and transport details.
