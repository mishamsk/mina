# Plan: Hierarchy semantics fleet — sequential sub-branch delivery (kata refs 5w9q, mrs9, j494, 4hmc)

Deliver the hierarchy-semantics work set — prefix-free invariant enforcement, the restructure API, group-state services, and the restructure UI — one kata issue at a time as a Codex-implemented sub-branch of the main working branch, with the Claude session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the Claude session executing this plan. Authors sub-branch plans, launches and waits on Codex, reviews, merges, closes kata issues. Never edits implementation code — all code changes flow through Codex sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Codex: the only implementor, headless, one session at a time.
- Integration branch ("main working branch"): whatever branch the operator session is currently on when executing this plan. Never touch `main`.
- This fleet's issue set is the fixed ref list `5w9q`, `mrs9`, `j494`, `4hmc` (inspect with `kata show <ref> --agent`). `4d8j` (featured-groups table) is deliberately deferred backlog and out of scope here.
- `docs/hierarchy-semantics.md` is the owning ground-truth doc for every task in this fleet; every sub-branch plan must follow it, and settled per-issue decisions live in the kata issue comments.
- The project has no production databases and the schema is evergreen: if a task needs data-model changes, edit the existing migration files in place (no new upgrade migrations) and keep `docs/data-model.md` aligned in the same commit.
- This plan supersedes Task 18 (`mrs9`) of `docs/plans/2026-07-04-phase-2-ui-fleet.md`; when `mrs9` merges here, tick that task there instead of re-running it.

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / Codex session at any time. Finish (merge or fail) the current task before starting the next.
- Codex quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator (Claude) quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop`, run by Codex from the initial implementation plan's Final Verification. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
- After the Codex session: the operator runs the review below. Findings warrant at most TWO fix plans per task. Every fix plan MUST state "Do not run review-loop." in its Plan Context and omit review-loop from its Final Verification.
- A task still failing after 2 fix plans: leave the sub-branch unmerged, mark the task failed with findings, then proceed only to a task that is still viable — skip any task that depends on the failed one, directly or transitively. If no viable tasks remain, stop the fleet entirely. Never merge a failing branch; never silently drop scope.
- Environmental failure (toolchain, `gt`, non-resetting quota): stop and ask.

### Per-task workflow (referenced by every task below)

1. Setup: from the main working branch, `gt <branch> <main-working-branch> -x true` (worktree lands in `.worktrees/<branch>`). Claim: `kata claim <ref> --comment "Fleet sub-branch <branch>." --agent`.
2. Author the Codex implementation plan in the sub-worktree at `docs/plans/2026-MM-DD-<topic>.md` from `docs/plan_template.md`: concrete checkboxes sized 1–4 commits, the kata ref, repo verification commands per commit (`just test`, `just pre-commit`; `just test-integration` for API/HTTP behavior; `just test-frontend-e2e` for frontend runtime behavior). Initial plans keep the standard Final Verification including one `just review-loop`. Feature-delivering plans include a PROJECT_STATE.md update item and package-doc updates where contracts change. Before authoring, read the owning ground-truth docs for the touched area (`docs/architecture.md`, `docs/hierarchy-semantics.md`, the kata issue comments; for frontend also `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`; for API semantics `docs/business-requirements.md`, `api/openapi.yaml`). Commit the plan in the sub-worktree. Exception: Task 1 (`5w9q`) already has its committed plan at `docs/plans/2026-07-07-prefix-free-hierarchy-invariant.md` — verify it, do not re-author.
3. Dispatch: from the sub-worktree, headless in the background (do not use `just codex-goal` — it fails without a terminal), run exactly:

   ```sh
   codex exec --dangerously-bypass-approvals-and-sandbox "/goal implement <plan_file>. Acceptance criteria - all checkboxes are ticked. When done - move file to docs/plans/completed folder. Make sure you go commit by commit, task by task and never jump forward or skip any item."
   ```

   Do not touch the worktree while the session runs. Completion signal: plan moved to `docs/plans/completed/` and process exit. Review-loop can take ~10 minutes; use long poll timeouts and do not kill it while heartbeat/progress lines continue.
4. Operator review (each iteration):
   - Sanity: all checkboxes ticked, plan archived, sub-worktree clean, suites reported green.
   - Docs governance: `git diff <main-working-branch>...<branch> -- docs/` — implementors and review fixers must not change scope, phasing, or semantics rules in ground-truth docs (including `docs/hierarchy-semantics.md`). Revert unauthorized edits (operator-owned commit) and note it.
   - Architectural audit: read-only subagents over the sub-branch diff against the owning docs; demand file:line evidence and severity.
   - Semantics audit for API tasks: verify behavior against `docs/hierarchy-semantics.md` by exercising the running API (`just dev --demo` or app-test evidence) — prefix-free rejections, unoccupied-destination restructure rules, atomicity, budget lockstep — observed behavior beats checkboxes.
   - Live verification for anything with a runtime surface: run `just dev --demo`, drive the UI (Playwright or equivalent), screenshot, judge against `docs/webui-design.md` and the theme doc — including the operator's critical high-level architectural and visual UI/UX judgment.
5. Fix loop (max 2 per task): author an implementation-only fix plan from the template — file:line defects with live evidence, a "protect — do not regress" list, explicit scope exclusions, "Do not run review-loop." in Plan Context, no review-loop in Final Verification. Commit it in the sub-worktree, re-dispatch Codex, re-review.
6. Merge: from the main working branch's worktree, `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`. Trivial conflicts (plans, docs) resolve as operator; implementation conflicts: abort, merge the main working branch into the sub-worktree, hand resolution to Codex via a fix plan (no review-loop), re-review, retry.
7. Cleanup: `git worktree remove .worktrees/<branch>`, `git branch -D <branch>`.
8. Close: `kata close <ref> --done --message "..." --commit <sha> --test "<suites>" --agent` if the session did not already.
9. Rule changes discovered in review go into ground-truth docs first (operator edits, committed separately); long-horizon gaps become new kata issues, not fix-plan items.

## Tasks

Per-task checklist — every task below runs the full per-task workflow; tick a task only after completing all of:

1. Setup, claim, Codex plan authored and committed (Task 1: existing plan verified)
2. Codex session completed (plan archived, worktree clean, suites green)
3. Operator review passed (fix plans used ≤2)
4. Squash-merged into the main working branch; worktree and branch removed
5. Kata issue closed with evidence

Task scope details live in the kata issues (`kata show <ref> --agent`); settled design decisions are in the issue comments and `docs/hierarchy-semantics.md`. (API) = backend/API-only, (FE) = frontend-only; respect the stated dependencies, otherwise run in order.

- [ ] Task 1: `5w9q` — prefix-free hierarchy invariant on FQN write paths and db validation (API) — branch `5w9q-prefix-free-invariant`; committed plan: `docs/plans/2026-07-07-prefix-free-hierarchy-invariant.md`
- [ ] Task 2: `mrs9` — hierarchy restructuring API with subtree FQN rewrite, including template PUT unification (API; requires Task 1) — branch `mrs9-restructure-api`
- [ ] Task 3: `j494` — group-state services and API: derived group hidden state, bulk hide/unhide by group path (API; requires Task 1) — branch `j494-group-state-api`
- [ ] Task 4: `4hmc` — restructure (rename/move) UI on accounts and reference-data trees (FE; requires Task 2) — branch `4hmc-restructure-ui`

## Final Verification

- [ ] On the main working branch with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run exactly one and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, kata refs closed, residual findings and unmerged branches
- [ ] Move this plan to `docs/plans/completed/`
