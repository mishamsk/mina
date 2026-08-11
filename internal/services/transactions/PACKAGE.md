# github.com/mishamsk/mina/internal/services/transactions

## Purpose

- Owns transaction and journal-record use cases plus reusable transaction-semantic classification.

## Implicit Contracts

- Create, replace, cancel, and reference-sensitive bulk operations serialize validation with persistence; dictionary deletion cannot invalidate a reference between validation and the write.
- Writes resolve active account, category, tag, and member references before persistence, including account-currency compatibility, then enforce per-currency balance and the semantics in [`docs/accounting-semantics.md`](../../../docs/accounting-semantics.md).
- Create and replace derive only missing `amount_usd` at the initiated date and preserve supplied values. Backfill atomically changes only unresolved, non-tombstoned values, using the posted date when present and otherwise the initiated date; it must not rewrite historical valuations.
- Derived display USD amounts use the same signed record contributions as native amounts. A missing USD contribution or USD aggregation overflow makes that currency's USD display unavailable without suppressing its native amount.
- Account-type changes and bulk category or account reassignment revalidate every affected transaction's semantics, so a locally valid record edit cannot invalidate its siblings.
- Settlement dates are normalized only for owned and party records: omitted create defaults use the initiated-date timestamp, while later mutation defaults use one operation-clock instant; supplied timestamps are preserved. Expected recurring transactions are changed only through recurring-occurrence flows.
- Transaction lists and record searches reject missing or inactive dictionary filters rather than treating them as empty results. Account-scoped record search maps an invalid target account to not found, and only it may request running balances.
- Transaction lists accept exact Category and Tag FQN-prefix scopes for group deep links; prefixes include hidden active descendants and preserve leaf ID-filter behavior.
- Successful create and replace call the injected currency-usage callback, which composition uses to invalidate dependent exchange-rate-loading caches.

## Boundaries

- Owns: transaction validation, lifecycle and settlement normalization, reference-error translation, semantic classification and display derivation, record-search validation, and bulk record rules.
- Does not own: dictionary state or caches, exchange-rate lookup, persistence implementation, scheduling, or transport mapping.
