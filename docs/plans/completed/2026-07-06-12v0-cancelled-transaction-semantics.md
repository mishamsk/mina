# Plan: Cancelled Transaction Semantics (Kata 12v0)

Define and enforce transaction-level cancellation semantics. Today `posting_status` lives on journal records and the balance invariant sums all legs regardless of status, while aggregation queries exclude cancelled legs — so a lone cancelled leg breaks an otherwise-balanced transaction and an unbalanced active set can be "fixed" by a cancelled leg. This plan makes cancellation all-or-nothing per transaction, enforces that invariant at every mutation path, adds a dedicated transaction-level cancel operation, and aligns the DB validation command.

## Plan Context

Design decisions (agreed with Misha, 2026-07-06; recorded on Kata 12v0):

- **Cancellation is transaction-level (all-or-nothing).** Among a transaction's non-tombstoned records, either all have `posting_status = cancelled` or none do. Pending/posted may still mix per leg; only cancelled is atomic. Partial changes to a split are edits/replaces, not leg cancels.
- **Rationale / Plaid grounding:** providers like Plaid do not send a "cancelled" status — a dropped hold appears only as a removal in `/transactions/sync`. Local "cancelled" is a derived, whole-transaction state (removed pending with no matching posted arrival), and since provider matching is best-effort, uncancel must be possible.
- **Balance validation stays status-agnostic.** All non-tombstoned legs must sum to zero per currency, cancelled included. With all-or-nothing cancel, a cancelled transaction was balanced at creation and stays balanced, so neither `validateTransactionInput` nor the DB-validation balance SQL changes its sum logic. Both gain the new mixed-cancellation invariant instead.
- **Min-two-records rule is unchanged.** Creating a fully-cancelled transaction is allowed (import backfill); mixed cancelled/active is rejected with a clear, specific error (not the generic balance error).
- **Transitions: any ↔ any** (including uncancel), but every mutation must leave each affected transaction satisfying the all-or-nothing invariant.
- **API surface: both paths.** A dedicated transaction-level cancel operation flips all active legs to cancelled atomically. `BulkUpdateStatuses` is kept and may still set/unset cancelled, but validates the post-update state per affected transaction and rejects the whole request on violation (no partial application). Uncancel goes through the bulk path (set all legs to pending/posted); prior per-leg statuses are not remembered.
- **Cancel operation semantics:** cancelling an already-fully-cancelled transaction is an idempotent success; missing or tombstoned transaction → not found. Cancel touches only `posting_status`; dates and reconciliation status are untouched.
- **Reporting/aggregation queries need no change** — account balances, month totals, and running balances already exclude cancelled legs.
- **DB validation command** (per scope comment on 12v0): the per-currency zero-balance SQL check is unchanged; add a new invariant finding for transactions mixing cancelled and non-cancelled active records (severity: error).
- Key code anchors: `validateTransactionInput` at `internal/services/transactions/transactions.go:1033-1060`; `BulkUpdateStatuses` service `internal/services/transactions/transactions.go:808-845`, store `internal/store/transactions.go:885-924`; DB validation invariants `internal/store/db_validation.go:229-263`; balance-semantics doc `docs/accounting-semantics.md:75-76`.

## Tasks

### Task/Commit 1: All-or-nothing invariant on create and full replace

Enforce the mixed-cancellation invariant where transactions are created or fully replaced. After this task, a transaction whose records mix cancelled and non-cancelled statuses is rejected with a dedicated error, while fully-cancelled (balanced) transactions are accepted.

- [x] In `internal/services/transactions`, extend transaction input validation: records must be either all `cancelled` or none `cancelled`; violation returns an invalid-request error with a message naming the mixed-cancellation rule (distinct from the balance error). Zero-sum stays status-agnostic and unchanged.
- [x] Ensure the rule applies to both create and full-replace paths.
- [x] Add tests: fully-cancelled balanced transaction accepted (create and replace); mixed cancelled/active rejected with the specific error; existing balance behavior unchanged.
- [x] Update `docs/accounting-semantics.md` with the cancellation semantics (all-or-nothing per transaction; balance includes cancelled legs; aggregates exclude them).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Task/Commit 2: BulkUpdateStatuses invariant guard

Close the mutation hole: bulk posting-status updates must not create mixed-cancellation transactions. After this task, cancel and uncancel via the bulk API work only when they cover each affected transaction's full active record set.

- [x] In the transactions service, when a bulk update changes `posting_status`, validate the post-update state of every affected transaction: no transaction may end with a mix of cancelled and non-cancelled active records. Reject the whole request atomically on violation (clear error identifying the rule; no partial application). Reconciliation-only updates are unaffected.
- [x] Any ↔ any transitions remain allowed when the invariant holds (including uncancel: all legs of a cancelled transaction → pending/posted).
- [x] Add tests at the API boundary: bulk cancel covering a whole transaction succeeds; partial cancel of one leg is rejected; uncancel of a whole transaction succeeds; partial uncancel is rejected; a bulk request spanning multiple transactions where one would end mixed rejects entirely.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (JSON-over-HTTP behavior changed)
  - [x] Update progress in Kata 12v0
  - [x] Commit changes

### Task/Commit 3: Dedicated transaction-level cancel operation

Add the first-class cancel API: one call flips all active legs of a transaction to cancelled atomically. Uncancel intentionally has no dedicated endpoint (bulk path covers it).

- [x] Add the operation to `api/openapi.yaml` (e.g. `POST /api/transactions/{id}/cancel`) returning the updated transaction; regenerate `internal/httpapi` and `internal/httpclient` code via the owning `just` recipe.
- [x] Add a service method that sets `posting_status = cancelled` on all active records of the transaction in one store transaction; idempotent success when already fully cancelled; not-found for missing/tombstoned transactions; dates and reconciliation status untouched.
- [x] Wire the strict-server handler in `internal/httpapi` (thin mapping only; domain behavior in the service).
- [x] Add tests at the API boundary: cancel a pending/posted multi-leg transaction and observe all legs cancelled; repeat cancel is idempotent; cancel of tombstoned/missing id → not found; cancelled transaction excluded from account balances/month totals afterwards.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (new REST endpoint)
  - [x] Update progress in Kata 12v0
  - [x] Commit changes

### Task/Commit 4: DB validation command alignment

Teach `mina db validate` the new invariant so hand-edited databases violating all-or-nothing are flagged. The balance SQL check is deliberately unchanged.

- [x] Add an invariant finding (severity: error) in `internal/store/db_validation.go` for active transactions whose active records mix cancelled and non-cancelled posting statuses.
- [x] Add a corruption fixture case and extend `cmd/mina/testdata/script/mina_db_validate.txt` to assert the new finding, following the existing per-case schema-copy pattern.
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
- [x] Run `just review-loop "Transaction-level cancellation semantics (Kata 12v0): all-or-nothing cancelled invariant on create/replace and BulkUpdateStatuses; status-agnostic zero-sum balance unchanged; new POST /api/transactions/{id}/cancel idempotent endpoint; db validate gains mixed-cancellation error finding; reporting queries intentionally untouched"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata 12v0 with evidence after the plan is moved to completed
