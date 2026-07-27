# Plan: Verify and pin transaction detail deep-link restore (Kata `zh4g`)

Loading a transactions URL with `transaction=` and/or `entry=` query parameters must restore the corresponding surface on cold load, making detail and editor URLs shareable and bookmarkable. Operator re-verification on 2026-07-27 (post the `3fp5` stale-params rework merged into the integration branch) found the filed repro no longer occurs: cold loads of `/transactions?transaction=337`, `/transactions?entry=split:337`, and the composed `?transaction=337&entry=edit:337` all restore their surfaces with params retained. The remaining deliverable is deterministic regression coverage that pins cold-load restore, plus accurate issue closure.

## Plan Context

- Kata issue: `zh4g` — "Restore transaction detail from deep-link query parameters" (P2, bug, frontend).
- Current behavior (operator-verified live against `just dev --demo`): the detail panel opens from a cold `transaction=` load (`use-transaction-detail.ts` fetches by id when the row is not in the page snapshot); the app-shell `entry=` effect restores the editor; both params survive load. The historical strip belonged to the stale-functional-updater class fixed by `3fp5` (see `docs/plans/completed/2026-07-26-3fp5-search-url-detail-preserve.md` and `2026-07-27-3fp5-fix-round-1.md`).
- Gap: `frontend/tests/e2e/transactions-page.spec.ts` deep-link coverage exercises only search/page params. Nothing pins cold-load restore of `transaction=`, `entry=`, or their composition, so a regression would land silently.
- First task re-verifies against current code from the e2e harness itself; if any part of the filed bug still reproduces there (e.g. a race visible only under Playwright timing), fixing it becomes in-scope for this plan and the fix must land at the root cause, not by suppressing URL writes cosmetically.
- Ground truth: `docs/webui-design.md` ("Detail pages are URL-addressable"; Screen 3 Deep links: `?entry=` valid on every route, composes with the transaction-detail param; the overlay-preserving shareable-state URL write rule), `docs/frontend-architecture.md`, `docs/TESTING.md` (read before writing tests).
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Cold-load deep-link e2e coverage for the detail panel

End state: e2e coverage proves a cold `page.goto("/transactions?transaction=<id>")` (id not necessarily on the first page snapshot) opens the detail panel for that transaction with the param retained, and closing the panel strips only the `transaction` param.

- [x] Add the coverage in `frontend/tests/e2e/transactions-page.spec.ts` using a REST-created fixture transaction, following `docs/TESTING.md` and the file's existing fixture patterns. Assert the panel shows the fixture's title/records, the URL retains `transaction=` after load settles, and Esc/close strips it while preserving other params.
- [x] If the cold-load restore fails under test, root-cause and fix it (in scope), then make the test pass; otherwise record in the commit message that the behavior was already correct and the test pins it.
- [x] Commit the task as `test(frontend-e2e): pin cold-load transaction detail deep-link restore`.

### Task 2: Cold-load deep-link e2e coverage for the entry editor and composition

End state: e2e coverage proves cold loads of `?entry=edit:<id>` (or `split:<id>`) open the editor, and the composed `?transaction=<id>&entry=edit:<id>` opens the editor over the detail panel; in-app editor close strips `entry=` and restores the detail panel per the app-shell choreography.

- [x] Add the coverage (same spec file or a focused one), asserting editor presence on cold load, param retention, and that closing the editor lands on `?transaction=<id>` with the panel visible.
- [x] Commit the task as `test(frontend-e2e): pin entry editor deep-link cold load and composition`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-27-zh4g-detail-deep-link.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `zh4g` with `kata close zh4g --done --message "<summary: repro no longer occurs post-3fp5 stale-params rework; cold-load restore verified and pinned by new e2e coverage>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
