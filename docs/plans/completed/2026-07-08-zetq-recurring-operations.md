# Plan: Recurring operations — definitions, occurrences, lifecycle APIs (kata zetq)

Deliver the recurring transaction operations backend: recurring definitions with validated schedule payloads, definition records carrying a complete balanced transaction shape, occurrence materialization with the confirm/dismiss/defer/pause/resume lifecycle, and REST APIs for all of it. Builds on the schema prep from kata `nszw` (EXPECTED posting status, `transaction.recurring_occurrence_id`). Backend/API only — no UI work.

## Plan Context

- Kata issue: `zetq`. Read the FULL issue body first with `kata show zetq --agent` — it carries the agreed, authoritative DDL for `recurring_definition`, `recurring_definition_record`, `recurring_occurrence`, the two new enums, the schedule payload contract, and the flow cross-checks. Implement that DDL exactly; rationale-flavored comments in the issue must be rewritten as evergreen field documentation.
- Business semantics ground truth: `docs/recurring-transactions-semantics.md` — follow it exactly; do not redesign semantics. Hierarchy rules for definition FQNs: `docs/hierarchy-semantics.md` (definitions are FQN-identified and follow the same conventions; mirror the validation used for transaction templates, including prefix-free/active-FQN uniqueness).
- Schema rules: NEW tables and NEW enum types go in a new versioned migration file (like `transaction_template` did). Changes to EXISTING tables/enums must edit the original DDL in place — but none should be needed; `nszw` already landed them. Update `PinnedMigrationContentHash` (`internal/store/db_validation.go`) in the same commit as any migration change. Keep `docs/data-model.md` aligned in the same commit.
- db-validation: move `transaction.recurring_occurrence_id` from `validationReferenceWaivers()` to `validationReferences` (targeting `recurring_occurrence`). Register FK-shaped columns of the new tables (`recurring_definition_record.recurring_definition_id/account_id/member_id/category_id`, `recurring_occurrence.recurring_definition_id`) and follow existing patterns for tag_ids and invariants that mirror service-enforced rules (e.g. active definition record set balances per currency).
- New app-owned service package `internal/services/recurring` (domain types, validation, use cases, repository interface); store implementation in `internal/store`; REST adapter in `internal/httpapi` per `docs/architecture.md` package boundaries. OpenAPI source `api/openapi.yaml`; regenerate with `just openapi` and `just frontend-openapi`; never hand-edit generated files. No frontend changes beyond the regenerated client (no UI features; nothing user-visible in the web UI should change).
- **Decided semantics (do not redesign):**
  - Schedule payload: versioned JSON, `version` and `kind` mandatory; kinds `interval` (`every` >= 1, `unit` in DAY/WEEK/MONTH/YEAR), `day_of_month` (1–31, clamped to month end), `last_day_of_month`. `interval` => INTERVAL class, others => DATE_RULE (schema-derived generated column; service derives the same way). Validation owned by the recurring service. Unknown kind/version rejected with stable machine-readable errors.
  - Interval date arithmetic: due dates are `anchor_date + k * (every × unit)`; month/year steps use calendar arithmetic with clamping to month end (consistent with `day_of_month` clamping). DATE_RULE due dates are rule dates on or after `anchor_date`.
  - `anchor_date` is rewritten only by defer (interval only) and resume; never by confirmation.
  - Definition owns a complete balanced record set: at least 2 active records, balancing to zero per currency (mirror transaction balance validation). No `amount_usd` on definition records — USD conversion is inferred at generation time via the existing exchange-rate inference used for transaction creation (may yield NULL).
  - Create may seed from a transaction template (`template_id` in the create request): copy the template's record shape at creation time as defaults for the request, with no live link; the resulting definition must still pass complete-balanced validation. Seeding is copy-only — request-provided records/fields win over template defaults.
  - Materialization (catch-up): for each active (non-tombstoned, non-paused) definition, every schedule slot with `scheduled_date <= today` that has no occurrence row materializes: insert occurrence (status EXPECTED, stamped `materialized_definition_version`) + create the transaction with records copied from the definition, `posting_status = EXPECTED`, `source = RECURRING_TEMPLATE`, `transaction.recurring_occurrence_id` set, `initiated_date = scheduled_date`. Atomic per occurrence (occurrence + transaction + records in one DB transaction). Idempotent by the `UNIQUE(recurring_definition_id, scheduled_date)` slot constraint.
  - **Materialization trigger (decided):** catch-up runs as a service operation invoked by the occurrence-facing read APIs (listing occurrences) before they answer, and by the lifecycle actions that need current state (confirm-next, defer). No background scheduler, no goroutines, no clock globals — the service receives time through its existing boundary conventions. Nothing is silently created beyond EXPECTED occurrences (which ARE the review queue) and nothing is silently skipped.
  - Confirm (occurrence-level, on a materialized EXPECTED occurrence): records flip EXPECTED -> POSTED (`posted_date = pending_date`, manual non-bank convention); occurrence -> CONFIRMED with `reviewed_at` set; transaction dates unchanged (user edits the transaction afterwards like any other). Atomic.
  - Confirm-next / early confirm (definition-level): materializes the definition's next non-materialized slot immediately with `initiated_date =` current date, then confirms it in the same operation (occurrence CONFIRMED). Anchor unchanged.
  - Dismiss (occurrence-level, EXPECTED only): tombstone the generated transaction + records; occurrence -> DISMISSED with `reviewed_at`; permanent occurrence row + unique slot means it never reappears.
  - Defer (definition-level, INTERVAL class only; reject for DATE_RULE): acts on the next NON-materialized slot: insert an occurrence row at that `scheduled_date` with status DEFERRED (audit record, no transaction), then shift `anchor_date` forward by the offset. Offset defaults to one cadence interval and is client-editable in the request. Already-materialized occurrences never participate.
  - Pause: set `paused_at`; materialization skips paused definitions entirely (no backlog accrues). Resume: clear `paused_at`; INTERVAL definitions re-anchor `anchor_date` to the resume date; DATE_RULE definitions keep their anchor as floor and continue on natural rule dates. Pause/cancel leave already-materialized EXPECTED occurrences in the review queue.
  - Edit (definition update): mutate definition fields/records in place, bump `definition_version`; future-only by construction (materialized occurrences own copied journal records). Replacing the record set follows the same balanced validation.
  - Cancel: tombstone the definition (soft delete); generated history untouched; materialized EXPECTED occurrences remain reviewable (confirm/dismiss still work); no new materialization.
  - Next due date is always computed (anchor + rule + existing occurrence slots — the earliest slot strictly after the last materialized/deferred slot, or from the anchor when none exist); no stored cursor. Expose it as a computed field on definition responses (null when paused or tombstoned).
  - Tombstone protection: accounts, categories, members, and tags referenced by ACTIVE definitions cannot be tombstoned — extend the existing service-level delete-guard pattern used for transactions/templates. No FKs anywhere.
  - Occurrence statuses other than EXPECTED are terminal. Occurrence rows are permanent (no tombstoned_at) — never delete them.
