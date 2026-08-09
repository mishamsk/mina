# github.com/mishamsk/mina/internal/services/recurring

## Purpose

- Owns recurring definition validation, occurrence materialization and lifecycle, and generated transaction construction.

## Implicit Contracts

- Definition writes, cancellation, catch-up materialization, and `ConfirmNext` share the reference-operation serializer with dictionary mutations; an active reference cannot be tombstoned between validation and its dependent write.
- There is no scheduler: occurrence listing, `ConfirmNext`, and `Defer` catch up slots through their caller-supplied civil date before choosing a slot. Catch-up is idempotent by definition/date slot and creates only expected transactions.
- Occurrence slots are permanent audit state. Only an expected occurrence can be confirmed or dismissed; confirmation atomically activates its transaction and applies settlement only to owned/party records, while dismissal tombstones the transaction without freeing the slot.
- Confirmation and dismissal pass service-clock lifecycle timestamps into their atomic repository operation; SQL does not select those timestamps.
- Deferring an interval definition atomically records a deferred slot and shifts its anchor. Pause suppresses materialization; resume skips the paused interval instead of creating a backlog.
- Definition records are a copied, complete per-currency-balanced shape, including when seeded from a transaction template. Existing occurrences retain that snapshot when a definition changes or is cancelled.
- Account-reference validation rechecks saved definition currencies during every materialization, so an account mode change cannot authorize incompatible generated records. Display enrichment intentionally resolves active account metadata without that currency revalidation.
- Generated transactions derive signed USD amounts for the scheduled date during catch-up and for the initiated date during early confirmation. Successful materialization and confirmation signal runtime currency-usage cache invalidation.

## Boundaries

- Owns: recurring definition and occurrence use cases, schedule calculation and validation, template-copy completion, and generated transaction construction.
- Does not own: SQL persistence, transport mapping, dictionary lifecycle, exchange-rate storage, or transaction classification and settlement normalization.
