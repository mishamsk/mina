# Plan: Database Validation Command

Add `mina db validate`: an offline integrity checker for accounting database files that were created or modified outside Mina. Reference integrity is service-enforced only (no DB foreign keys), and `store.Migrate` trusts `schema_version` without inspecting domain tables, so a hand-crafted or hand-edited database silently passes startup today and fails lazily at query time. The command validates in four gated layers: schema conformance, referential integrity, SQL-backed invariants, and per-transaction classification. A configurable subset (shallow = schema only) runs at `serve`/`migrate` startup.

## Plan Context

Design decisions (agreed with Misha, 2026-07-05):

- Anti-drift is the primary design constraint. Mechanisms, in order of layer:
  - Schema layer: compare the target schema against a pristine reference built by running the embedded goose migrations into a scratch in-memory DuckDB schema, then diffing introspected catalogs (`duckdb_tables()`, `duckdb_columns()`, `duckdb_types()`, `duckdb_indexes()`, `duckdb_sequences()`). The reference derives from the same embedded SQL the app migrates with, so it cannot drift.
  - Pin: a sha256 content hash of the embedded migration SQL (`internal/store` `//go:embed migrations/*.sql` only — do not hash the frontend embeds). The pinned constant lives in `internal/store`, beside the embedded migrations and the reference registry it guards (depguard forbids service→store imports, so the check is threaded through the repository interface; store owns pin + actual, the service invokes verification and maps mismatch to the exit-2 abort). Hash mismatch is a hard "validator out of date; review checks, then re-pin" failure that prints the new hash. Catches retroactive edits to earlier migrations, which goose cannot see (its version table stores no checksums).
  - Referential layer: a declarative registry of logical references drives generated anti-join SQL. A runtime completeness self-check introspects the pristine catalog and hard-fails if any FK-shaped column (non-PK `INTEGER *_id`, `INTEGER[] *_ids`, non-self `TEXT *_fqn`) is neither registered nor explicitly waived. This cannot be rubber-stamped the way the hash pin can.
  - Semantic layer: classification rules are consumed from the `transactions` package itself (export a pure validation entry point over the persisted `Transaction` form), so rule drift is impossible by construction. Balance checking is deliberately SQL (well-known, not Mina-specific); Kata `12v0` (cancelled-record semantics) already carries a scope note to realign the SQL balance check when semantics change.
