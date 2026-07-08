# Plan: Extend existing schema for recurring transactions (kata nszw)

Prepare the accounting schema and API surface for recurring transactions (kata `zetq`) before Mina holds production data: the `posting_status` enum gains `EXPECTED` (pre-confirmation state for recurring-generated records), `"transaction"` gains a nullable `recurring_occurrence_id` back-pointer column, and all default transaction views, searches, registers, balances, and reports exclude EXPECTED records. No recurring tables, services, or recurring APIs in this task.

## Plan Context

- Kata issue: `nszw`. Business semantics ground truth: `docs/recurring-transactions-semantics.md`. Schema ground truth to keep aligned: `docs/data-model.md`. Test rules: `docs/TESTING.md` (app-tests via the in-process generated REST client only; no SQL, no service/store calls from tests).
- **Evergreen schema rule (this branch, pre-production):** implement schema changes by editing the ORIGINAL migration files in place. NEVER add new migration files, `ALTER` statements, or upgrade migrations. Update `PinnedMigrationContentHash` (`internal/store/db_validation.go:22-23`) in the same commit as any migration edit, otherwise db-validation fails.
- `posting_status` lives on `journal_record` (`internal/store/migrations/00008_create_transaction_and_journal_record.sql`), not on `"transaction"`; the enum type is created in `internal/store/migrations/00001_create_schema_primitives.sql:4`. `transaction_template_record.posting_status` also uses the type but template semantics do not change here.
- The enum becomes `ENUM ('EXPECTED', 'PENDING', 'POSTED', 'CANCELLED')` — `EXPECTED` first, per the agreed DDL in kata `zetq`. Service-side posting-status strings are lowercase (`"expected"`), mirroring existing `internal/services/transactions/transactions.go:18-28`.
- All DDL comments must be evergreen field documentation (describe fields as they are; no plan/rationale references).
- **Exclusion semantics (decided; do not redesign):**
  - Transaction list (`internal/store/transactions.go` `List`/`transactionListPredicate`): by default exclude transactions whose active (non-tombstoned) records are EXPECTED. When the request's `posting_status` filter explicitly includes `expected`, such transactions are included; a `posting_status` filter that does not include `expected` keeps them excluded.
  - Record search and account register listing (`SearchRecords`): same rule at record level — EXPECTED records are returned only when the explicit `posting_status` filter includes `expected`.
  - Account balances (`internal/store/accounts.go` `ListBalances`), register running balances (window sum in `SearchRecords`), and month totals/reports (`MonthTotals`): unconditionally exclude EXPECTED records, exactly like CANCELLED is excluded there today. There is no query parameter that re-includes them in aggregates.
- **All-or-nothing invariant:** a transaction's active records are either all EXPECTED or none. Enforce in service validation for create/replace, mirroring the existing mixed-cancellation invariant, and add the matching db-validation invariant check next to the mixed-cancellation one (`internal/store/db_validation.go:367-371`).
- Bulk status updates (`BulkUpdateStatuses`): `expected` is NOT a valid target status — the target allowlist stays `pending`/`posted`/`cancelled`. Transitions of currently-EXPECTED records via bulk/replace/cancel are deliberately not guarded in this task; occurrence-lifecycle guards land with `zetq`.
- `transaction.recurring_occurrence_id`: nullable `INTEGER`, no uniqueness or other index. Column comment: occurrence this transaction was generated from; NULL for non-recurring transactions; the definition is reached via the occurrence. In the API it is a response-only nullable field on the Transaction schema — create/replace requests do not accept it (recurring services set it in `zetq`). Because the column is FK-shaped and the `recurring_occurrence` table does not exist yet, add it to `validationReferenceWaivers()` (`internal/store/db_validation.go:843-849`) with an evergreen comment; `zetq` moves it into `validationReferences`.
- OpenAPI: `PostingStatus` schema enum (`api/openapi.yaml:3684-3689`) gains `expected`; the Transaction response schema gains nullable `recurring_occurrence_id`. Regenerate with `just openapi` and `just frontend-openapi`; never hand-edit generated files (`docs/generated-files.md`).
- Frontend scope is strictly "keep it compiling and honest": after client regeneration, update exhaustive `PostingStatus`-keyed surfaces (`frontend/src/features/ledger/format.ts` `postingStatusLabels`, status icon switch in `frontend/src/features/ledger/line-icons.tsx`, any other exhaustive switches the typechecker flags). Do NOT add `expected` to the filter-bar allowlist (`frontend/src/models/transaction-filters.ts`) and do NOT build any review-queue UI — that is future work.
- Do not seed EXPECTED records into demo scenario data.
- Keep package boundaries per `docs/architecture.md`; services own validation, store owns SQL. If package docs of touched packages document contracts this changes, update them in the same commit.

## Tasks

### Task/Commit 1: Evergreen schema edits and data-model doc

Add `EXPECTED` to the `posting_status` enum and `recurring_occurrence_id` to `"transaction"` by editing the original migrations in place, keeping db-validation and the data-model doc aligned. After this commit the schema is final for this task; behavior is unchanged.

