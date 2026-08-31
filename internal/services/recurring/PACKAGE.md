# github.com/mishamsk/mina/internal/services/recurring

## Purpose

- Owns recurring definition validation, occurrence materialization and lifecycle, and generated transaction construction.

## Implicit Contracts

- Definition create, replace, pause, resume, defer, and cancellation hold the app-wide exclusive reference lease; reference-dependent materialization, occurrence-enriched definition reads, and `ConfirmNext` use its shared lease.
- One app-scoped occurrence writer covers slot creation and occurrence lifecycle changes. Composite operations use the ordered lease combinator to acquire the required reference lease before the occurrence writer, and the store still rejects existing or repeated permanent definition/date slots inside the committing transaction.
- There is no scheduler: occurrence listing, `ConfirmNext`, and `Defer` catch up due slots through their caller-supplied current civil date before choosing or listing slots. Catch-up is idempotent by definition/date slot and creates only expected transactions.
- Exact occurrence reads return permanent provenance and whether its definition remains available on the recurring management screen without triggering catch-up materialization.
- Future-positioned transaction reads acquire the shared reference lease and occurrence writer together while generating at most 10,000 unmaterialized projections from active definitions; compatible caller-held reference ownership is re-entrant. Projection marks the definition's next unmaterialized slot before filtering, is cancellable and read-only, leaves unknowable future USD valuations empty, applies the transactions service's resolved boolean filter plus the separate standing class and search predicates after generation, and creates no durable state; the occurrence writer keeps its snapshot coherent with the persisted transaction read.
- Occurrence slots are permanent audit state. Only an expected occurrence can be confirmed or dismissed; confirmation atomically activates and actual-dates its transaction, revalues generated records for that date, and applies settlement only to owned/party records, while dismissal tombstones the transaction without freeing the slot.
- The next due date is the first schedule slot on or after the anchor without an occurrence row; changing an anchor makes it the new schedule floor without modifying existing occurrence state and is accepted only from the current civil date onward.
- Confirmation samples the service clock once for current-date validation and lifecycle timestamps; dismissal also passes a service-clock timestamp into its atomic repository operation, and SQL does not select those timestamps.
- Deferring atomically records the next non-materialized slot and shifts the anchor; interval offsets use cadence units, while date-rule offsets count natural rule periods and reject targets outside the four-digit civil-date range before persistence. Pause suppresses materialization; resume skips the paused interval instead of creating a backlog.
- Definition records are a copied, complete per-currency-balanced shape, including when seeded from a transaction template. Existing occurrences retain that snapshot when a definition changes or is cancelled.
- Account-reference validation rechecks saved definition currencies during every materialization, so an account mode change cannot authorize incompatible generated records. Display enrichment intentionally resolves active account metadata without that currency revalidation.
- Generated transactions derive signed USD amounts for the scheduled date during catch-up, retain those valuations when materialized confirmation defaults to that date, revalue for an explicitly supplied actual date, and derive for today during early confirmation. A changed actual date also supplies the default posted timestamp so later valuation backfill follows the ordinary posted-date rule; explicit settlement timestamps remain authoritative. Successful materialization and confirmation signal runtime currency-usage cache invalidation.
- Definition lists apply shared FQN fuzzy membership before requested sorting and pagination, retaining descendants when an implicit group matches. Next-due-date lists bulk-load occurrence dates once; missing next dates stay last, and equal dates use ascending FQN and definition ID tie-breakers.
- Ranked definition search derives navigation-only groups from active leaves and returns caller-bounded shared-policy order without loading or materializing occurrences.

## Boundaries

- Owns: recurring definition and occurrence use cases, schedule calculation and validation, template-copy completion, and generated transaction construction.
- Does not own: SQL persistence, transport mapping, dictionary lifecycle, exchange-rate storage, or transaction classification and settlement normalization.
