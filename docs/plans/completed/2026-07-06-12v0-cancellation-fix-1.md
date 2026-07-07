# Plan: Cancellation Semantics Doc Gaps Fix 1 (Kata 12v0 follow-up)

Close two documentation gaps found in review of the cancelled-transaction-semantics implementation (range 2eaec97..cce7f6e). Documentation only — no behavior changes.

## Plan Context

- Do not run review-loop.
- Kata 12v0 is already closed; do not reopen or comment on it.
- Review findings (architecture audit, 2026-07-06):
  1. `internal/services/transactions/PACKAGE.md` "Implicit Contracts" was not updated for the new transaction-level cancellation invariant (all records cancelled or none, enforced on create, full replace, and bulk posting-status updates — the bulk endpoint now returns invalid-request where it previously accepted mixed results) and the new `Cancel` use case (sets all active records to cancelled, idempotent, preserves dates and reconciliation status, not-found for missing/tombstoned).
  2. The `bulkUpdateJournalRecordStatuses` operation description in `api/openapi.yaml` does not mention that posting-status updates producing a mixed cancelled/non-cancelled transaction are rejected.
- Protect — do not regress (verified live and by audit; no code changes are in scope):
  - Create/replace mixed-cancellation rejection and fully-cancelled create acceptance.
  - Bulk status guard (whole-request atomic rejection; whole-transaction cancel/uncancel allowed).
  - `POST /api/transactions/{transaction_id}/cancel` behavior (atomic, idempotent, 404 semantics).
  - DB validation mixed-cancellation finding; unchanged balance SQL.
  - `docs/accounting-semantics.md` cancellation paragraph — leave as is.

## Tasks

### Task/Commit 1: Update package doc and OpenAPI operation description

Bring the implicit-contract documentation in line with the shipped behavior.

- [x] Update `internal/services/transactions/PACKAGE.md` Implicit Contracts with the cancellation invariant (create/replace/bulk enforcement, including the bulk endpoint's rejection of mixed outcomes) and the `Cancel` use-case semantics (all active records, idempotent, preserves dates/reconciliation, not-found for missing/tombstoned).
- [x] Extend the `bulkUpdateJournalRecordStatuses` summary/description in `api/openapi.yaml` to state that updates leaving any transaction with a mix of cancelled and non-cancelled active records are rejected. Description text only — no schema, path, or response changes.
- [x] Regenerate OpenAPI-derived code via the owning `just` recipes and commit any resulting generated-file diffs.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (generated REST contract files touched)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] Move this plan to `docs/plans/completed/`
