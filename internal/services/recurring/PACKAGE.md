# github.com/mishamsk/mina/internal/services/recurring

## Purpose

- Owns recurring definition validation, occurrence materialization and lifecycle, and generated transaction construction.

## Implicit Contracts

- Definition create, replace, pause, resume, defer, and cancellation hold the app-wide exclusive reference lease; reference-dependent materialization and `ConfirmNext` use its shared lease.
- One app-scoped occurrence writer covers slot creation and occurrence lifecycle changes. Composite operations use the ordered lease combinator to acquire the required reference lease before the occurrence writer, and the store still rejects existing or repeated permanent definition/date slots inside the committing transaction.
- There is no scheduler: occurrence listing, `ConfirmNext`, and `Defer` catch up due slots through their caller-supplied current civil date before choosing or listing slots. Catch-up is idempotent by definition/date slot and creates only expected transactions.
- Future-positioned transaction reads hold the shared reference lease and occurrence writer while computing and consuming at most 10,000 unmaterialized schedule slots from active definitions and existing permanent occurrence dates. Projection is cancellable and read-only, leaves unknowable future USD valuations empty, supports transaction-list filters, and creates no durable state; the occurrence writer keeps its snapshot coherent with the caller's persisted transaction read.
- Occurrence slots are permanent audit state. Only an expected occurrence can be confirmed or dismissed; confirmation atomically activates its transaction and applies settlement only to owned/party records, while dismissal tombstones the transaction without freeing the slot.
- Confirmation and dismissal pass service-clock lifecycle timestamps into their atomic repository operation; SQL does not select those timestamps.
- Deferring an interval definition atomically records a deferred slot and shifts its anchor. Pause suppresses materialization; resume skips the paused interval instead of creating a backlog.
- Definition records are a copied, complete per-currency-balanced shape, including when seeded from a transaction template. Existing occurrences retain that snapshot when a definition changes or is cancelled.
- Account-reference validation rechecks saved definition currencies during every materialization, so an account mode change cannot authorize incompatible generated records. Display enrichment intentionally resolves active account metadata without that currency revalidation.
- Generated transactions derive signed USD amounts for the scheduled date during catch-up and for the initiated date during early confirmation. Successful materialization and confirmation signal runtime currency-usage cache invalidation.
- Next-due-date definition lists compute and sort the complete active set before applying pagination; missing next dates stay last, and equal dates use ascending FQN and definition ID tie-breakers.

## Boundaries

- Owns: recurring definition and occurrence use cases, schedule calculation and validation, template-copy completion, and generated transaction construction.
- Does not own: SQL persistence, transport mapping, dictionary lifecycle, exchange-rate storage, or transaction classification and settlement normalization.
