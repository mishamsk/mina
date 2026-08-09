# github.com/mishamsk/mina/internal/services/accounts

## Purpose

- Owns account domain validation, use cases, and repository contracts.

## Implicit Contracts

- Each service instance keeps a process-local reference snapshot for FQN hierarchy checks and dependent-reference validation. Direct persistence changes must invalidate it before later service use.
- Account mutations and dependent writes share `ReferenceSerializer`, so a dependent write cannot race an account tombstone or reference-state mutation.
- Only `owned`, `party`, and `flow` accounts are user-writable. The `system` namespace and fixed system accounts remain readable and referenceable but reject creation and every mutation.
- An account-type change requires the injected transaction validator to reclassify every affected active transaction; without that validator, type changes are rejected.
- Account-currency transitions follow [account-currency semantics](../../../docs/accounting-semantics.md#account-currency): active credit-limit history blocks any real change, and a new single currency must match all active journal and recurring-definition records.
- Hidden active accounts are valid references only when the caller explicitly allows them.
- Deletion is refused while active journal, template, recurring, or credit-limit references exist; list deleteability is derived from that same usage.
- FQNs are the hierarchy identity: prefix conflicts are rejected, and restructuring rewrites an active subtree while preserving custom display labels. References always expose the FQN.
- Balance reads return only active `owned` and `party` accounts. Current balances include active posted and pending records; posted balances exclude pending records, and expected and cancelled transactions are excluded.
- Balance account filters must reference active accounts; hidden references are permitted regardless of `IncludeHidden`.

## Boundaries

- Owns: account hierarchy, reference validity, lifecycle rules, and account-specific transition validation.
- Does not own: transaction classification, credit-limit history, or persistence and transport details.
