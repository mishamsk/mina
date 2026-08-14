# Plan: Align database integrity with layered ownership (Kata ac23)

## Goal

Bring every accounting database entity into conformance with Mina's documented integrity boundaries: DuckDB owns storage shape and selected small-table business keys, services coordinate cached references and unindexed growing datasets, and stores atomically protect fact relationships and parent revisions without fake writes or broad fact-table serialization.

## Constraints

- This is internal hardening only: preserve REST behavior, public errors, accounting semantics, timestamps, and exact no-op behavior; do not change OpenAPI, client surfaces, frontend code, `PROJECT_STATE.md`, or user-visible contracts.
- Add only the targeted tests and production-reachable REST state in the v15 migration fixture enumerated in Tasks 1 and 4; do not expand into broader adversarial matrices, implementation-detail tests, unreachable table states, or unrelated coverage. Existing assertions should remain unchanged unless an unavoidable adjustment is minimal and explained in its implementation commit and the Kata closure.
- Keep all primary keys, column types, nullability, defaults, generated columns, enums, and the existing non-unique `journal_record_transaction_id_idx` and `api_audit_entry_occurred_at_idx` read indexes.
- Keep DuckDB exact business-key enforcement for the small, rarely written account, category, tag, member, credit-limit history, budget, transaction-template, and recurring-definition tables; do not add service serialization solely for those keys, but allow validation to overlap when the same coordination is required for another integrity rule.
- Remove DuckDB business-key enforcement only from exchange rates, recurring occurrence slots, imported-record metadata, and record links; do not add foreign keys, domain `CHECK` constraints, or replacement performance indexes.
- Acquire coordination once at the outer use-case boundary and hold it through database commit plus cache publication or invalidation. When an operation needs both coordinators, acquire the app-wide reference lease before an owner-specific writer lease and enter the database transaction last.
- Use the `write-package-docs` skill for every package touched and update only package contracts changed by the implementation. `docs/architecture.md` and `docs/data-integrity-rationale.md` already own the approved design and need no further implementation-status edits.

## Integrity Ownership Inventory

| Entity | Business key and reference owner | Required implementation outcome |
| --- | --- | --- |
| Schema version, primary-key sequence, enums | DuckDB schema and migration machinery | Preserve existing ownership and DDL shape. |
| Account, category, tag, member | DuckDB unique indexes for exact active keys; app-wide exclusive lease for prefix-free FQN hierarchy rules, lifecycle, and cache coherence | Cover every create, rename/restructure, visibility change, and tombstone path; hold hierarchy validation through commit and map constraint conflicts without adding serialization solely for exact keys. |
| Credit-limit history | DuckDB unique index for active account/date; app-wide shared lease for the referenced account | Hold the shared lease across account validation and create commit; rely on DuckDB for the key and remove redundant key prechecks. |
| Exchange rate | Exchange-rate service writer coordinator | Serialize create, batch upsert, rate update, and tombstone through one app-scoped writer; validate active pair/date keys, including duplicates within a batch, without a unique index. |
| Transaction and journal record | Store transaction and material transaction revision; app-wide shared lease only for mutations using coordinated references | Preserve atomic double-entry changes and optimistic concurrency while allowing unrelated dependent mutations to run in parallel. |
| Budget | DuckDB unique index for active category/month; category lifecycle protected by the app-wide coordinator | Keep the current category-restructure mutation atomic and constraint-backed; a future budget write use case must take a shared reference lease but needs no key serializer while the index remains. |
| Transaction template and template record | DuckDB unique index for exact active template FQN; app-wide exclusive lease for prefix-free hierarchy rules; store transaction for owned records | Keep hierarchy validation through commit and child replacement atomic without a separate key serializer. |
| Recurring definition and definition record | DuckDB unique index for exact active definition FQN; app-wide exclusive lease for prefix-free hierarchy rules; store transaction for owned records | Cover create, replace, pause, resume, defer/anchor shift, and tombstone as definition mutations, with hierarchy validation held through commit. |
| Recurring occurrence and generated transaction | Recurring-occurrence writer coordinator, app-wide shared lease when current definition/reference state is required, and store transaction | Enforce one definition/date slot across materialization, confirm-next, defer/resume slot creation, and lifecycle transitions without a unique constraint. |
| Imported-record metadata | Store transaction and material related-transaction revision | Preserve its allowed tombstoned-parent history, reject duplicate active metadata explicitly, and advance related parents only for material attachment changes. |
| Record link | Store transaction and material revisions of all related transactions in stable order | Require valid active records, reject duplicate active pairs explicitly, and keep link creation/tombstoning atomic with parent revisions and whole-transaction cleanup. |
| API audit entry | Existing append/compaction ownership; non-unique ordering index | Leave business behavior and coordination unchanged. |
| Dense exchange-rate runtime data | Disposable runtime-schema rebuild ownership | Leave it outside portable migrations and accounting validation; do not treat it as an accounting business-key table. |

