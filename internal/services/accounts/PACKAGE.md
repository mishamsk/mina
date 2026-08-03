# github.com/mishamsk/mina/internal/services/accounts

## Purpose

- Owns account domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Service instances own process-local, write-through account reference caches for active-reference validation.
- User-writable accounts are `owned`, `party`, or `flow`; `system` accounts are installed fixed references.
- The reserved `system` namespace and all fixed system accounts reject create, update, delete, restructure, and path-hidden mutation while remaining readable and referenceable.
- Account type changes are allowed only when the injected transaction validator confirms every affected active transaction remains semantically valid; unconfigured validation rejects type changes.
- `NULL` currency means multi-currency; non-`NULL` constrains active journal and recurring-definition record references as specified by the owning [account-currency semantics](../../../docs/accounting-semantics.md#account-currency).
- Every actual currency change is rejected while active credit-limit history exists; otherwise setting or changing a single currency requires the account repository to confirm every active journal and recurring-definition record already matches.
- Credit-limit creation, recurring occurrence materialization, and account updates share the account-reference serialization boundary.
- Hidden active accounts are valid references only when callers explicitly allow hidden references.
- Account group hidden state is derived from active account leaves, including hidden leaves.
- Account path hide/unhide targets active leaves at or under the path and invalidates the account reference cache.
- Featured account state is presentation metadata and does not affect accounting semantics or reference validation.
- Optional custom display labels are validated by the service; account reads expose an effective label using the custom value or the final one or two FQN segments, while references retain authoritative FQNs.
- FQNs remain authoritative identity and hierarchy; restructuring changes only FQN-derived display labels and preserves custom labels.
- Balance reads return active `owned` and `party` accounts only; current includes posted and pending records, posted-only excludes pending, and cancelled and expected records are excluded.
- Explicit account filters on balance reads must reference active accounts.

## Boundaries

- Owns: account hierarchy and display-label validation and derivation, account-type and account-currency transition validation, currency validation, external identifier validation, hidden/featured/tombstoned use-case rules, active record-reference validation, and active-FQN conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Account behavior is covered through runtime-constructed boundary tests.
