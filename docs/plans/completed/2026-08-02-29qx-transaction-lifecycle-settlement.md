# Plan: Separate transaction lifecycle from balance settlement (Kata 29qx)

## Goal

Replace the overloaded journal-record posting status with an explicit transaction lifecycle and timestamp-derived settlement on balance records. Expected and cancelled transactions remain reviewable accounting concepts, tombstoning remains persistence deletion, pending/posted become derived facts on owned/party records, and flow/system records carry no lifecycle dates. Deliver the final model through DuckDB validation, stores, services, REST and generated clients, recurring operations, templates, and the complete web UI.

## Constraints

- Mina is evergreen and has no compatibility obligation. Design the final contract as if it had existed from the start: edit the original migrations, remove obsolete fields/endpoints/tests outright, and add no upgrade migration, data conversion, dual-read/write path, compatibility alias, deprecated enum, or transitional adapter.
- The persisted model is `transaction.lifecycle_status = ACTIVE | EXPECTED | CANCELLED`; `journal_record.posting_status` and `transaction_template_record.posting_status` do not exist.
- Balance-record settlement is derived from dates: `posted_date != NULL` is posted; otherwise `pending_date != NULL` is pending. `posted_date` takes precedence while retaining both event dates. The backend returns the derived value; it is never persisted.
- Active owned/party records must have a valid pending or posted settlement after service normalization. Expected owned/party records have neither date. Flow/system records always have neither date. When both dates exist, posted cannot precede pending.
- A transaction response exposes its lifecycle plus a server-derived settlement summary of `pending`, `posted`, `mixed`, or `not_applicable`. Record responses expose nullable derived settlement and inherited transaction lifecycle so standalone register/search results remain self-describing. Clients do not independently derive either value.
- Ordinary journal and shorthand creation produce `ACTIVE` transactions; recurring materialization is the only creator of `EXPECTED` transactions. `CANCELLED` is reached through the transaction cancel operation, not generic create/replace or record mutation. Generic replacement is limited to active transactions.
- REST write records use an input-only settlement intent (`pending` or `posted`, with optional exact pending/posted timestamps) rather than a writable posting-status field. The transactions service resolves omitted manual timestamps from the transaction initiated date and exact imported/provider timestamps pass through. Store inputs contain only explicit lifecycle values and normalized timestamps.
- Recurring confirmation accepts or constructs an explicit settlement intent, changes the generated transaction to `ACTIVE`, stamps only owned/party records, and updates the occurrence atomically. Store SQL must not choose lifecycle timestamps or call the wall clock for them.
- Cancellation is transaction-level, idempotent, preserves record dates and reconciliation, and is valid only for an active transaction whose balance settlement is wholly pending. Restoration is an explicit transaction operation that changes only lifecycle back to `ACTIVE`. Posted/mixed activity uses a reversal transaction rather than retroactive cancellation.
- Expected and cancelled transactions are excluded from balances, running balances, month totals, and reports by transaction lifecycle. Expected remains excluded from default transaction/record listings; explicit lifecycle filters can request it. Settlement filters operate only on derived balance settlement, with mixed and no-balance transaction behavior defined by the response summary.
- Replace the overloaded record bulk-status API with separate settlement and reconciliation operations. Settlement updates target owned/party records only; the service computes explicit per-record timestamps once and the store applies them atomically with set-based SQL, never a per-record write loop. Cancellation/restoration target transactions, never records.
- Transaction templates remain date-free structural defaults and carry no lifecycle or settlement default. Recurring definitions remain date-free balanced shapes.
- USD inference uses the transaction `initiated_date` consistently for every record; do not add lifecycle dates to flow/system records or add a new valuation field without evidence for a separate concept.
- The web UI never displays or edits raw pending/posted timestamps. It shows transaction lifecycle and derived settlement, offers settlement controls only for owned/party records, and offers cancel/restore only at transaction level.
- Services own lifecycle, settlement normalization, account-type validation, and clocks; stores own DuckDB persistence, set-based queries, and atomic transactions; REST handlers only map the OpenAPI contract. Preserve all package boundaries in `docs/architecture.md`.
- Follow `docs/TESTING.md`: behavior coverage belongs in REST-boundary app-tests and focused Playwright browser tests; add no unit tests or direct store/service assertions.

## Success Criteria

- [ ] The canonical schema, data-model documentation, DB validator, services, queries, REST contract, generated clients, templates, recurring workflows, and UI all use transaction lifecycle plus derived balance settlement, with no surviving product use of `posting_status`.
- [ ] Active, expected, cancelled, mixed-settlement, and no-balance transactions have the documented read, mutation, filtering, aggregate, and UI behavior; invalid account/date combinations are rejected by services and reported by full database validation.
- [ ] Cancellation remains reversible and history-preserving, while delete and recurring dismissal retain their distinct tombstone semantics.
- [ ] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-02-29qx-transaction-lifecycle-settlement.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Close Kata `29qx` with the implementation commits and validation evidence.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Establish the owning lifecycle and settlement semantics

Replace record posting-status language in `docs/accounting-semantics.md` and `docs/recurring-transactions-semantics.md` with the approved transaction lifecycle, balance-only settlement derivation, transition, aggregate, tombstone, and valuation rules. Keep storage and UI mechanics in their owning documents rather than duplicating them here.