- API surface (REST, follow existing OpenAPI conventions for paths, errors, pagination, and typed allowlists):
  - `POST /api/recurring-definitions` (create; optional `template_id` seed), `GET /api/recurring-definitions` (list, computed fields incl. `schedule_class`, `next_due_date`, hierarchy fields; excludes tombstoned by default), `GET /api/recurring-definitions/{id}`, `PUT /api/recurring-definitions/{id}` (edit, version bump), `DELETE /api/recurring-definitions/{id}` (cancel/tombstone).
  - `POST /api/recurring-definitions/{id}/pause`, `.../resume`, `.../defer` (optional offset), `.../confirm-next`.
  - `GET /api/recurring-occurrences` (review queue; runs catch-up materialization; filterable by status and definition; typed allowlists), `POST /api/recurring-occurrences/{id}/confirm`, `POST /api/recurring-occurrences/{id}/dismiss`.
  - Exact DTO field naming follows `docs/data-model.md` column names and existing API conventions.
- Tests: app-tests only per `docs/TESTING.md` — REST-client-only fixtures and assertions, no SQL/service/store access, readable as user scenarios. Date-sensitive scenarios must compute anchor dates relative to the real current date (e.g. "anchored 3 cadences ago") and assert derived REST-visible outcomes; do not hardcode calendar dates.
- Package docs: add `internal/services/recurring/PACKAGE.md` (use `docs/package_doc_template.md`) for the implicit contracts (materialization trigger/idempotency, occurrence permanence, anchor rewrite rules); update `internal/store/PACKAGE.md` if store-level contracts change.
- Scope exclusions: no import matching/reconciliation, no budget forecasting projection APIs, no UI, no background scheduler, no changes to recurring-unrelated surfaces.

