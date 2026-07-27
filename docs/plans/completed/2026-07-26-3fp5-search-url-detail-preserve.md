# Plan: Preserve transaction detail and split editor while debounced search syncs URL (Kata `3fp5`)

Typing in the Transactions search box and then opening the transaction detail panel or the entry/split editor within the debounce window must never close that surface or lose its URL state: the delayed search URL sync preserves the active `transaction=` and `entry=` parameters, and unsaved editor input stays intact.

## Plan Context

- Kata issue: `3fp5` — "Preserve transaction detail and split editor while debounced search syncs URL" (P1, bug, frontend).
- Problem: `TransactionSearchInput` (`frontend/src/features/ledger/transaction-search-input.tsx`) debounces input by 300ms and then calls `onSearchChange` → `setSearchFilter` in `frontend/src/pages/transactions-page.tsx`, which rewrites the query string via `writeTransactionFiltersToSearchParams`. If the user opens the transaction detail panel (`transaction=` param, `use-transaction-detail.ts`) or the entry modal / split editor (`entry=` param, owned by `frontend/src/features/app-shell/app-shell.tsx`) before the delayed update fires, the late write can drop those params. Dropping `entry=` makes the app-shell effect call `closeTransactionEntryPanel()` — silently closing the editor and discarding unsaved edits; dropping `transaction=` closes the detail panel.
- Root-cause note: `writeTransactionFiltersToSearchParams` (`frontend/src/features/ledger/transaction-page-position.ts`) copies the incoming params and deletes only filter-owned names, so non-filter params survive **when the base params are current**. The defect is therefore in what "current" means at fire time — the debounced call path operates on stale search params relative to the live URL (react-router 8 `setSearchParams` functional updater + the debounce timer's captured closures). Root-cause the staleness precisely and fix it at the write boundary; do not paper over it by suppressing the close behavior in the app shell or the detail hook.
- The fix must preserve existing intended semantics:
  - A search change still resets `page` to 1 (`resetPage` behavior).
  - The entry modal URL choreography in `app-shell.tsx` (open/close/replace, history back-close, `entryDetailParamRef` restore of `transaction=`) must not regress.
  - Filter/class/hide-expected writes from the same page share the write path; keep them consistent — any of them fired late must also not drop `transaction=`/`entry=`.
- Ground truth: `docs/frontend-architecture.md` (URL owns shareable table query state), `docs/webui-design.md` (Transactions screen; detail panel is URL-addressable; `?entry=` deep-link composition with the detail param). Read `docs/TESTING.md` before writing or modifying tests.
- Validation surface: frontend runtime behavior → `just pre-commit` and `just test-frontend-e2e`. Existing Playwright specs live in `frontend/tests/e2e/` (see `transactions-page.spec.ts`).

## Tasks

### Task 1: Root-cause and fix the late search sync dropping `transaction=`/`entry=`

End state: a debounced search URL sync that fires after the detail panel or entry/split editor opened preserves those params; the surfaces stay open with unsaved edits intact; searching still resets to page 1 and updates `q=`.

- [x] Reproduce the bug against the live app (e.g. `just dev --demo` or a Playwright repro): type in `#transactions-search`, immediately open a transaction detail, and observe the detail param dropped when the debounce fires; repeat with the split editor (`entry=split:<id>`). Record the precise staleness mechanism in the commit message.
- [x] Fix the search (and shared filter) URL write path so a delayed write merges over the live URL state instead of a stale snapshot, preserving `transaction=` and `entry=` while still owning all filter params and the page reset.
- [x] Manually verify: search → open detail within the debounce window → detail stays open and URL carries both `q=` and `transaction=`; search → open split editor with an edit typed → editor stays open, edits intact; plain search with nothing open still works and resets the page.
- [x] Commit the task as `fix(frontend): preserve detail and entry params during debounced search URL sync`.

### Task 2: End-to-end regression coverage

End state: Playwright coverage pins the behavior so a future URL-sync change cannot silently reintroduce the race.

- [x] Add e2e coverage in `frontend/tests/e2e/` (extend `transactions-page.spec.ts` or a focused spec) for: (a) type in search then immediately open transaction detail — the panel stays open after the debounce window and the URL contains both `q=` and `transaction=`; (b) type in search then immediately open the split (or edit) entry editor and enter a modification — after the debounce window the modal is still open and the modification is still present. Follow `docs/TESTING.md`.
- [x] `just test-frontend-e2e` passes with the new tests included.
- [x] Commit the task as `test(frontend-e2e): cover search debounce racing detail and entry surfaces`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-26-3fp5-search-url-detail-preserve.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `3fp5` with the commits and validation evidence: `kata close 3fp5 --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
