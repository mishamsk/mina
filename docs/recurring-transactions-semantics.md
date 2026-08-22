# Recurring Transaction Semantics

This document defines the business semantics of recurring transactions: the recurring definition, its schedule, the occurrence lifecycle, and the definition lifecycle. It does not define SQL migrations, REST DTO shapes, or UI screens. See the [generated SQL DDL artifact](../internal/services/accountingschema/schema.sql) for current storage shapes; the storage representation of occurrences is deliberately unspecified here and is derived from these semantics.

## Recurring Definition

- A recurring definition is a standalone entity identified by a hierarchical colon-separated FQN (e.g. `Subscriptions:Netflix`), following `docs/hierarchy-semantics.md` conventions.
- A definition owns a **complete, balanced transaction shape**: a full record set with accounts, currencies, amounts, and categories wherever `docs/accounting-semantics.md` requires them. Unlike transaction templates, partial shapes are not allowed, so generation always yields a valid transaction.
- A definition may be seeded by copying a transaction template's shape at creation time. There is no live link to the template afterwards; templates remain schedule-free.

## Schedule

- Phase 2 supports two schedule classes:
  - **Interval**: every N days/weeks/months/years, anchored to a start date.
  - **Date rule**: day-of-month (clamped to month end) and last-day-of-month.
- The semantics must extend to richer calendar rules (e.g. weekday-of-month) later without redesign.
- **Fixed anchor**: the next due date is the first schedule slot on or after the anchor without a permanent occurrence row; occurrence dates before the anchor do not advance it. Later due dates step from scheduled dates, never from actual confirmation dates.
- Changing an existing definition's anchor re-anchors every unmaterialized slot from that date and requires an anchor on or after the server's current civil date. An unchanged historical anchor remains valid, and creation may use a historical anchor for backfill.
- Both schedule classes can be deferred and re-anchored. Interval defer uses a cadence-unit offset; date-rule defer jumps a positive number of natural schedule periods.
- Future occurrences must be **computable** without materialization (needed for budget forecasting and future-positioned ledger reads). One future-positioned transaction-list request may visit at most 10,000 schedule slots.

## Occurrence Lifecycle

- Occurrences **auto-materialize when due** as `EXPECTED` transactions. Their owned and party records have no settlement dates, and flow and system records are always date-free. Expected transactions are excluded from balances, aggregates, reports, and default API transaction listings. Whether a view shows them is a presentation choice owned by the web UI design doc; showing them never changes their aggregate exclusion.
- Materialization is a catch-up computation through the server's current civil date triggered by occurrence-queue reads and lifecycle actions; bounded exact occurrence reads return one stored occurrence without catch-up for provenance and direct inspection across client surfaces, and there is no background scheduler. Any workflow that consumes the occurrence queue — including future automated ingestion and imported-transaction matching — must run catch-up materialization first, so matching always sees fully backfilled due occurrences.
- A future-positioned transaction-list read computes scheduled rows ephemerally through the selected date. These rows use the current active definition, identify the definition's next non-materialized slot, remain read-only until due, and never create occurrence or transaction state; the explicit EXPECTED lifecycle filter controls whether they appear.
- The next or due occurrence can be **confirmed early** from the UI. An early manual confirm sets the transaction initiated date to the current date, as that is almost certainly the intent.
- Occurrences that came due while unattended (app not running, user inaction) each become **individually reviewable**. Nothing is silently created and nothing is silently skipped.
- **Dismissals are durable**: a dismissed occurrence is materialized with a dismissed status and never reappears. This holds for manual dismissal and for automatic dismissal (e.g. LLM helpers, external-source sync).
- Actions on a due occurrence:
  - **Confirm as-is**: apply an explicit pending or posted settlement intent to owned and party records, change the transaction lifecycle to `ACTIVE`, and mark the occurrence confirmed atomically. The actual transaction date defaults to the scheduled date, may be changed through the current civil date, and drives historical USD valuation without moving the fixed schedule. When the actual date changes and no posted timestamp is supplied, the posted timestamp follows that date; exact supplied settlement timestamps remain authoritative. Flow and system records remain date-free.
  - **Dismiss**: tombstone the expected transaction and mark the occurrence dismissed atomically; the schedule anchor is unchanged.
  - **Cancel**: stop the whole definition (see definition lifecycle).
- **Defer** acts on the schedule, not on a materialized occurrence: it permanently records the next **non-materialized** slot as deferred and re-anchors everything after it. Interval offsets default to one cadence interval; date-rule offsets default to one natural schedule period. Already-materialized occurrences — a due occurrence under review or a future occurrence confirmed early — never participate in defer and remain individually reviewable.
- There is no confirm-with-edits beyond recording the actual date: if another value differed, confirm first and then edit the resulting transaction like any other. The same contract applies to future automatic confirmation on a match to an externally imported transaction: the match confirms the occurrence, and actual values live on the transaction.

Expected transaction lifecycle, confirmed active lifecycle, and dismissed tombstoning are distinct from cancelling an active transaction. A confirmed occurrence may later be cancelled only under the pending-only transaction rules in `docs/accounting-semantics.md`; restoring it changes only lifecycle and does not reopen the occurrence.

## Definition Lifecycle

- Definitions support **pause/resume**. There are no end-date or occurrence-count end conditions.
- While paused, no occurrences accrue and no backlog forms. On resume, interval schedules re-anchor at the resume date; date-rule schedules resume on the next natural rule date.
- **Cancel tombstones the definition** (standard soft-delete pattern). Generated transaction history remains untouched.
- Pause and cancel leave already-materialized unreviewed occurrences in the review queue; the user still confirms or dismisses them individually.
- **Edits affect future projections and materialization only.** Anchor edits replace the schedule floor without changing any permanent occurrence row; already-materialized occurrences, reviewed or not, keep the shape they were generated with.

## Integrity and Provenance

- Entities referenced by an active definition (accounts, categories, members, tags) cannot be tombstoned; this follows the existing tombstone-protection pattern.
- Generated transactions carry `source = RECURRING_TEMPLATE` and remain traceable back to their definition and occurrence.

## Out of Scope (Must Not Be Precluded)

- The exact storage model for definitions and occurrences.
- Matching imported transactions to expected occurrences and reconciliation workflows.
- Budget integration that projects future occurrences into forecasts.