## Tasks

### Task/Commit 1: Schema for recurring definitions and occurrences

New migration with the two enums and three tables exactly per the agreed DDL in the zetq issue body (comments rewritten evergreen), db-validation kept whole. After this commit the storage model is final.

- [x] New migration file: `recurring_schedule_class`, `recurring_occurrence_status` enums; `recurring_definition`, `recurring_definition_record`, `recurring_occurrence` tables with generated columns, unique constraints, and the active-FQN expression index, exactly per the issue DDL
- [x] Move `transaction.recurring_occurrence_id` from `validationReferenceWaivers()` to `validationReferences` (target `recurring_occurrence`); register FK-shaped columns of the new tables in the reference registry
- [x] Update `PinnedMigrationContentHash`
- [x] Update `docs/data-model.md` with the new enums, tables, comments, and index, matching the migration exactly
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in the kata issue `zetq`
  - [x] Commit changes

### Task/Commit 2: Recurring definitions service, store, and CRUD APIs

The `internal/services/recurring` package with domain types, schedule payload validation, balanced-record-set validation, FQN hierarchy rules, template seeding, and tombstone protection; store repository; definition CRUD + cancel REST APIs. After this commit definitions are fully manageable.

- [x] `internal/services/recurring`: domain types, repository interface, create/get/list/update/cancel use cases; schedule payload validation (version+kind mandatory, three kinds, stable errors); balanced active record set (>= 2 records, zero per currency); FQN validation and active-FQN uniqueness mirroring templates (incl. prefix-free rules per `docs/hierarchy-semantics.md`); referenced-entity validation (accounts/categories/members/tags active); edit bumps `definition_version`
- [x] Template seeding on create (`template_id`): copy shape as defaults, no live link, full validation still applies
- [x] Tombstone protection: entities referenced by active definitions cannot be tombstoned (extend the existing delete-guard pattern for accounts/categories/members/tags)
- [x] Store: repository implementation (definitions + records, computed `next_due_date` inputs, list/get/create/update/tombstone)
- [x] OpenAPI + httpapi: definition CRUD endpoints (`POST/GET/PUT/DELETE /api/recurring-definitions[...]`) with typed allowlists and stable errors; regenerate clients
- [x] App-tests: create/read/list/update/cancel round-trips; schedule payload rejections (bad kind/version/every/unit/day); unbalanced record set rejected; duplicate active FQN rejected; template-seeded create; tombstone protection observable via delete-guard APIs; definition_version visibly bumps on edit; `next_due_date` computed for interval and date-rule definitions
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in the kata issue `zetq`
  - [x] Commit changes

### Task/Commit 3: Occurrence materialization and review queue API

Catch-up materialization in the recurring service and the occurrences listing API. After this commit due slots become reviewable EXPECTED occurrences with generated EXPECTED transactions.

- [x] Materialization use case per the decided semantics: catch-up for active non-paused definitions, one atomic DB transaction per occurrence (occurrence row + EXPECTED transaction + records with `source = RECURRING_TEMPLATE`, `recurring_occurrence_id` back-pointer, `initiated_date = scheduled_date`, amount_usd via existing inference), idempotent via the unique slot constraint
- [x] `GET /api/recurring-occurrences`: runs catch-up, lists occurrences with status/definition filters (typed allowlists), exposes scheduled_date, status, materialized version, reviewed_at, generated transaction id
- [x] App-tests: definition anchored several cadences in the past materializes one occurrence per missed slot on first occurrence listing; generated transactions are EXPECTED, carry the occurrence back-pointer, are excluded from default lists/balances/month totals (nszw semantics) and visible via `posting_status=expected`; repeated listing materializes nothing new; paused definitions materialize nothing; date-rule (day_of_month incl. clamping, last_day_of_month) and interval schedules both covered
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in the kata issue `zetq`
  - [x] Commit changes