- [ ] The semantics explicitly cover active/expected/cancelled, pending/posted/mixed/not-applicable settlement, balance versus flow/system date invariants, pending-only cancellation and restoration, recurring confirmation/dismissal, initiated-date USD valuation, and transactions with no balance records.
- [ ] Commit as `docs(transactions): define lifecycle and settlement semantics`.

### Task 2: Replace the persisted and service model end to end

Implement the final model across the original schema migrations, `docs/data-model.md`, transaction/template/recurring services and stores, runtime clock composition, database validation, OpenAPI/httpapi, generated Go/TypeScript and CLI/MCP client surfaces, and REST-boundary app-tests. Update frontend consumers enough in this commit to compile and render the new read model honestly; Task 3 owns the complete interaction redesign.

- [ ] Replace the schema enum/columns in `00001_create_schema_primitives.sql`, `00008_create_transaction_and_journal_record.sql`, and `00010_create_transaction_template.sql`; re-pin `PinnedMigrationContentHash`. Add no migration or data backfill.
- [ ] Centralize settlement normalization in the transactions/recurring services, including exact provider timestamps, initiated-date defaults for creates, service-clock timestamps for transitions, account reassignment/type-change validation, and explicit normalized store inputs.
- [ ] Make recurring expected materialization, confirmation, confirm-next, and dismissal atomic under the new lifecycle; SQL receives timestamps and never derives them. Remove template settlement defaults.
- [ ] Change cancel to a transaction lifecycle update and add restore. Reject cancellation of expected, posted, mixed, or no-balance transactions; preserve dates and reconciliation.
- [ ] Rewrite transaction/record filters, balances, posted balances, running balances, month totals, USD inference/backfill, and expected/cancelled visibility to use transaction lifecycle and date-derived balance settlement.
- [ ] Replace `posting_status` and `include_expected` in OpenAPI with transaction lifecycle and settlement filters; return transaction lifecycle/settlement summary and record lifecycle/nullable settlement. Replace generic bulk record status with separate bulk settlement and reconciliation operations, and expose transaction cancel/restore. Regenerate every repository-owned REST, frontend, CLI, and MCP artifact through Justfile recipes and update `api/client-surfaces.yaml`.
- [ ] Replace mixed-record DB checks with full invariant findings for account/date applicability, expected occurrence linkage and lifecycle agreement, valid active settlement, cancelled pending-only settlement, and date ordering. Ensure full classification validation reads every lifecycle, not only the default visible list.
- [ ] App-tests prove create/replace and exact timestamp behavior; pending/posted/mixed/not-applicable derivation; lifecycle and settlement filters; expected/cancelled exclusions; set-based bulk settlement and separate reconciliation; cancel/restore/delete distinctions; recurring confirm/dismiss; template instantiation; invalid account/date combinations; and database-validation findings.
- [ ] Update affected package contracts and `PROJECT_STATE.md` without repeating the owning semantics.
- [ ] `just pre-commit`, `just test`, and `just test-integration` pass.
- [ ] Commit as `refactor(transactions): separate lifecycle from settlement`.

### Task 3: Complete the lifecycle and settlement web experience

Update `docs/webui-design.md` and the ledger, entry, recurring, account-register, filter, status, and generated-service consumers to present the new concepts directly. Remove every UI path that exposes raw lifecycle timestamps or edits record cancellation/expected state.

- [ ] Transaction rows/details prioritize expected/cancelled lifecycle, show pending for pending or mixed active transactions, omit the ordinary posted word, and handle no-balance transactions without implying expected.
- [ ] Record disclosures show derived settlement only for owned/party records; flow/system rows show no settlement or lifecycle-date affordance. Raw pending/posted timestamps are absent from all browser surfaces.
- [ ] Advanced entry and record/account-register editing expose pending/posted settlement intent only where the account is owned/party. Account reassignment updates available controls and cannot submit an invalid date/account combination.
- [ ] Bulk mode uses the separate settlement and reconciliation operations; cancellation and restoration are transaction actions. Expected transactions remain confirm/dismiss workflows and are not ordinary edit/bulk targets.
- [ ] Transaction lifecycle and settlement filters replace posting-status/include-expected controls without client-side status derivation; existing expected-queue, mixed indicator, selection, refresh, keyboard, and error-feedback behavior remains coherent.
- [ ] Focused Playwright scenarios prove pending/posted/mixed display, flow/system omission, expected confirm/dismiss, pending cancel/restore, tombstone delete, and settlement/bulk interactions without duplicating REST scenario coverage.
- [ ] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [ ] Commit as `feat(webui): separate lifecycle from settlement`.

### Task 4: Remove obsolete concepts and verify the final contract

Audit source, generated artifacts, docs, fixtures, demos, and test scripts for remnants of the overloaded model. Remove obsolete posting-status labels, status defaults, handlers, query branches, validation messages, and compatibility-shaped code rather than leaving dead aliases.

- [ ] Repository searches find no product schema, domain, API, generated-client, template, recurring, or UI dependency on `posting_status`, `PostingStatus`, `NonExpectedPostingStatus`, or `include_expected`; any remaining raw provider-status metadata is clearly provider provenance rather than Mina lifecycle state.
- [ ] The worktree contains one direct implementation of each lifecycle/settlement rule at its owning boundary and no duplicate client derivation or store-owned timestamp choice.
- [ ] Run the plan-wide validation and review-loop success criteria, record evidence on Kata `29qx`, and commit any resulting focused cleanup as `refactor(transactions): remove posting status remnants`.