## Success Criteria

- [x] Every entity matches the inventory above, and no write path relies on a removed unique definition, a foreign key, or a fake parent update.
- [x] Reference-dependent transaction mutations can overlap under shared leases, while reference/definition mutations remain coherent with cache state under the exclusive lease.
- [x] All remaining schema-owned business keys map DuckDB conflicts consistently; exchange-rate and recurring-occurrence writers and metadata/link store transactions preserve their unindexed keys through commit.
- [x] Full database validation audits every business key independently of schema-index drift, while shallow validation continues to compare the migrated target schema and remains the default startup level.
- [x] The generated accounting schema and migration hash pin match the new migration, with small-table unique definitions and both approved non-unique read indexes preserved.
- [x] Only the explicitly approved test scenarios and shared v15 migration fixture are added; characterization tests either pass in Task 1 or move without weakened expectations to their owning implementation task, task-local future-state tests pass with their owning implementation, and any changed existing assertion has the required written justification.
- [x] `just prose-fmt`, `just test`, `just test-race-concurrency`, `just test-integration`, and `just pre-commit` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-18-data-integrity-ownership.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Close Kata `ac23` with the implementation commits, entity inventory, validation evidence, and the explicit user-directed replacement of its new-concurrency-test acceptance item with existing-suite validation.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Lock current integrity semantics with characterization tests

Add only deterministic app-boundary coverage that is expected to pass before production code changes. Build one immutable v15 migration fixture from `main` following `internal/apptest/testdata/migrations/README.md`; seed and assert only state creatable through the generated REST surface. If a test exposes behavior that current code does not yet satisfy, keep its expectation and move that test addition to the task that implements the owning change.

- [x] Add concurrent prefix-conflict coverage for account, category, tag, and recurring-definition writes, accepting either serialized winner while requiring a prefix-free final hierarchy and no partial loser state.
- [x] Extend account, category, and tag restructure coverage to prove cache publication: the old path is immediately reusable and the moved leaf immediately blocks a child path.
- [x] Add table-driven dependent-mutation/reference-deletion coverage for credit-limit creation, transaction replacement, and bulk category, tag, member, and account reassignment, accepting only the two legal serialized outcomes and asserting final REST-visible state.
- [x] Add concurrent transaction cancellation/posting coverage requiring exactly one valid mutation and a final state of cancelled/pending or active/posted, never cancelled/posted or an unexpected internal error.
- [x] Extend the deterministic exchange-rate provider fake to represent repeated rows and prove a duplicate pair/date loading batch fails atomically without persisting another valid row from the same batch.
- [x] Add recurring-occurrence writer characterization for overlapping materialization, confirm-next, defer, and resume slot creation, proving one permanent definition/date slot and no duplicate generated transaction.
- [x] Add concurrent definition replacement/materialization coverage requiring the occurrence's materialized version and generated transaction shape to be entirely old or entirely new.
- [x] Seed the v15 fixture only with production-reachable REST data needed to prove exchange-rate and recurring-definition, occurrence, and generated-transaction preservation.
- [x] Ensure every race-focused test that synchronizes concurrent work uses the shared `internal/apptest` synchronization harness (`AwaitSignal`, `AwaitValue`, and purpose-built blockers) for readiness and results; do not add sleeps, polling loops, or unbounded channel waits.
- [x] Run `just test`, `just test-race-concurrency`, `just test-integration`, and `just pre-commit`; commit as `test(integrity): lock current ownership semantics`.

### Task 2: Establish narrow application coordination

Replace `ReferenceSerializer` and its process-wide `sync.Mutex` with one runtime-owned read/write coordinator whose service-facing contract distinguishes shared dependent mutations from exclusive reference or reusable-definition mutations. Provide an explicit already-held path for composite use cases so shorthand transaction creation and transaction-scoped demo seeding do not recursively acquire leases.

- [x] Route all account, category, tag, member, transaction-template, and recurring-definition mutations through one exclusive lease, closing current gaps such as member create/rename and recurring pause/resume/defer.
- [x] Route only reference-dependent transaction, credit-limit, and recurring-occurrence mutations through a shared lease; remove the broad serializer from cancellation, restoration, deletion, settlement, reconciliation, backfill, and other fact-only paths that do not depend on mutable cached references.
- [x] Add one runtime-owned exchange-rate writer used by manual rate mutations and both normal and startup loading through the existing exchange-rate service boundary; reject duplicate keys within one upsert batch before persistence.
- [x] Add one runtime-owned recurring-occurrence writer covering slot creation and occurrence lifecycle mutations; operations that also mutate a reusable definition take the exclusive reference lease first.
- [x] Make demo seeding hold every required outer lease through its single `AppDB.WithTx` commit and give its transaction-scoped services explicit already-held coordination rather than nested locks.
- [x] Remove exact-key prechecks when no broader service-coordinated validation requires them. Where coordination already owns another integrity rule, allow an overlapping precheck when it keeps the broader validation or stable public conflict mapping coherent; DuckDB remains authoritative for exact-key conflicts.
- [x] Update `internal/runtime` and every touched service package contract with `write-package-docs`, including the lease scope, cache publication boundary, owner-specific writers, and lock order.
- [x] Commit as `refactor(integrity): narrow application write coordination`.

