# github.com/mishamsk/mina/internal/services/transactions

## Purpose

- Owns transaction and journal-record use cases plus reusable transaction-semantic classification.

## Implicit Contracts

- Create, replace, and reference-sensitive bulk operations hold a shared reference lease across validation and persistence; concurrent material bulk changes to one transaction surface as retryable conflicts. Cancellation, restoration, deletion, settlement, reconciliation, and backfill are fact-only mutations and do not take that lease.
- Complete replacement validates one desired transaction aggregate while reconciling journal records by explicit identity: retained IDs must be unique active members of that transaction, and omitted IDs are removals rather than positional matches.
- Existing-record replacement input cannot change creation provenance. Store replacement reports imported or linked omission blockers atomically; the service translates them into the rule that those identities cannot be removed ordinarily, while whole-transaction deletion removes active links without detaching importer metadata.
- Writes resolve active account, category, tag, and member references before persistence, including account-currency compatibility, then enforce per-currency balance and the semantics in [`docs/accounting-semantics.md`](../../../docs/accounting-semantics.md).
- Create derives missing `amount_usd` at the initiated date and preserves supplied values. Without an explicit valuation, replacement carries forward the stored valuation, including null, for an unchanged retained amount/currency pair; new or changed pairs derive a missing valuation at the initiated date. Backfill atomically changes only unresolved, non-tombstoned values, using the posted date when present and otherwise the initiated date; it must not rewrite historical valuations.
- Derived display USD amounts use the same signed record contributions as native amounts. A missing USD contribution or USD aggregation overflow makes that currency's USD display unavailable without suppressing its native amount.
- Exchange display titles identify the involved balance accounts when each side resolves to one account; a side spanning multiple accounts falls back to the currency-marker pair. Markers use conventional narrow symbols and fall back to stored codes when no symbol is available or the pair's symbols collide.
- Account-type changes and bulk category or account reassignment revalidate every affected transaction's semantics, so a locally valid record edit cannot invalidate its siblings.
- Settlement dates are normalized only for owned and party records: omitted create defaults use the initiated-date timestamp, while later mutation defaults use one operation-clock instant; supplied timestamps are preserved. The store atomically rejects bulk or deletion mutations of expected recurring transactions and lifecycle changes that became invalid after service validation.
- Transaction lists validate record-currency filters through the shared currency-code contract; transaction lists and record searches reject missing or inactive dictionary filters rather than treating them as empty results. Transaction and record lists support updated-date ordering with their own identities as stable tiebreakers. Every material transaction metadata, lifecycle, valuation, or nested-record mutation advances the transaction update timestamp once; exact no-ops preserve all timestamps. Account-scoped search maps an invalid target account to not found, and only it may request running balances.
- Complete replacement owns the strong ETag representation of the canonical transaction update timestamp, rejects malformed validators, compares the caller token to its loaded aggregate before validation, and passes that snapshot timestamp to the store's atomic write comparison. Missing-precondition and stale-precondition transport statuses belong to `internal/httpapi`.
- Transaction lists accept exact Category and Tag FQN-prefix scopes for group deep links; prefixes include hidden active descendants and preserve leaf ID-filter behavior.
- Successful create and materially changing replacements call the injected currency-usage callback, which composition uses to invalidate dependent exchange-rate-loading caches; exact no-op replacement skips it.

## Boundaries

- Owns: transaction validation, lifecycle and settlement normalization, reference-error translation, semantic classification and display derivation, record-search validation, and bulk record rules.
- Does not own: dictionary state or caches, exchange-rate lookup, persistence implementation, scheduling, or transport mapping.
