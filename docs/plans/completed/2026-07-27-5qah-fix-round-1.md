# Plan: 5qah fix round 1 — backward-transition timestamp clearing, lifecycle rule docs, dateless e2e scenario

Operator-review follow-up to `docs/plans/completed/2026-07-27-5qah-no-pending-direct-post.md`. Core semantics verified live and by audit; this closes the audited should-fix findings. Implementation only.

## Plan Context

- Do not run review-loop.
- Findings (operator audit 2026-07-27, file:line verified):
  1. **Posted→pending revert leaves `posted_date` populated.** `internal/store/transactions.go:1092-1095` only ever adds timestamps (COALESCE), so bulk-reverting a posted record to `pending` keeps its `posted_date`, contradicting the contract text this branch wrote (`api/openapi.yaml` read model: posted_date "null until the record reaches the posted stage") and leaking a Posted timestamp into the pending record's detail disclosure (violates `docs/webui-design.md` "explicit dash when unreached"). Decision: behavior follows the written contract — a bulk transition that moves a record backward clears the forward stamp (posted→pending clears `posted_date`; pending stays as the record's genuine pending history). Re-posting later stamps a fresh posted time. Update the retention test at `internal/apptest/runtime/record_bulk_test.go:377-381` which currently locks in the old high-water-mark behavior, and update the bulk endpoint description in `api/openapi.yaml` (~line 2879) to state both directions. Regenerate surfaces if descriptions change.
  2. **Lifecycle-stamping rules are split across layers and under-documented.** Create/replace defaulting lives in the service (documented), but bulk-transition stamping lives in store SQL (`internal/store/transactions.go:1088-1096`) and recurring-confirm stamping in `internal/store/recurring.go` — the only written statement is one OpenAPI description. Add the transition-stamping rule (including the new backward-clearing behavior) to `internal/services/transactions/PACKAGE.md`, and one sentence for the two deliberate recurring-confirm semantics (`internal/store/recurring.go:376` materialize-as-of initiated date vs `:537` confirm-now wall clock) in the owning package doc (`internal/services/recurring/PACKAGE.md` or where that contract lives).
  3. **The "missing posted date" e2e scenario became vacuous.** `frontend/tests/e2e/transactions-page.spec.ts:6382-6391` (`expectMissingPostedDateSurface`, `datelessRecord`): bulk posting now always stamps `posted_date`, so a posted record with no posted timestamp is unreachable via the API for non-cancelled records; the assertion was renumbered instead of the fixture rebuilt, leaving the `hasMissingDay`/"date unavailable" UI branch (`transaction-detail-panel.tsx:183-194`) untested and helper names misleading. Either rebuild the genuinely reachable dateless state (a `cancelled` record can still lack timestamps) to exercise that branch, or if the branch is now truly unreachable, remove the dead branch and rename/refit the test — pick based on reachability, not convenience.
  4. Small consistency nits to fold in: `api/openapi.yaml` `initiated_date` record description "Human-facing date of the containing transaction" diverges from the standard "Human-facing transaction date" phrasing (align it; regenerate); e2e fixtures that now omit the required `initiated_date` field on mocked `JournalRecord` objects (`frontend/tests/e2e/reference-drilldowns.spec.ts:513-533`, `:706-726`; `frontend/tests/e2e/accounts-page.spec.ts:33-42` fixture type) should match the schema.
- Protect — do not regress:
  - All verified 5qah semantics: direct post → `pending_date` null + populated `posted_date`; created-pending → stamped pending, no posted; pending→posted transition retains pending and stamps posted at the actual instant; expected records carry neither; explicit caller timestamps preserved on create/replace; filters exclude null rows.
  - The pinned migration hash mechanism (recompute if any migration byte changes — it should not in this plan).
  - Frontend preservation-only handling of lifecycle timestamps (no client-side derivation) and the null-pending dash rendering.
  - Cancel semantics: unchanged, still preserves record dates.
  - All suites green: `just pre-commit`, `just test`, `just test-integration`, `just test-frontend-e2e`.
- Scope exclusions: no display/timezone work (owned by `e222`); no relocation of transition SQL out of the store (documenting the split is enough); no changes to created_at/updated_at clock handling.

## Tasks

### Task 1: Backward transitions clear forward lifecycle stamps

- [x] Implement finding 1 (store SQL + contract description + adjusted/added app-test coverage for posted→pending→posted cycles and the pending record's disclosure showing no posted value).
- [x] Commit as `fix(records): clear posted timestamps when bulk transitions revert to pending`.

### Task 2: Document the lifecycle-stamping rules where services own them

- [x] Implement finding 2 (package-doc statements for bulk-transition stamping and the two recurring-confirm semantics).
- [x] Commit as `docs(transactions): state lifecycle transition stamping rules`.

### Task 3: Dateless-record e2e scenario and fixture consistency

- [x] Implement findings 3 and 4.
- [x] Commit as `test(frontend-e2e): rebuild dateless record scenario and align fixtures`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
