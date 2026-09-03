# Plan: Replace recurring occurrences with next-slot anchors (Kata 1m7e)

## Goal

Make each recurring definition's anchor its authoritative next unmaterialized schedule slot, materialize due slots directly as expected transactions, keep all future slots virtual, and preserve recurring provenance through a direct transaction-to-definition reference without a recurring-occurrence entity.

## Constraints

- Remove the `recurring_occurrence` table, enum, service/domain types, REST resources, generated client surfaces, and occurrence-ID links outright; do not retain compatibility adapters or occurrence audit state.
- Preserve every generated transaction and journal record, including expected, confirmed, cancelled, and tombstoned history, while replacing `transaction.recurring_occurrence_id` with a direct nullable `recurring_definition_id`.
- Losing occurrence-only scheduled-vs-actual metadata, materialization/review timestamps, definition-version snapshots, and deferred audit rows is an explicitly accepted data-loss exception. Dangling transaction provenance must fail migration instead of being silently discarded.
- Treat migration-time anchor conversion as deliberately lossy: before upgrading, the user must open recent transactions with the old binary to force catch-up. A single SQL migration then advances each definition from its latest occurrence at or after the current anchor using only small, frozen schedule-class expressions, or retains/normalizes the current anchor when no such occurrence exists. Do not call live service code, copy the full catch-up algorithm, or depend on the migration server's civil date.
- Accept that gaps created by unusual re-anchors and clamped month/year interval histories may require a one-time manual anchor correction after upgrade; the migration must preserve the normal interval and calendar-rule cadence but need not reconstruct every historical first-unoccupied-slot result.
- Catch-up atomically creates every due slot through today as a directly linked `EXPECTED` transaction and advances the anchor to the first future slot. Reviewing an already-materialized expected transaction never advances the anchor again.
- Confirm-next and defer consume the current virtual slot and advance the anchor by default. There is no “record extra, keep schedule” operation; restoring the prior cadence is an explicit second anchor edit, which may select today or a later date even when another transaction already represents it.
- Manual recurring confirmation creates or activates an ordinary `ACTIVE` transaction whose records are `RECONCILED`; `UNRECONCILED` remains reserved for automatic imports. Import matching is not part of this work.
- Keep current pause/resume, cancellation, future projection, settlement, valuation, filtering, and browser interaction behavior except where occurrence identity or the new anchor semantics necessarily changes it.

## Success Criteria

- [ ] The occupied-anchor regression is covered end to end: early confirmation consumes the next slot, leaving the anchor alone preserves the following slot, and explicitly moving the anchor back to the occupied calendar date restores that cadence without changing the earlier transaction or encountering a uniqueness conflict.
- [ ] Due and missed slots materialize exactly once as expected transactions, advance the anchor atomically, remain independently confirmable or dismissible at any later time, and never depend on a permanent scheduled-slot row.
- [ ] Future transaction-list positions remain read-only projections; only the anchor projection is actionable, and reads create no future transaction state.
- [ ] Persisted and projected recurring transactions expose direct definition ID/FQN/active provenance, including usable plain provenance after definition cancellation, with no occurrence lookup.
- [ ] The v18 migration fixture upgrades through the bounded lossy anchor conversion, preserves generated transaction identities and accounting data, backfills direct definition links, reconciles recurring-generated records, retains normal interval and calendar-rule cadence, and completes full database validation with no occurrence storage in the target schema; migration tests bound the accepted loss with at least one unusual re-anchor or clamped-interval case.
- [ ] The OpenAPI contract, REST handlers, generated Go/TypeScript clients, CLI/MCP catalogs, browser workflows, demo data, database validation, package documentation, `PROJECT_STATE.md`, accounting semantics, and web UI design all describe and use the final model only.
- [ ] An independent read-only review subagent compares the completed implementation and tests against `docs/recurring-transactions-semantics.md`, and every identified mismatch is resolved before final validation.
- [ ] `just pre-commit`, `just test`, `just test-race-concurrency`, `just test-integration`, and `just test-frontend-e2e` pass.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-01-recurring-next-slot-anchor.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Close Kata `1m7e` with the commits and validation evidence.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Archive representative v18 recurring state

Before adding a migration, use a clean `main` checkout and the production REST/CLI workflow from `internal/apptest/testdata/migrations/README.md` to create `v00018.duckdb.gz`. Seed the occupied-anchor regression plus representative expected, confirmed, dismissed, deferred, paused, interval, clamped-month interval, day-of-month, and last-day state needed to prove normal cadence, bound accepted anchor loss, and verify direct provenance, forcing catch-up through the old public workflow before archiving; never seed the fixture with SQL or a binary containing the new migrations.

- [ ] The archived database validates under schema v18 and contains only the minimal production-reachable data needed by the later migration app-test.
- [ ] Commit as `test(migrations): archive recurring occurrence state`.

### Task 2: Replace occurrence state end to end

Implement the final model across `internal/services/recurring`, `internal/services/transactions`, `internal/store`, runtime wiring, REST, generated clients, and the browser. Add a single v19 SQL migration that derives the bounded next-slot anchor while occurrence data still exists, recreates transaction provenance with `recurring_definition_id`, backfills through the old occurrence relation, reconciles recurring-template journal records, and drops the occurrence table/type. Keep its schedule expressions migration-local and limited to normalization plus one successor calculation; do not register a Go migration or reproduce iterative catch-up. Update database validation and the generated accounting schema accordingly.

Make the recurring provider run catch-up before ordinary transaction listing and, for future-positioned reads, project from the resulting anchor under the same recurring-state lease. Replace occurrence reads/actions with transaction-native expected confirmation and dismissal endpoints keyed by transaction ID; return an ordinary transaction from both materialized confirmation and confirm-next, return the updated definition from defer, and remove every `RecurringOccurrence` schema and client-surface operation. Transaction responses must carry direct definition ID, FQN, and active state for persisted recurring transactions and virtual projections, with projection-next state remaining explicit.

Simplify the frontend transaction resource, action applicability, confirmation dialog, provenance rendering, and recurring refresh coordination so transaction listing itself owns catch-up, expected actions use transaction IDs, and no occurrence-list fan-out or provenance lookup remains. Update existing app and browser tests rather than adding lower-level tests: cover atomic/idempotent catch-up, direct provenance, reconciliation, actual-date confirmation and revaluation, dismissal, confirm-next/defer advancement, backward re-anchor recovery, pause/resume, cancellation, projections, filtering, concurrency, and the v18-to-v19 migration solely through supported app boundaries. Use the `write-package-docs` skill for every touched package, and align `api/openapi.yaml`, `api/client-surfaces.yaml`, `docs/accounting-semantics.md`, `docs/webui-design.md`, `PROJECT_STATE.md`, and the owning package docs without retaining superseded occurrence terminology or migration history.

- [ ] Repository searches outside immutable completed plans and migration history find no runtime `recurring_occurrence` table, occurrence ID, status, endpoint, DTO, generated operation, UI fetch, or package invariant.
- [ ] Migration and recurring app-tests prove the success criteria and accepted lossy boundary through REST, while the existing recurring browser journey proves the human confirm/dismiss/confirm-next/defer workflow after the contract change.
- [ ] Run `just pre-commit`, `just test`, `just test-race-concurrency`, `just test-integration`, and `just test-frontend-e2e` before committing.
- [ ] Commit as `refactor(recurring): replace occurrences with next-slot anchors`.
