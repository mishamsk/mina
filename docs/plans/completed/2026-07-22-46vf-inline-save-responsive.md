# Plan: Keep the transaction table responsive after inline saves — Kata `46vf`

A successful inline save updates the affected transaction row in place — no table blanking, remounting, skeleton flash, or blocking — while scroll, focus, selection, and expanded state stay stable. Kata issue: `46vf`.

## Plan Context

- Kata `46vf` acceptance (ground truth for this plan):
  - A successful inline save updates the affected row immediately without blanking, remounting, or blocking the whole table.
  - Current scroll position, focus, selection, expanded state, and visible rows remain stable across the save.
  - Preferred: refetch the affected snapshot in the background and replace it atomically only after complete data is ready. Fallback if that is disproportionately complex: keep the locally updated row until the next normal refresh, even when a non-date filter would otherwise remove it.
  - Date is not inline editable, so no date-driven pagination relocation is required.
  - A failed save restores or preserves the draft and surfaces the API error without reloading the table.
  - E2E coverage asserts the absence of full-table loading/flicker after category, tag, member, and amount saves.
- Owning rules: `docs/webui-design.md` — "previous data stays visible while refetching; loading causes no layout shift"; skeletons are for first load only. `docs/frontend-architecture.md` — refetch-after-mutation with explicit refresh rules; page snapshots keyed by normalized request params. Do not edit these docs.
- Affected code: `frontend/src/features/ledger` (shared browser, `use-transactions-resource.ts`, `use-transaction-browser-page.ts`) and its refresh fan-out. The single-active-editor and explicit-commit model from Kata `wkpr` (see `frontend/src/features/ledger/PACKAGE.md`) must not regress.
- The fix must cover both current `useTransactionBrowserPage` embeddings (Transactions and reference drill-down pages) and both transaction-row and expanded-record inline editors.
- The wider refresh fan-out (balance strip, overview, reference pages) must keep refreshing; only the browsing table's own reload behavior changes.
- Update `frontend/src/features/ledger/PACKAGE.md` implicit contracts if the refresh semantics change in the same commit.

## Tasks

### Task 1: In-place row update on successful inline saves

End state: after any transaction-level or expanded-record inline save, the table keeps its current rows visible and updates the affected transaction in place; the page snapshot is replaced atomically only when refetched data is ready.

- [x] Successful category, tags, member, and amount inline saves update the affected row without a table-level loading state, remount, or row blanking in any embedding; scroll position, keyboard focus, bulk selection, and expanded records stay as they were.
- [x] The affected-page refetch happens in the background and swaps in atomically; if that approach proves disproportionately complex, the locally updated row persists until the next normal refresh (document the chosen approach in `PACKAGE.md`).
- [x] The non-table refresh fan-out (balances, overview, reference snapshots) is unchanged.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` implicit contracts for the new save-refresh semantics.
- [x] Commit the task as `Update transaction rows in place after inline saves`.

### Task 2: Failure path preserves the table and the draft

End state: a failed inline save leaves the table untouched and the editor draft intact with the API error surfaced.

- [x] On API failure the table does not reload or blank; the editor stays open with the draft and shows the error per the standard feedback rules.
- [x] Commit the task as `Preserve table and draft on failed inline saves` (fold into Task 1's commit if the implementation is inseparable).

### Task 3: End-to-end coverage for save responsiveness

End state: e2e tests assert user-observable stability of the table across inline saves.

- [x] E2E coverage asserts, for category, tag, member, and amount saves: no table-level skeleton/loading state appears, previously visible rows never disappear during the save, and scroll/expanded state survives.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover inline-save table stability with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Inline transaction saves update rows in place: no table blanking/remount/skeleton after category/tag/member/amount saves; scroll/focus/selection/expanded state stable; failure keeps draft and table; wkpr single-editor explicit-commit model unchanged."`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `46vf` with the commits and validation evidence: `kata close 46vf --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