- Layer gating: schema → referential → SQL invariants → classification. Each layer runs only if the previous passed. Rationale: store reads INNER JOIN records to account/category, so a dangling reference silently drops the record and would produce misleading semantic findings; the classification pass is also the most expensive.
- Classification pass reads raw transactions through `transactions.Repository.List` batches (service `List` cannot be used: it aborts the whole page on the first classification error, `internal/services/transactions/transactions.go:509-515`).
- Severity policy (single source in `dbvalidation`; guiding principle: error = hard failures or incorrect results, warning = degraded-but-correct behavior, info = non-consequential):
  - **error**
    - schema: missing table; missing column; column type or nullability mismatch; enum type value-set mismatch; missing or mismatched generated-column expression; column default mismatch; missing primary key; missing sequence; extra NOT NULL column without a default on a Mina table (breaks inserts)
    - schema: `schema_version` claims a version above the latest embedded migration ("database is newer than this binary")
    - referential: active `journal_record` referencing a missing or tombstoned `transaction`, `account`, or `category` (INNER JOIN reads silently drop the record — missing transactions, wrong balances); active `transaction_template_record` referencing a missing or tombstoned template or category
    - invariants: per-currency balance ≠ 0 on an active transaction; active transaction with fewer than two active records; `exchange_rate.rate <= 0` (corrupts USD derivation)
    - classification: any intent-shape violation (reads re-classify; `List` aborts, so one bad transaction 500s list pages)
  - **warning**
    - schema: missing index, unique or plain (unique-index absence additionally triggers the data-level uniqueness check below); unexpected extra index
    - referential: dangling `member_id` or `tag_ids` element on an active record (display/filter degradation — implementers must verify member is not INNER JOINed on reads; if it drops records, promote to error); `credit_limit_history.account_id` → missing or tombstoned account; `budget.category_fqn` with no active category
    - invariants: `amount == 0`; `amount_usd == 0` when set; invalid currency code (Misha's dropdown example class); malformed FQN; `tag_ids` duplicate or non-positive elements; `credit_limit < 0`; duplicate active rows on an active-uniqueness key (checked only when the guarding unique index is missing — with the index present, duplicates are impossible)
  - **info**
    - schema: table/column comment drift; extra tables; extra nullable-or-defaulted columns
    - invariants: `external_id`/`external_system` unpaired; memo leading/trailing whitespace
  - Exit codes: any error finding → exit 1; warnings/info only → exit 0; validator-internal failure (hash pin mismatch, registry completeness violation, pristine-reference build failure) → exit 2 with a "validator out of date / internal" report, never a clean pass.
- Documented non-checks (enforced by nothing today; checking them would false-positive): `posted_date`↔`posting_status` consistency; record currency vs account currency; `exchange_rate.from != to`; parent-FQN existence; budget month/sign rules (no budget service exists); `amount_usd` derivation correctness. Budget `category_fqn` reference is warning-tier only.
- No REST API: explicit carve-out. Validation exists for the pre-trust moment before a server runs; a healthy running server already implies a migrated Mina-managed DB.
- Tests: integration (testscript) only, in one dedicated script file `mina_db_validate.txt`. TDD flow, explicitly overriding the "every commit passes all tests" rule: Task 1 commits the test infra plus a stub command with the failing script; later tasks turn layers green until Task 5 completes it. `just test` and `just pre-commit` must still pass at every commit; only `mina_db_validate.txt` is allowed to fail mid-plan.
- Test fixtures: seed a deterministic demo database once (`mina serve --demo` with the freeport + health-check + SIGINT pattern from `mina_rest_api.txt`). The demo schema is never mutated. Per corruption case, inside the same database file: run `mina migrate --db <file> --schema <case>` to create a clean, fully migrated copy schema (faithful DDL — enums, defaults, generated columns, indexes — with zero DDL duplicated into fixtures, immune to future migration drift), then apply the case's fixture SQL via the new testscript helper to copy data from the demo schema (`INSERT INTO <case>.<table> SELECT * FROM <demo>.<table>`) and apply the one targeted break. Validate with the existing accounting-schema override: `mina db validate --db <file> --schema <case>`.
- Startup validation config: `none|shallow|full`, default `shallow`, config file key plus env var following the `internal/appconfig` pattern (e.g. `startup_validation` / `MINA_STARTUP_VALIDATION`). Kata `mcsf` already carries a scope note to measure full-mode performance.
- Boundary placement: `internal/services/dbvalidation` owns orchestration, finding/severity types, the pinned hash constant, and reporting; `internal/store` owns the pristine-reference build, catalog introspection, the reference registry (DB-facing column metadata), generated SQL, and the embed hash, exposed to the service through a repository-style interface; `internal/runtime` wires; `cmd/mina` stays thin.

## Tasks

### Task/Commit 1: Test infrastructure and stub command (expected-fail baseline)

Build everything needed to exercise validation end-to-end before any validation logic exists: fixture corruption scripts, the testscript helper, the `db validate` CLI skeleton, and the full assertion script. The script must fail at this commit — the stub reports every database as valid.

- [x] Add a testscript helper command in `cmd/mina/cli_smoke_test.go` (alongside `duckdbsnapshot`/`duckdbtables`) that executes a SQL file against a DuckDB database file, e.g. `duckdbexec <db-file> <sql-file>`
- [x] Add corruption fixture SQL files under `cmd/mina/testdata/validate/`, one per case; each copies data from the demo schema into the case's pre-migrated schema (`INSERT INTO <case>.<table> SELECT * FROM <demo>.<table>`) and applies exactly one targeted break, never touching the demo schema. At least one case per finding kind and severity:
  - [x] schema: drop a partial unique index (warning + triggers duplicate check); drop a column (error); retype an enum column to TEXT (error); add an unknown table (info)
  - [x] referential: dangling `journal_record.account_id` (error); active `journal_record` under a tombstoned `transaction` (error); tombstoned `category` still referenced by an active record (error); dangling element in `journal_record.tag_ids` (warning); dangling `credit_limit_history.account_id` (warning)
  - [x] invariants: unbalanced per-currency transaction (error); single-record transaction (error); non-positive `exchange_rate.rate` (error); zero `amount` (warning); invalid currency code (warning); malformed FQN (warning); unpaired `external_id` (info)
  - [x] classification: shape violation, e.g. flip a record sign so an EXPENSE component has no positive flow record (error)
- [x] Add `db` command group and stub `mina db validate [--shallow]` in `cmd/mina`: parses flags, opens the DB via runtime honoring the accounting-schema override, prints an OK report, exits 0
- [x] Add testscript file `cmd/mina/testdata/script/mina_db_validate.txt`: seed the demo DB once (`mina serve --demo`, health-check, SIGINT); verify the clean demo schema validates OK with exit 0; then per case: `mina migrate --db <file> --schema <case>` to create the clean copy schema, `duckdbexec` the case fixture, run `mina db validate --db <file> --schema <case>`, assert the exit code and a severity-labeled finding message per the severity policy; order cases schema → referential → invariants → classification so testscript's stop-at-first-failure shows layer-by-layer TDD progress
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration`: all pre-existing scripts pass; `mina_db_validate.txt` fails (expected — document in commit message)
  - [x] Commit changes

### Task/Commit 2: Schema conformance engine and shallow mode

Implement the pristine-reference schema diff and the migration hash pin. After this task, `mina db validate --shallow` works fully and the schema testscript goes green.

- [x] `internal/store`: build the pristine reference — scratch in-memory schema + goose `Up` from embedded migrations (mirror `newMigrationProvider`); expose canonical catalog introspection (tables, columns with types/nullability/defaults/generated expressions, enum types and values, indexes, sequences, table/column comments) usable against both the reference and the target accounting schema
- [x] `internal/store`: pinned sha256 constant for the embedded `migrations/*.sql` content (sorted by filename; nothing else is in that embed), kept beside the migrations; verification of pin vs actual exposed through the repository interface
- [x] `internal/services/dbvalidation`: finding and severity types implementing the exact severity table from Plan Context (single source), repository interface; pin verification failure maps to the exit-2 "validator out of date" abort that prints the new hash and re-pin instructions
- [x] `internal/runtime`: wire the validation service; `cmd/mina db validate` runs shallow mode for real (full mode still stubbed as schema-only pass-through)
- [x] Package docs for `internal/services/dbvalidation` (implicit contracts: hash pin, gating, non-checks list) per `docs/package_doc_template.md`
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration`: pre-existing scripts pass; `mina_db_validate.txt` still fails overall, but its schema-layer cases pass when run to that point (expected — document in commit message)
  - [x] Commit changes

### Task/Commit 3: Referential registry, anti-join checks, completeness self-check

Close tier 1: registry-driven referential validation over active rows, guarded by the runtime completeness self-check.

- [x] `internal/store`: reference registry as data — `journal_record` → `transaction`/`account`/`category`/`member`/`tag_ids`→`tag`; `transaction_template_record` → `transaction_template`/`category`/`account`/`member`/`tag_ids`→`tag`; `credit_limit_history` → `account`; `budget.category_fqn` → `category.fqn` (warning tier); include per-entry nullability and active-parent semantics (hidden parents allowed everywhere)
- [x] Generated anti-join checks over active rows, including active-child-of-tombstoned-parent and array-element (`tag_ids`) forms
- [x] Completeness self-check at validation start: introspect the pristine catalog; every non-PK `INTEGER *_id`, `INTEGER[] *_ids`, and non-self `TEXT *_fqn` column must be registered or on an explicit waiver list (e.g. `external_id` excluded by TEXT type already); violation is a hard "validator out of date" error
- [x] Wire as the second gated layer in `dbvalidation`
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration`: pre-existing scripts pass; `mina_db_validate.txt` still fails at the invariant/classification cases (expected — document in commit message)
  - [x] Commit changes

### Task/Commit 4: SQL invariant and value-domain checks

Close tier 2/3 except classification. All checks are store-side SQL; currency and FQN reuse Go helpers so rules stay single-sourced.

- [x] Per active transaction: at least two active records; per-currency `amount` sum is zero across all posting statuses (matches `validateTransactionInput` today; Kata `12v0` will revisit cancelled semantics and carries the realignment scope note)
- [x] Per active record: `amount != 0`; `amount_usd != 0` when set; `tag_ids` elements positive and unique within the array; `external_id`/`external_system` both set or both null (also on `account`)
- [x] Currency codes: pull distinct currencies via SQL (journal records, accounts, template records, exchange rates), validate with `values.ValidCurrencyCode`
- [x] FQN syntax on `account`/`category`/`tag`/`transaction_template`: validate distinct FQNs with the service-owned FQN rules (extract the shared helper if needed rather than duplicating)
- [x] `exchange_rate.rate > 0`; `credit_limit_history.credit_limit >= 0`
- [x] Active-uniqueness data check (duplicate active rows per key: account/category/tag/template fqn, member name, credit-limit and exchange-rate and budget composite keys), executed only for keys whose guarding unique index the schema layer reported missing; duplicates are warnings
- [x] Do not add the documented non-checks (see Plan Context); keep the list in the package doc
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration`: pre-existing scripts pass; `mina_db_validate.txt` still fails at the classification case only (expected — document in commit message)
  - [x] Commit changes

### Task/Commit 5: Classification pass through the transactions package

The final, most expensive layer: run every active transaction through the same classification rules engine the write path uses. Runs only when every prior layer passed.

- [x] `internal/services/transactions`: export a pure classification validation entry point over the persisted form (wraps the existing `validateTransactionClassification`; no write-path changes, no new dependencies)
- [x] `dbvalidation`: batch active transactions through `transactions.Repository.List` (raw, unclassified; store already joins `AccountType`/`EconomicIntent`), validate each, report findings with transaction IDs; first violation per transaction is sufficient granularity
- [x] Full mode now complete: gate this layer on all prior layers passing
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes fully, including `mina_db_validate.txt`
  - [x] Commit changes

### Task/Commit 6: Startup validation wiring, config, and docs

Make shallow validation the default guard at process startup, configurable to `none` or `full`, and record the deliberate REST carve-out.

- [x] `internal/appconfig`: `startup_validation` setting (`none|shallow|full`, default `shallow`), TOML key + `MINA_STARTUP_VALIDATION` env var, following existing patterns
- [x] `serve` and `migrate` run the configured level after open/migrate; findings at error severity abort startup with the report
- [x] Startup smoke cases appended to `mina_db_validate.txt`: broken schema fails `serve` by default; `MINA_STARTUP_VALIDATION=none` skips; keep to wiring smoke only
- [x] `docs/architecture.md`: one-line explicit carve-out under REST API rules — database validation is a CLI-only diagnostic, deliberately not exposed over REST (edit authorized by Misha in this plan)
- [x] Update `PROJECT_STATE.md`; final pass on `dbvalidation` package doc
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "db validation command: 4 gated layers (schema diff vs pristine migrated reference, registry anti-join referential checks with completeness self-check, SQL invariants, classification via transactions package pure API); migration-content hash pin; startup validation config none/shallow/full default shallow; no REST by design; TDD testscripts under db_validate prefix; balance check deliberately SQL, cancelled semantics deferred to kata 12v0"`
- [x] Move this plan to `docs/plans/completed/`
