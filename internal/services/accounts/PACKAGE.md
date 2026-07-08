# github.com/mishamsk/mina/internal/services/accounts

## Purpose

- Owns account domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Service instances own process-local, write-through account reference caches for active-reference validation.
- Hidden active accounts are valid references only when callers explicitly allow hidden references.
- Account group hidden state is derived from active account leaves, including hidden leaves.
- Account group deleteability is derived from every active subtree leaf, including hidden leaves.
- Account path hide/unhide targets active leaves at or under the path and invalidates the account reference cache.
- Account path delete tombstones active leaves at or under the path, rejects all leaves when any active dependent exists, and invalidates the account reference cache.
- Featured account state is presentation metadata and does not affect accounting semantics or reference validation.
- Balance reads return active balance accounts only; current includes posted and pending records, posted-only excludes pending, and cancelled records are excluded.
- Explicit account filters on balance reads must reference active accounts.

## Boundaries

- Owns: account hierarchy validation and derivation, account-type validation, currency validation, external identifier validation, hidden/featured/tombstoned use-case rules, active-reference validation, and active-FQN conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Account behavior is covered through runtime-constructed boundary tests.
