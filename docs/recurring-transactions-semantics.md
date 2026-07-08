# Recurring Transaction Semantics

This document defines the business semantics of recurring transactions: the
recurring definition, its schedule, the occurrence lifecycle, and the
definition lifecycle. It does not define SQL migrations, REST DTO shapes, or UI
screens. Table shapes are owned by `docs/data-model.md`; the storage
representation of occurrences is deliberately unspecified here and is derived
from these semantics.

## Recurring Definition

- A recurring definition is a standalone entity identified by a hierarchical
  colon-separated FQN (e.g. `Subscriptions:Netflix`), following
  `docs/hierarchy-semantics.md` conventions.
- A definition owns a **complete, balanced transaction shape**: a full record
  set with accounts, categories, currencies, and amounts. Unlike transaction
  templates, partial shapes are not allowed, so generation always yields a
  valid transaction.
- A definition may be seeded by copying a transaction template's shape at
  creation time. There is no live link to the template afterwards; templates
  remain schedule-free.

## Schedule

- Phase 2 supports two schedule classes:
  - **Interval**: every N days/weeks/months/years, anchored to a start date.
  - **Date rule**: day-of-month (clamped to month end) and last-day-of-month.
- The semantics must extend to richer calendar rules (e.g. weekday-of-month)
  later without redesign.
- **Fixed anchor**: due dates always advance from scheduled dates, never from
  actual confirmation dates. Confirming early or late does not move the
  schedule.
- The two classes differ in affordances: interval schedules can be deferred and
  re-anchored; date-rule schedules cannot be deferred and always continue on
  the next natural rule date.
- Future occurrences must be **computable** arbitrarily far ahead without being
  materialized (needed for budget forecasting).

## Occurrence Lifecycle

- Occurrences **auto-materialize when due**, unposted, with a distinct status
  that excludes them from default transaction views and reports.
- The next or due occurrence can be **confirmed early** from the UI. An early
  manual confirm sets the transaction date to the current date, as that is
  almost certainly the intent.
- Occurrences that came due while unattended (app not running, user inaction)
  each become **individually reviewable**. Nothing is silently created and
  nothing is silently skipped.
- **Dismissals are durable**: a dismissed occurrence is materialized with a
  dismissed status and never reappears. This holds for manual dismissal and
  for automatic dismissal (e.g. LLM helpers, external-source sync).
- Actions on a due occurrence:
  - **Confirm as-is**: the occurrence becomes a normal transaction.
  - **Dismiss**: skip this one occurrence; the schedule anchor is unchanged.
  - **Cancel**: stop the whole definition (see definition lifecycle).
- **Defer** (interval schedules only) acts on the schedule, not on a
  materialized occurrence: it re-anchors the whole schedule so the next
  **non-materialized** occurrence and everything after it shift by the
  deferred offset. The offset defaults to one cadence interval and is
  user-editable. Already-materialized occurrences — the due occurrence under
  review or a future occurrence confirmed early — never participate in defer
  and remain individually reviewable.
- There is no confirm-with-edits: if the actual amount or date differed,
  confirm first and then edit the resulting transaction like any other. The
  same contract applies to future automatic confirmation on a match to an
  externally imported transaction: the match confirms the occurrence, and
  actual values live on the transaction.

## Definition Lifecycle

- Definitions support **pause/resume**. There are no end-date or
  occurrence-count end conditions.
- While paused, no occurrences accrue and no backlog forms. On resume,
  interval schedules re-anchor at the resume date; date-rule schedules resume
  on the next natural rule date.
- **Cancel tombstones the definition** (standard soft-delete pattern).
  Generated transaction history remains untouched.
- Pause and cancel leave already-materialized unreviewed occurrences in the
  review queue; the user still confirms or dismisses them individually.
- **Edits affect future materialization only.** Already-materialized
  occurrences, reviewed or not, keep the shape they were generated with.

## Integrity and Provenance

- Entities referenced by an active definition (accounts, categories, members,
  tags) cannot be tombstoned; this follows the existing tombstone-protection
  pattern.
- Generated transactions carry `source = RECURRING_TEMPLATE` and remain
  traceable back to their definition and occurrence.

## Out of Scope (Must Not Be Precluded)

- The exact storage model for definitions and occurrences.
- Matching imported transactions to expected occurrences and reconciliation
  workflows.
- Budget integration that projects future occurrences into forecasts.
