# Plan: Default time-based UI tables to newest first (Kata `2qf5`)

Every table that lists time-based activity defaults to reverse chronological order (newest first) — most importantly the account/group register — with running balance still correct, user-selected ordering preserved where sort state exists, and e2e coverage pinning the defaults.

## Plan Context

- Kata issue: `2qf5` — "Default time-based UI tables to newest first" (P2, bug, frontend; API work in scope only where an endpoint cannot request the needed server-side sort).
- Verified starting point (operator, 2026-07-27): the Transactions page and its drill-down embeddings are already newest-first server-side; the account register is oldest-first, and its endpoint (`searchAccountJournalRecords` in `api/openapi.yaml`) exposes **no sort parameter** — so a minimal contract addition is in scope for the register. Status operation runs are specified newest-first by `docs/webui-design.md` (verify, don't assume).
- Task 1 must begin with an audit: enumerate every frontend table listing time-based rows (transactions browser embeddings, account/group registers, recurring occurrences inline, Status operation runs, and anything else found), record each table's current default order and whether it is URL-backed, and fix only those that are oldest-first. Recurring *definitions* (next-date table) are configuration, not activity — out of scope.
- Register specifics:
  - Contract: add server-side sort direction to the register records endpoint following the repository's existing typed-allowlist sort conventions (`sort`/`sort_dir` as on other endpoints; `docs/architecture.md`: dynamic sort keys come from typed allowlists). Default the endpoint (or the frontend's explicit request) to newest-first per the issue. Regenerate all generated surfaces via the owning Justfile recipes.
  - Running balance must stay correct: it is a chronological cumulative value — compute it in chronological order server-side regardless of returned row order (a newest-first page shows each record's post-event balance, like a bank statement). Operator decision (implement, do not relitigate): the running-balance column stays visible in the unfiltered, date-ordered register in either direction, and stays hidden under filters/search/non-date sort exactly as today.
  - Update the `docs/webui-design.md` register bullet ("shown only in the default chronological view") with a minimal wording change reflecting date-ordered-either-direction; the operator reviews the doc diff.
  - Group registers share the surface — they follow automatically; verify.
  - Pagination, the peek panel, keyboard row-walking, and any date-jump/positioning behavior in the register must keep working under the flipped order.
- Preserve user-selected ordering where the shared browser supports URL-backed sort state; do not invent new sort UI where none exists.
- Ground truth: `docs/webui-design.md` (Screen 4 register spec, Tables and filtering), `docs/frontend-architecture.md` (URL owns shareable sort state; backend-supported sorting for unbounded data), `api/openapi.yaml`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test`, `just test-integration` (REST contract change), `just test-frontend-e2e`.

## Tasks

### Task 1: Audit and register contract

- [x] Produce the time-based-table audit (in the commit message or a code comment where the defaults live): each table, current default, URL-backed or not, action taken.
- [x] Add typed sort direction to the register records endpoint with chronological running-balance computation preserved; regenerate all generated surfaces; backend coverage per `docs/TESTING.md` for both directions including running-balance correctness on a newest-first page.
- [x] Commit the task as `feat(api): support register record sort direction with stable running balance`.

### Task 2: Newest-first defaults in the UI

- [x] Default the account/group register (and any other oldest-first table found in the audit) to newest first; running-balance column visibility per the operator decision; user-selected order preserved where sort state exists; update the `docs/webui-design.md` register wording minimally.
- [x] Manually verify with `just dev --demo`: account register opens newest first with correct running balances matching the account balance at the top row; paging, peek, and keyboard walking behave; filtered register still hides the running balance.
- [x] Commit the task as `fix(frontend): default time-based tables to newest first`.

### Task 3: End-to-end coverage

- [x] e2e coverage: register default order newest-first with running-balance values correct on the first page; any other corrected table's default pinned; existing suites stay green.
- [x] Commit the task as `test(frontend-e2e): pin newest-first defaults and register running balance`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-27-2qf5-newest-first-tables.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `2qf5` with `kata close 2qf5 --done --message "<summary incl. audit results>" --commit <sha> --test "just test; just test-integration; just test-frontend-e2e" --agent`.