- [x] Edit `internal/store/migrations/00001_create_schema_primitives.sql`: `posting_status` enum becomes `('EXPECTED', 'PENDING', 'POSTED', 'CANCELLED')`
- [x] Edit `internal/store/migrations/00008_create_transaction_and_journal_record.sql`: add `recurring_occurrence_id INTEGER` to `"transaction"` with an evergreen column comment (no index)
- [x] Update `PinnedMigrationContentHash` in `internal/store/db_validation.go`
- [x] Add `transaction.recurring_occurrence_id` to `validationReferenceWaivers()` with an evergreen comment (target table lands with recurring operations)
- [x] Update `docs/data-model.md`: enum values and the `"transaction"` table DDL + column comment, matching the migrations exactly
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in the kata issue `nszw`
  - [x] Commit changes

### Task/Commit 2: `expected` posting status through service, API, and generated clients

Make `expected` a first-class posting status value at the API boundary with the all-or-nothing invariant, without any default-visibility changes yet. After this commit, clients can create and read fully-EXPECTED transactions.

- [x] Add `PostingStatusExpected` (`"expected"`) to `internal/services/transactions` and accept it in `validatePostingStatus`
- [x] Enforce the all-or-nothing invariant for EXPECTED on create/replace in service validation, mirroring the mixed-cancellation invariant (stable machine-readable error)
- [x] Keep `expected` out of the `BulkUpdateStatuses` target allowlist (explicitly rejected like any other unknown target)
- [x] Add the EXPECTED all-or-nothing invariant to db-validation invariant checks, next to the mixed-cancellation check
- [x] `api/openapi.yaml`: add `expected` to the `PostingStatus` enum; regenerate (`just openapi`, `just frontend-openapi`); wire any httpapi mapping the compiler requires
- [x] Frontend: update exhaustive `PostingStatus`-keyed surfaces (labels, status icons) so typecheck passes; no filter-allowlist or UI feature changes
- [x] App-tests: create transaction with all-EXPECTED records succeeds and round-trips `expected` on read; mixed EXPECTED/non-EXPECTED create and replace are rejected; bulk update targeting `expected` is rejected
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in the kata issue `nszw`
  - [x] Commit changes

### Task/Commit 3: Default EXPECTED exclusion across views, searches, registers, balances, reports

Apply the decided exclusion semantics so EXPECTED records never leak into default reading surfaces. After this commit, EXPECTED transactions are visible only via explicit `posting_status` filters, and never in aggregates.

- [x] Transaction `List`: default-exclude transactions whose active records are EXPECTED; include them only when the `posting_status` filter explicitly contains `expected`
- [x] `SearchRecords` (record search + account register): default-exclude EXPECTED records with the same explicit-filter opt-in
- [x] `ListBalances` (balance and posted-balance), `SearchRecords` running-balance window sum, and `MonthTotals`: unconditionally exclude EXPECTED alongside CANCELLED
- [x] App-tests: an all-EXPECTED transaction is absent from default list/search/register; present with `posting_status=expected` filters; contributes nothing to account balances, register running balances, or month totals; a confirmed-shape (posted) transaction alongside proves aggregates count non-EXPECTED records unchanged
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in the kata issue `nszw`
  - [x] Commit changes

### Task/Commit 4: `recurring_occurrence_id` read plumbing and state doc

Expose the back-pointer on transaction reads end-to-end. After this commit the recurring operations task (`zetq`) only adds new tables/services — no further changes to existing surfaces.

- [x] Store: include `recurring_occurrence_id` in every `"transaction"` SELECT + scan path (`Get`, `List`, `Cancel`, any others the compiler/tests reveal); inserts leave it NULL (no create input)
- [x] Domain: add the nullable field to the `transactions.Transaction` struct
- [x] `api/openapi.yaml`: add nullable `recurring_occurrence_id` to the Transaction response schema; regenerate (`just openapi`, `just frontend-openapi`); map it in `internal/httpapi` transaction DTO mapping
- [x] App-tests: transaction read (get/list) exposes `recurring_occurrence_id` as null for ordinary transactions
- [x] Update `PROJECT_STATE.md`: one line — schema prepared for recurring transactions (EXPECTED posting status with default exclusion; transaction back-pointer column)
- [x] Update package docs of touched packages only where documented implicit contracts changed
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in the kata issue `nszw`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes (generated frontend client / embedded asset changes)
- [x] Commit final changes
- [x] Run `just review-loop "nszw recurring schema prep: posting_status gains EXPECTED (enum edited in place, evergreen DDL, pinned migration hash updated, no new migrations); transaction.recurring_occurrence_id nullable back-pointer, response-only, no index, db-validation waiver; default lists/searches/registers exclude EXPECTED unless posting_status filter explicitly includes expected; balances/running balances/month totals exclude EXPECTED unconditionally; all-or-nothing EXPECTED invariant on create/replace; expected not a bulk target; no recurring tables/services/APIs; frontend only kept compiling (labels/icons), no filter-bar or UI features"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close kata issue `nszw` with evidence (commit SHA, suites run)
