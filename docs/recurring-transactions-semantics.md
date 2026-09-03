# Recurring Transaction Semantics

This document defines the business semantics of recurring definitions, schedules, expected transactions, and future projections. It does not define SQL migrations, REST DTO shapes, or UI screens. See the [generated SQL DDL artifact](../internal/services/accountingschema/schema.sql) for current storage shapes.

## Recurring Definition

- A recurring definition is a standalone entity identified by a hierarchical colon-separated FQN (e.g. `Subscriptions:Netflix`), following `docs/hierarchy-semantics.md` conventions.
- A definition owns a **complete, balanced transaction shape**: a full record set with accounts, currencies, amounts, and categories wherever `docs/accounting-semantics.md` requires them. Unlike transaction templates, partial shapes are not allowed, so generation always yields a valid transaction.
- A definition may be seeded by copying a transaction template's shape at creation time. There is no live link to the template afterwards; templates remain schedule-free.

## Schedule

- Supported schedule classes are:
  - **Interval**: every N days, weeks, months, or years.
  - **Date rule**: day-of-month (clamped to month end) and last-day-of-month.
- The semantics must extend to richer calendar rules (e.g. weekday-of-month) later without redesign.
- A definition's **anchor** is its next scheduled occurrence to consume. Later occurrences step from scheduled dates, never from actual transaction dates.
- A date-rule anchor is a concrete date produced by that rule; the rule, not the anchor's day number, carries calendar intent such as last-day-of-month.
- **Catch-up** is an explicit recurring-service operation that materializes every scheduled occurrence through the server's current civil date and advances the anchor to the first future occurrence atomically.
- The observable `recurring-catch-up` background operation invokes catch-up daily at 00:01 in the server's local time. Its schedule and enabled state are system policy, not user configuration; manual invocations use the same operation boundary. A 00:01 that falls in a daylight-saving gap skips that day's run; the next run materializes the missed occurrences.
- Transaction reads never invoke catch-up or otherwise mutate recurring state.
- Future occurrences are ephemeral projections. They create no durable state and are recomputed from the current definition and anchor.
- Creation accepts a historical anchor for backfill. A later re-anchor may move backward, including onto a date already represented by another transaction, but never before the server's current civil date. Re-anchoring does not change existing transactions, and future projections are recomputed from the new anchor.
- Defer consumes the current anchor and advances it. Interval defer uses cadence units; date-rule defer uses natural schedule periods.
- Consuming an occurrence does not implicitly change the cadence. A user who wants the same next occurrence again explicitly moves the anchor back after confirming or deferring.

## Expected Transactions and Future Projections

- Catch-up creates an `EXPECTED` transaction from the definition for each due or missed occurrence. Each remains independently reviewable until confirmed or dismissed.
- Materialization already advances the definition's anchor past the occurrence. Later confirmation or dismissal of that expected transaction does not advance it again.
- Expected transactions have no settlement dates and are excluded from balances, aggregates, reports, and default transaction listings as defined by `docs/accounting-semantics.md`.
- Future projections are read-only views of virtual occurrences. Confirming the current projection early creates state; merely reading or filtering projections does not.
- Manual confirmation always produces an ordinary `ACTIVE` transaction whose journal records are `RECONCILED`; `UNRECONCILED` is reserved for journal records created by automatic import workflows.
- Confirming a materialized expected transaction activates that transaction without moving the anchor; its initiated date defaults to the scheduled date and may be changed through the current civil date. Confirming the current virtual occurrence creates a transaction on the current civil date and advances the anchor to the following scheduled occurrence. Settlement intent follows `docs/accounting-semantics.md` in both cases.
- Dismissing an expected transaction tombstones that transaction. The same transaction does not reappear; explicitly moving the definition anchor backward may later create another expected transaction for the same scheduled date.
- Confirmed transactions retain ordinary transaction lifecycle semantics. Cancelling or restoring one does not recreate an expected transaction or move the recurring definition's anchor.

## Definition Lifecycle

- Definitions support **pause/resume**. There are no end-date or run-count end conditions.
- While paused, no occurrences accrue and no backlog forms. Resume anchors an interval definition exactly on the server's current civil date; a date-rule definition resumes on the first rule-matching date on or after it.
- **Cancel tombstones the definition.** Transactions already created from it remain untouched, including expected transactions still awaiting review.
- Definition edits affect only future projections and later materialization. Transactions already created from the definition retain the shape they were created with.

## Integrity and Provenance

- Entities referenced by an active definition (accounts, categories, members, tags) cannot be tombstoned; this follows the existing tombstone-protection pattern.
- Transactions created from a recurring definition carry `source = RECURRING_TEMPLATE` and reference that definition directly. No separate scheduled-occurrence identity is part of the business semantics.