### Task/Commit 4: Confirm, confirm-next, and dismiss

The review actions on occurrences plus early confirmation at the definition level. After this commit the full happy-path lifecycle works.

- [x] `POST /api/recurring-occurrences/{id}/confirm`: EXPECTED occurrence only; records flip to POSTED (`posted_date = pending_date`), occurrence CONFIRMED with `reviewed_at`; atomic; terminal statuses rejected with stable errors
- [x] `POST /api/recurring-occurrences/{id}/dismiss`: EXPECTED occurrence only; generated transaction + records tombstoned; occurrence DISMISSED with `reviewed_at`; durable (never re-materialized)
- [x] `POST /api/recurring-definitions/{id}/confirm-next`: materialize the next non-materialized slot with `initiated_date =` current date and confirm it in one operation; anchor unchanged; works ahead of the due date
- [x] App-tests: confirm makes the transaction visible in default lists/balances/month totals as posted; dismiss removes the transaction (tombstoned) and the slot never reappears on later listings; confirm-next creates a CONFIRMED occurrence with today's initiated_date and the following slot still materializes on schedule; double-confirm/dismiss and dismiss-after-confirm rejected
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in the kata issue `zetq`
  - [x] Commit changes

### Task/Commit 5: Defer, pause, resume, and lifecycle edge semantics

The schedule-level actions and their interaction with materialization. After this commit all issue flows are implemented.

- [x] `POST /api/recurring-definitions/{id}/defer`: INTERVAL class only (stable rejection for DATE_RULE); inserts DEFERRED occurrence at the next non-materialized slot (audit row, no transaction), shifts `anchor_date` by the offset (default one cadence, editable via request); already-materialized occurrences unaffected
- [x] `POST /api/recurring-definitions/{id}/pause` and `/resume`: pause sets `paused_at` and stops materialization; resume clears it, re-anchors INTERVAL definitions to the resume date, DATE_RULE definitions continue on natural rule dates; no backlog forms across the paused window
- [x] Cancel/pause interaction with the queue: already-materialized EXPECTED occurrences remain confirmable/dismissable after pause and after cancel; cancelled definitions never materialize again
- [x] Edit future-only proof: after an edit (amount/record change + version bump), previously materialized EXPECTED occurrences keep their generated shape; newly materialized ones use the new shape and stamp the new `materialized_definition_version`
- [x] App-tests covering each bullet above through REST-observable behavior
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in the kata issue `zetq`
  - [x] Commit changes

### Task/Commit 6: Docs, package contracts, and state

Close out the feature: project state, package docs, and any db-validation invariants that mirror the service rules.

- [x] `internal/services/recurring/PACKAGE.md` documenting implicit contracts (materialization trigger + idempotency, occurrence permanence/terminality, anchor rewrite rules, tombstone protection); update `internal/store/PACKAGE.md` if store contracts changed
- [x] db-validation: add invariant checks that mirror service-enforced recurring rules where existing patterns apply (e.g. active definition record sets balance per currency; EXPECTED transactions reference an existing occurrence), with e2e validate testdata following the existing `inv_*` pattern
- [x] Update `PROJECT_STATE.md`: recurring operations delivered (definitions, occurrences, lifecycle APIs)
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in the kata issue `zetq`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "zetq recurring operations backend: new tables per agreed issue DDL (new migration, evergreen comments, pinned hash updated); internal/services/recurring owns schedule payload validation (interval/day_of_month/last_day_of_month), balanced definition records, FQN rules, tombstone protection; catch-up materialization triggered by occurrence-facing APIs, atomic + idempotent, EXPECTED transactions with recurring_occurrence_id and source RECURRING_TEMPLATE; confirm->POSTED, dismiss durable, defer interval-only re-anchors, pause/resume without backlog, edits future-only with version stamps; occurrence rows permanent, statuses terminal except EXPECTED; app-tests only via REST client; no UI, no scheduler, no budget projection"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close kata issue `zetq` with evidence (commit SHA, suites run)
