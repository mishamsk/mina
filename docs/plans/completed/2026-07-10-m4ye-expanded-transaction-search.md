# Plan: Expand transaction free-text search across reference metadata (`m4ye`)

Extend `GET /api/transactions?search=` beyond active-record memos and counterparty account names so an everything-style search also matches reference metadata: categories, tags, members, account FQNs, currency codes, and account external identifiers. Preserve active/tombstoned rules, pagination, and deterministic ordering. Backend/API only — no frontend changes.

## Plan Context

- Ground truth: `api/openapi.yaml:1919` (current `search` description: case-insensitive contains over active journal-record memos and counterparty account names); `docs/architecture.md`; `docs/business-requirements.md`; `internal/services/transactions/PACKAGE.md`. The current implementation lives in `internal/store/transactions.go:482-532` (EXISTS over active records; LIKE with escaping; counterparty side derived from intent/account-type matrix).
- Defined expanded field set and matching semantics (operator decision — implement exactly this):
  1. Record memo — unchanged (case-insensitive contains).
  2. Counterparty account name — unchanged (existing derived-counterparty rule).
  3. Account FQN — case-insensitive contains over the full FQN of ANY active record's account (both sides; supersedes name-only matching without removing rule 2's semantics — a plain FQN-contains branch is added alongside).
  4. Category — case-insensitive contains over the FQN of any active record's category.
  5. Tag — case-insensitive contains over the FQN of any tag attached to any active record.
  6. Member — case-insensitive contains over the name of any active record's member.
  7. Currency — exact case-insensitive ISO code equality of any active journal record's currency (equality, not contains, to avoid noise from 2-letter fragments).
  8. Account external identifier — case-insensitive contains over `external_id` of any active record's account (household-local data; not security-sensitive). `external_system` is intentionally EXCLUDED (system labels like "plaid" would match broad swaths and add noise) — document this in the OpenAPI description.
- Transaction-level semantics unchanged: a transaction matches when ANY of its non-tombstoned records (or their references per the field list) matches; tombstoned records never contribute; hidden accounts/categories/tags/members participate exactly as they do today (hidden is a display flag, not an API exclusion); tombstoned reference entities cannot be referenced by active records, so no new leak paths.
- Pagination and deterministic ordering: no changes to ORDER BY/limit/offset behavior; the expansion must not introduce duplicate transactions (EXISTS semantics, not JOIN fan-out).
- Performance sanity: keep the single EXISTS shape with OR branches (or additional EXISTS per reference where cleaner); no schema/migration changes (excluded from fleet scope).
- Out of scope: frontend changes (the transactions-page search placeholder and command palette are Kata `d608`); new endpoints; schema changes.
- Follow `docs/TESTING.md`: service/store behavior belongs in Go tests at the service boundary; REST behavior in integration tests.
- Kata issue: `m4ye`.

## Tasks

### Task/Commit 1: Store/service search expansion with Go coverage

- [x] Extend the search predicate in `internal/store/transactions.go` to the defined field set with the defined semantics (contains vs equality per field), preserving LIKE escaping, active-record scoping, EXISTS non-duplication, and the existing memo/counterparty branches.
- [x] Add service-level Go tests covering each new field: match via category FQN, tag FQN, member name, account FQN (either side), currency exact-code, account external_id; non-matches: `external_system` value, tombstoned record's references, fragments that only match with case differences (should match, case-insensitive), LIKE metacharacters escaped; pagination/ordering determinism with multiple matches.
- [x] Update `internal/services/transactions/PACKAGE.md` if search semantics are documented there.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata `m4ye`
  - [x] Commit changes

### Task/Commit 2: OpenAPI contract and integration coverage

- [x] Update the `search` parameter description in `api/openapi.yaml` to enumerate the searchable fields and semantics, including the documented exclusion of `external_system`; regenerate clients if the repo flow requires it (description-only changes may not).
- [x] Add integration coverage (`just test-integration` scope) exercising the REST endpoint for at least: a tag match, a member match, a currency match, and an external_id match, plus a miss on `external_system`.
- [x] Update `PROJECT_STATE.md` with a one-line note that transaction search spans reference metadata.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata `m4ye`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Expand GET /api/transactions?search across category/tag/member FQNs, account FQN, currency code equality, and account external_id; external_system excluded by design; active/tombstoned rules, pagination, deterministic ordering, and EXISTS non-duplication preserved"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `m4ye` only after the plan is moved to completed
