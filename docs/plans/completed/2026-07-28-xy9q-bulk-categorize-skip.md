# Plan: Accurate bulk-edit skip prediction, causes, and counts (Kata `xy9q`, rescoped)

Bulk category/tags/member edits predict exactly which selected transactions will be skipped before applying, report the true skip cause afterwards, and count as "updated" only transactions that actually changed — matching the bulk-operations skip philosophy in `docs/webui-design.md`.

## Plan Context

- Kata issue: `xy9q` (P2, frontend), RESCOPED 2026-07-26 after the accounting-semantics reverification: the original whole-batch-400 repro is no longer reachable from the UI — client-side pre-skip (`isUniformBulkField`) and "N updated, M skipped" reporting already exist in `frontend/src/features/ledger/use-transaction-browser-page.ts` (`updateTransactionsBulkReferences`). The first task must re-reproduce against current behavior and record what is already satisfied so the issue closes with accurate evidence.
- Surviving defects (operator-verified at file:line, 2026-07-28):
  1. **Predicate divergence.** The pre-apply warning count (`mixedCountByAction`, `frontend/src/features/ledger/transaction-browser.tsx:756-776`) uses the display predicates (`lineCategory`/`lineTags`/`lineMember === "mixed"`), while apply skips via `isUniformBulkField` (`use-transaction-browser-page.ts:82-110`). Divergent cases: member edits over partially-attributed records (`[memberA, null]` displays uniform but fails `isUniformBulkField`), all-cancelled transactions (no active records → apply-skip, no warning), and category over transactions with no categorized record. Users see no warning, then get skipped.
  2. **Hardcoded cause.** The result toast always says "skipped: mixed records" (`use-transaction-browser-page.ts:785-792`) even when the cause is partial attribution, no active records, or no categorizable records.
  3. **Phantom "updated" counts.** The category path counts every qualifying transaction as updated even when it contributed zero applied records (its flow records filtered out by the `flowAccountIds` lookup filter, `use-transaction-browser-page.ts:662-699`).
- Decided outcome (implement; mechanics are the implementor's):
  - One shared per-transaction skip predicate (per field) that returns skip decision **and reason**; both the pre-apply warning and the apply path consume it, so prediction always equals behavior. Reasons (wording indicative): mixed records; no active records; partially attributed members; no categorizable records.
  - The pre-apply warning states the true predicted skip count (all reasons), e.g. "N of M selected will be skipped", with the reason(s) available compactly (single reason inline; multiple reasons summarized).
  - The toast reports true counts and causes, keeping the `docs/webui-design.md` format family ("12 updated, 2 skipped: mixed records") but with accurate cause text; all-skipped keeps warning treatment. "Updated" counts only transactions whose records were actually part of an applied mutation.
  - `docs/webui-design.md`'s bulk-operations bullet keeps its rule; touch its example wording only if the implemented cause text genuinely diverges (minimal edit; operator reviews).
- Preserve: uniformity-rule semantics themselves (`isUniformBulkField` outcomes for the already-correct cases), selection retention after successful apply, chained edits, bulk save boundaries (record bulk endpoints / atomic replacement), snapshot refresh behavior, and all current e2e.
- Ground truth: `docs/webui-design.md` (Bulk operations), `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Re-reproduce, unify the skip predicate, fix causes and counts

- [x] Re-reproduce with `just dev --demo` + REST fixtures: (a) member bulk over `[memberA, null]` attribution — currently no pre-warning yet skipped; (b) all-cancelled transaction in selection — same; (c) the original transfer-in-selection categorize case — record that it is already pre-skipped (no batch 400). Record findings in the commit message.
- [x] Implement the shared reasoned predicate consumed by both warning and apply; fix the toast causes and the updated-count accounting; update the pre-apply warning wording.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` if the bulk contract wording changes; minimal `docs/webui-design.md` example touch only if needed.
- [x] Commit the task as `fix(frontend): unify bulk-edit skip prediction with true causes and counts`.

### Task 2: End-to-end coverage

- [x] e2e coverage: (a) selection including a partially-attributed-member transaction shows the pre-warning and the accurate toast on member apply; (b) selection with an all-cancelled transaction warns and reports its reason; (c) mixed-category selection keeps today's behavior with matching warning and toast; (d) updated count excludes a transaction contributing zero applied records (construct via fixtures); (e) chained selection retention still works. Follow `docs/TESTING.md`.
- [x] Commit the task as `test(frontend-e2e): pin bulk-edit skip prediction, causes, and counts`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-28-xy9q-bulk-categorize-skip.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `xy9q` with `kata close xy9q --done --message "<summary: what was already satisfied post-refactor + what this branch fixed>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