### Task 3: Make store fact guarantees semantic and atomic

Harden `internal/store` so cross-row and cross-table facts are protected inside the committing transaction, with real revision changes only when the parent domain state materially changes.

- [x] Do not seed or test imported-metadata and record-link states that the generated REST surface cannot create.
- [x] Replace transaction replacement's `SET updated_at = updated_at` claim with a read/compare plus a conditional material parent update that owns the ETag precondition; preserve the existing timestamp on an exact no-op and map DuckDB conflicts to the existing precondition error.
- [x] Audit transaction create/replace/tombstone/cancel/restore/backfill and every bulk journal-record mutation so changed owned rows share the transaction's operation timestamp and advance each changed parent once, while no-op selections leave parent revisions unchanged.
- [x] Move expected-recurring-occurrence eligibility checks used by transaction deletion and bulk mutation into the same store transactions as their writes, removing service read/write gaps without adding a global fact lock.
- [x] Replace the shared fake parent-claim helper for imported metadata and record links with material parent-revision helpers: resolve affected parents, order them stably, validate the appropriate active or historical relationship, detect existing and intra-batch duplicate keys, and update parents only when attachment rows will change.
- [x] Preserve imported metadata when its source transaction is tombstoned, preserve atomic record-link cleanup during whole-transaction tombstoning, and avoid double-advancing a parent already materially changed by that operation.
- [x] Make recurring occurrence slot preconditions explicit inside occurrence store transactions so the service writer protects concurrent calls and the store rejects existing or repeated keys within one operation without relying on DuckDB uniqueness.
- [x] Confirm transaction-template records, recurring-definition records, recurring occurrences with generated transactions, metadata, and links have no remaining multi-call persistence preconditions outside their committing transaction.
- [x] Remove obsolete foreign-key and removed-unique-index error handling only after its callers have explicit service/store ownership, and update the affected store and service package contracts with `write-package-docs`.
- [x] Commit as `fix(integrity): enforce fact relationships in store transactions`.

### Task 4: Migrate DDL and align database validation

Add the next immutable accounting migration only after application and store ownership is in place, preserving all accounting rows while narrowing DuckDB uniqueness to the approved small tables.

- [x] After adding the migration, add the approved `apptest.NewFromMigrationFixture(t, 15)` app test. It may fail until the migration is correct; prove through existing REST behavior that exchange rates plus recurring definitions, occurrences, definition records, and generated transactions survive and retain their pre-migration semantics.
- [x] Drop `exchange_rate_active_pair_date_unique` in place; retain its nullable tombstone-aware table constraint because it does not enforce active-row uniqueness.
- [x] Remove the recurring-occurrence definition/date `UNIQUE` constraint.
- [x] Drop `imported_record_metadata_active_record_unique` and `record_link_active_pair_unique` in place; retain their nullable tombstone-aware table constraints because they do not enforce active-row uniqueness.
- [x] Preserve the eight approved small-table active unique indexes and their existing DDL, all primary keys and storage-shape constraints, and the journal-record parent and API-audit ordering indexes; rebuild only recurring occurrences because DuckDB cannot drop its unnamed non-null slot constraint.
- [x] Regenerate `internal/services/accountingschema/schema.sql` through `just accounting-schema` and update `internal/store.PinnedMigrationContentHash` after reviewing the resulting target catalog.
- [x] Decouple full invariant validation from missing-unique-index findings and audit all active business keys unconditionally, including definition/date recurring occurrence slots; keep schema drift reporting and shallow/full execution policy unchanged.
- [x] Add no migration or schema tests beyond the shared v15 fixture and the approved preservation assertions above; rely on the existing validation, app, concurrency, and integration suites for the remaining evidence.
- [x] Update every touched schema, validation, and store package contract with `write-package-docs`, run `just prose-fmt`, and commit as `refactor(schema): narrow database uniqueness ownership`.

### Task 5: Complete the entity sweep and close the work

Review the final diff against the integrity ownership inventory rather than adding another defensive layer.

- [x] Search for every former serializer call, every business-key conflict mapper, every `SET updated_at = updated_at`, every removed index name, and every persisted table; resolve or document each survivor against the inventory.
- [x] Confirm package docs describe only durable ownership and side effects, with no duplicate architecture rationale or implementation history.
- [x] Confirm no public contract, frontend, product-state, or unapproved test/fixture scope entered the change; explain any unavoidable existing assertion update before committing it.
- [x] Run the plan-wide validation and single review loop, record evidence on Kata `ac23`, move this plan to completed, close the issue, and commit as `docs(plan): complete data integrity ownership`.
