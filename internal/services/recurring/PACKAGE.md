# github.com/mishamsk/mina/internal/services/recurring

## Purpose

- Owns recurring definition validation, schedule-slot consumption, and generated transaction construction and review.

## Implicit Contracts

- Definition create, replace, pause, resume, defer, and cancellation hold the app-wide reference lease and recurring-state lease exclusively; reference-dependent catch-up, projection, and `ConfirmNext` use the ordered lease combinator and compatible caller-held reference ownership is re-entrant.
- `CatchUp` is the sole implicit-backlog materialization use case: it creates one expected transaction per due occurrence through its supplied civil date and advances each definition anchor atomically, so retries at the new anchor are idempotent. Runtime invokes it through the observable recurring catch-up operation; reads, `ConfirmNext`, and `Defer` never invoke it as a side effect.
- The definition anchor is the authoritative next slot. Catch-up, `ConfirmNext`, and `Defer` consume it by advancing to its schedule successor even when another generated transaction already uses that date; successors outside the four-digit civil-date range fail before persistence. Changing an anchor does not modify existing transactions and is accepted only from the current civil date onward. Replacement requires the definition's timestamp ETag; a null anchor preserves the current value read under the recurring-state lease, while a supplied date intentionally re-anchors.
- Future-positioned transaction reads generate at most 10,000 projections from active definitions under shared reference and recurring-state leases. Projection marks the anchor row as next before filtering, is cancellable and read-only, leaves unknowable future USD valuations empty, applies the transactions service's resolved boolean filter plus standing class and search predicates after generation, and creates no durable state.
- Only a materialized expected transaction can be confirmed or dismissed. Confirmation atomically activates and actual-dates it, revalues generated records for that date, reconciles its records, and applies settlement only to owned/party records; dismissal tombstones it. Neither action moves the anchor.
- `ConfirmNext` consumes the anchor, creates an active transaction dated today with reconciled records, and advances the anchor atomically. Confirmation operations return the transaction snapshot assembled by the atomic store write, without a post-commit lookup. Confirmation samples the service clock once for validation and lifecycle timestamps; dismissal also passes a service-clock timestamp into its atomic repository operation.
- Deferring consumes the anchor without creating a transaction; interval offsets use cadence units, while date-rule offsets count natural rule periods and reject targets outside the four-digit civil-date range before persistence. Pause suppresses catch-up; resume establishes a current-or-future slot instead of creating a backlog.
- Definition records are a copied, complete per-currency-balanced shape, including when seeded from a transaction template. Existing transactions retain that snapshot when a definition changes or is cancelled.
- Account-reference validation rechecks saved definition currencies during every materialization, so an account mode change cannot authorize incompatible generated records. Display enrichment intentionally resolves active account metadata without that currency revalidation.
- Generated transactions derive signed USD amounts for the scheduled date during catch-up, retain those valuations when materialized confirmation defaults to that date, revalue for an explicitly supplied actual date, and derive for today during early confirmation. A changed actual date also supplies the default posted timestamp so later valuation backfill follows the ordinary posted-date rule; explicit settlement timestamps remain authoritative. Successful materialization and confirmation signal runtime currency-usage cache invalidation.
- Definition lists apply shared FQN fuzzy membership before requested sorting and pagination, retaining descendants when an implicit group matches. Next-due-date ordering reads the anchor directly; missing next dates stay last, and equal dates use ascending FQN and definition ID tie-breakers.
- Ranked definition search derives navigation-only groups from active leaves and returns caller-bounded shared-policy order without materializing transactions.

## Boundaries

- Owns: recurring definition use cases, schedule calculation and validation, template-copy completion, and generated transaction construction and review.
- Does not own: SQL persistence, transport mapping, dictionary lifecycle, exchange-rate storage, or transaction classification and settlement normalization.
