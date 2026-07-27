# Plan: Recent UI/frontend papercuts and small follow-ups — sequential sub-branch delivery (`kata search "UI frontend web polish papercut"` + full open-issue sweep for frontend-labeled and frontend-consequence issues)

Clear the current backlog of small/medium, well-scoped web UI and frontend bugs and polish follow-ups from previous fleets — URL/deep-link state handling, transaction lifecycle timestamp correctness and display, table ordering defaults, record-role and class indicators, bulk-categorize skip semantics, picker/inline-save/register-header polish. One backend/API bug (`5qah`) is included because it owns the contract its frontend consumer (`e222`) renders. Excluded deliberately: `qbg9` (requires a multi-prototype design workflow and carries blocked-by links) and `2ffd` (CI e2e concurrency stabilization — infra diagnosis verified on hosted runners, not UI behavior). Deliver one Kata issue at a time as a Codex-implemented sub-branch of the main working branch, with the session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the session executing this plan. Authors sub-branch plans, launches and waits on implementor Codex sessions, reviews, merges, closes kata issues. Never edits implementation code — all code changes flow through implementor sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Implementor Codex: the only implementor, headless, one session at a time, running `gpt-5.6-sol` with `high` reasoning effort.
- Integration branch ("main working branch"): whatever branch the operator session is currently on when executing this plan. Never touch `main`.
- Issue set: explicit refs selected 2026-07-26 from the open Kata ledger: `3fp5`, `zh4g`, `5qah`, `e222`, `ekp3`, `2qf5`, `y8fz`, `3c4q`, `xy9q`, `ndkg`, `2q6j`, `r2ae`, `q3rh`.

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / implementor session at any time. Finish (merge or fail) the current task before starting the next.
- Implementor quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop --plan "<implementation plan path>"`, run by the implementor from the initial implementation plan's Success Criteria. The plan is immutable ground truth for review-loop reviewers and fixers. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
- After the implementor session: the operator runs the review below. Findings warrant at most TWO fix plans per task. Every fix plan MUST state "Do not run review-loop." in its Plan Context and omit review-loop from its Success Criteria.
- A task still failing after 2 fix plans: leave the sub-branch unmerged, mark the task failed with findings, then proceed only to a task that is still viable — skip any task that depends on the failed one, directly or transitively. If no viable tasks remain, stop the fleet entirely. Never merge a failing branch; never silently drop scope.
- Environmental failure (toolchain, `gt`, non-resetting quota): stop and ask.

### Per-task workflow (referenced by every task below)

1. Setup: from the main working branch, `gt <branch> <main-working-branch> -x true` (worktree lands in `.worktrees/<branch>`). Claim: `kata claim <ref> --comment "Fleet sub-branch <branch>." --agent`.
2. Author the implementation plan in the sub-worktree at `docs/plans/2026-MM-DD-<topic>.md` from `docs/plan_template.md`. The subplan covers the Kata issue's full feature, component, bug set, or refactor slice and normally decomposes that substantial outcome into multiple sequential tasks and commits; fleet orchestration does not reduce a subplan to a single small task. Include concrete checkboxes, the kata ref, and only the repository-owned validation commands that provide relevant evidence for the affected behavior. Initial plans keep the standard Success Criteria including one `just review-loop`. Feature-delivering plans include a PROJECT_STATE.md update item and package-doc updates where contracts change. Before authoring, read the owning ground-truth docs for the touched area (`docs/architecture.md`; for frontend also `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`; for API semantics `docs/business-requirements.md`, `api/openapi.yaml`). Commit the plan in the sub-worktree.
3. Dispatch: from the sub-worktree, headless in the background (do not use `just codex-goal` — it fails without a terminal), run exactly:

   ```sh
   codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --dangerously-bypass-approvals-and-sandbox "Implement <plan_file> end to end. Follow its task order, constraints, and stopping conditions. Success means every applicable checkbox and the plan's success criteria are complete, task commits are created as directed, and the finished plan is moved to docs/plans/completed. The plan file itself is immutable except for ticking checkboxes and the final move to docs/plans/completed. If the plan directs a just review-loop run, invoke it AT MOST ONCE in this session: after that one invocation and its fix commits, the review-loop item is satisfied permanently — never invoke it again, even if findings remain; record unresolved findings in your final report instead. If blocked, leave the affected checkbox open and report the blocker with evidence."
   ```

   Do not touch the worktree while the session runs. Completion signal: plan moved to `docs/plans/completed/` and process exit. Review-loop can take ~10 minutes; use long poll timeouts and do not kill it while heartbeat/progress lines continue.
4. Operator review (each iteration):
   - Sanity: all checkboxes ticked, plan archived, sub-worktree clean, suites reported green.
   - Docs governance: `git diff <main-working-branch>...<branch> -- docs/` — implementors and review fixers may make targeted ground-truth doc updates when the implementation genuinely diverged from the documented rule (e.g. a new interaction precedence the doc did not anticipate); broad scope, phasing, or architecture rewrites remain off-limits. The operator judges every doc diff at review: warranted updates stay, unwarranted ones are reverted via a fix plan (or an operator-owned commit for trivial reverts), and the intervention is noted.
   - Architectural audit: read-only subagents over the sub-branch diff against the owning docs; demand file:line evidence and severity.
   - Live verification for anything with a runtime surface: run `just dev --demo`, drive the UI (Playwright or equivalent), screenshot, judge against `docs/webui-design.md` and the theme doc — observed behavior beats checkboxes. This includes the operator's critical high-level architectural and visual UI/UX judgment.
5. Fix loop (max 2 per task): author an implementation-only fix plan from the template — file:line defects with live evidence, a "protect — do not regress" list, explicit scope exclusions, "Do not run review-loop." in Plan Context, no review-loop in Success Criteria. Commit it in the sub-worktree, re-dispatch Codex, re-review.
6. Merge: from the main working branch's worktree, `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`. Trivial conflicts (plans, docs) resolve as operator; implementation conflicts: abort, merge the main working branch into the sub-worktree, hand resolution to Codex via a fix plan (no review-loop), re-review, retry.
7. Cleanup: `git worktree remove .worktrees/<branch>`, `git branch -D <branch>`.
8. Close: `kata close <ref> --done --message "..." --commit <sha> --test "<suites>" --agent` if the session did not already.
9. Rule changes discovered in review go into ground-truth docs first (operator edits, committed separately); long-horizon gaps become new kata issues, not fix-plan items.

## Tasks

Per-task checklist — every task below runs the full per-task workflow; tick a task only after completing all of:

1. Setup, claim, implementation plan authored and committed
2. Implementor session completed (plan archived, worktree clean, suites green)
3. Operator review passed (fix plans used ≤2)
4. Squash-merged into the main working branch; worktree and branch removed
5. Kata issue closed with evidence

Task scope details live in the Kata issues (`kata show <ref> --agent`). Respect the stated dependencies; otherwise run in the listed order.

- [ ] Task 1: `3fp5` — Preserve transaction detail and split editor while debounced search syncs URL (P1 frontend bug; no dependencies; leads the fleet on priority and owns the debounced-search URL-sync behavior later tasks build on) — branch `3fp5-search-url-detail-preserve`
- [ ] Task 2: `zh4g` — Restore transaction detail from deep-link query parameters (P2 frontend bug; same transactions URL-parameter surface as Task 1 — runs after it so deep-link restore builds on the corrected param-preserving sync) — branch `zh4g-detail-deep-link`
- [ ] Task 3: `5qah` — Do not assign pending timestamps to directly posted manual transactions (P2 backend/API bug; nullable pending-timestamp contract must land before its frontend lifecycle-display consumer in Task 4) — branch `5qah-no-pending-direct-post`
- [ ] Task 4: `e222` — Render transaction lifecycle timestamps in browser local time (P2 frontend bug; depends on Task 3's nullable pending timestamps so lifecycle rendering is built once against the corrected contract) — branch `e222-lifecycle-local-time`
- [ ] Task 5: `ekp3` — Polish detail lifecycle strip internals (P4 polish promoted next to Task 4: both touch lifecycle derivation/display in the transaction detail panel; extracting the shared derivation immediately after avoids churning the same code twice) — branch `ekp3-lifecycle-strip-polish`
- [ ] Task 6: `2qf5` — Default time-based UI tables to newest first (P2 frontend bug; shared-browser ordering defaults are foundational table behavior, so they precede the remaining table/detail polish; independent of Tasks 1–5) — branch `2qf5-newest-first-tables`
- [ ] Task 7: `y8fz` — Surface derived journal record roles in the UI (P2 frontend; adds a record-role indicator across journal-record tables; runs before Task 8 so detail-panel chip/marker conventions settle in one direction) — branch `y8fz-record-role-indicators`
- [ ] Task 8: `3c4q` — Remove redundant class metadata from transaction detail (P2 frontend bug; small detail-panel presentation change following Task 7's marker work on the same panel) — branch `3c4q-detail-class-chip`
- [ ] Task 9: `xy9q` — Skip intent-incompatible transactions in bulk categorize instead of failing the batch (P2 frontend; self-contained bulk-edit skip-semantics rework including the mixed-count/toast follow-ups from the issue comment; independent of earlier tasks) — branch `xy9q-bulk-categorize-skip`
- [ ] Task 10: `ndkg` — Differentiate dictionary edit and move/rename icons (P2 frontend-only iconography polish on Accounts/Categories/Tags row actions; independent) — branch `ndkg-dictionary-icons`
- [ ] Task 11: `2q6j` — Polish segment-completion picker edge cases (P3 frontend; enumerated residual edge cases from the vmp6 review, including flat recurring-member picker names bypassing segment derivation) — branch `2q6j-picker-edge-cases`
- [ ] Task 12: `r2ae` — Polish inline-save background reconciliation edges (P3 frontend; two enumerated edges in `use-transactions-resource.ts`; independent, ordered by priority) — branch `r2ae-inline-save-reconcile`
- [ ] Task 13: `q3rh` — Register page header middle-truncates the account FQN despite available width (P4 frontend; smallest polish item, applies the a4py width policy to the register header; independent) — branch `q3rh-register-header-fqn`

## Final Verification

- [ ] On the main working branch with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run `just review-loop --plan "<this fleet plan's repo-relative path>"` exactly once and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, Kata refs closed, residual findings and unmerged branches (per-task evidence recorded on each closed Kata issue)
- [ ] Move this plan to `docs/plans/completed/`
