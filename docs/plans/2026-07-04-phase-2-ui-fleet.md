# Plan: Phase 2 UI fleet — sequential sub-branch delivery (kata label `ui-stage-3`)

Drive the remaining phase-2 web UI scope to mostly-complete by delivering one kata issue at a time as a Codex-implemented sub-branch of `ui-stage-3`, with the Claude session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the Claude session executing this plan. Authors sub-branch plans, launches and waits on Codex, reviews, merges, closes kata issues. Never edits implementation code — all code changes flow through Codex sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Codex: the only implementor, headless, one session at a time.
- Integration branch: `ui-stage-3` (this worktree). Never touch `main`.
- Today's issue set carries kata label `ui-stage-3`: query with `kata list --label ui-stage-3 --agent`.

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / Codex session at any time. Finish (merge or fail) the current task before starting the next.
- Codex quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator (Claude) quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop`, run by Codex from the initial implementation plan's Final Verification. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
- After the Codex session: the operator runs the review below. Findings warrant at most TWO fix plans per task. Every fix plan MUST state "Do not run review-loop." in its Plan Context and omit review-loop from its Final Verification.
- A task still failing after 2 fix plans: leave the sub-branch unmerged, mark the task failed with findings, then proceed only to a task that is still viable — skip any task that depends on the failed one, directly or transitively. If no viable tasks remain, stop the fleet entirely. Never merge a failing branch; never silently drop scope.
- Environmental failure (toolchain, `gt`, non-resetting quota): stop and ask.

### Per-task workflow (referenced by every task below)

1. Setup: from `ui-stage-3`, `gt <branch> ui-stage-3 -x true` (worktree lands in `.worktrees/<branch>`). Claim: `kata claim <ref> --comment "Fleet sub-branch <branch>." --agent`.
2. Author the Codex implementation plan in the sub-worktree at `docs/plans/2026-MM-DD-<topic>.md` from `docs/plan_template.md`: concrete checkboxes sized 1–4 commits, the kata ref, repo verification commands per commit (`just test`, `just pre-commit`; `just test-integration` for API/HTTP behavior; `just test-frontend-e2e` for frontend runtime behavior). Initial plans keep the standard Final Verification including one `just review-loop`. Feature-delivering plans include a PROJECT_STATE.md update item and package-doc updates where contracts change. Before authoring, read the owning ground-truth docs for the touched area (`docs/architecture.md`; for frontend also `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`; for API semantics `docs/business-requirements.md`, `api/openapi.yaml`). Commit the plan in the sub-worktree.
3. Dispatch: from the sub-worktree, headless in the background (do not use `just codex-goal` — it fails without a terminal), run exactly:

   ```sh
   codex exec --dangerously-bypass-approvals-and-sandbox "/goal implement <plan_file>. Acceptance criteria - all checkboxes are ticked. When done - move file to docs/plans/completed folder. Make sure you go commit by commit, task by task and never jump forward or skip any item."
   ```

   Do not touch the worktree while the session runs. Completion signal: plan moved to `docs/plans/completed/` and process exit. Review-loop can take ~10 minutes; use long poll timeouts and do not kill it while heartbeat/progress lines continue.
4. Operator review (each iteration):
   - Sanity: all checkboxes ticked, plan archived, sub-worktree clean, suites reported green.
   - Docs governance: `git diff ui-stage-3...<branch> -- docs/` — implementors and review fixers must not change scope, phasing, or UX/architecture rules in ground-truth docs. Revert unauthorized edits (operator-owned commit) and note it.
   - Architectural audit: read-only subagents over the sub-branch diff against the owning docs; demand file:line evidence and severity.
   - Live verification for anything with a runtime surface: run `just dev --demo`, drive the UI (Playwright or equivalent), screenshot, judge against `docs/webui-design.md` and the theme doc — observed behavior beats checkboxes. This includes the operator's critical high-level architectural and visual UI/UX judgment.
5. Fix loop (max 2 per task): author an implementation-only fix plan from the template — file:line defects with live evidence, a "protect — do not regress" list, explicit scope exclusions, "Do not run review-loop." in Plan Context, no review-loop in Final Verification. Commit it in the sub-worktree, re-dispatch Codex, re-review.
6. Merge: from the `ui-stage-3` worktree, `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`. Trivial conflicts (plans, docs) resolve as operator; implementation conflicts: abort, merge `ui-stage-3` into the sub-worktree, hand resolution to Codex via a fix plan (no review-loop), re-review, retry.
7. Cleanup: `git worktree remove .worktrees/<branch>`, `git branch -D <branch>`.
8. Close: `kata close <ref> --done --message "..." --commit <sha> --test "<suites>" --agent` if the session did not already.
9. Rule changes discovered in review go into ground-truth docs first (operator edits, committed separately); long-horizon gaps become new kata issues, not fix-plan items.

## Tasks

Per-task checklist — every task below runs the full per-task workflow; tick a task only after completing all of:

1. Setup, claim, Codex plan authored and committed
2. Codex session completed (plan archived, worktree clean, suites green)
3. Operator review passed (fix plans used ≤2)
4. Squash-merged into `ui-stage-3`; worktree and branch removed
5. Kata issue closed with evidence

Task scope details live in the kata issues (`kata show <ref> --agent`). (API) = backend/API-only, (FE) = frontend-only; respect the stated dependencies, otherwise run in order.

- [x] Task 1: `qdra` — web UI transaction and navigation papercuts (FE) — branch `qdra-ui-papercuts`
- [x] Task 2: `ah5b` — tag chip overflow display (FE) — branch `ah5b-tag-chip-overflow`
- [x] Task 3: `4nmw` — transaction detail panel interaction polish (FE) — branch `4nmw-detail-panel-polish`
- [x] Task 4: `z8v9` — jump-to-date control on Transactions (FE) — branch `z8v9-date-jump`
- [x] Task 5: `f9yj` — entry pickers fetch intent-filtered categories (FE) — branch `f9yj-intent-pickers`; issue already owned, comment instead of claim
- [x] Task 6: `y7yk` — balances API: USD equivalents + bulk credit limits (API) — branch `y7yk-balances-aggregates-api`
- [x] Task 7: `d7jh` — featured-accounts balance strip (FE) — branch `d7jh-balance-strip`
- [x] Task 8: `vp80` — Overview dashboard page (FE; requires Task 6) — branch `vp80-overview-page`
- [x] Task 9: `npb5` — transactions list filter/search API (API) — branch `npb5-transactions-filter-api`
- [x] Task 10: `0b17` — Transactions search and filter bar (FE; requires Task 9) — branch `0b17-filter-bar`
- [x] Task 11: `bm0h` — account-record search API for registers (API) — branch `bm0h-register-api`
- [x] Task 12: `7ts6` — Accounts chart-of-accounts page (FE) — branch `7ts6-accounts-page`
- [ ] Task 13: `6a1w` — account page with register (FE; requires Task 11) — branch `6a1w-account-register`
- [ ] Task 14: `t3ph` — account group pages (FE; requires Tasks 11 and 13) — branch `t3ph-group-pages`
- [ ] Task 15: `s5nw` — Categories reference page, establishes the reference pattern (FE) — branch `s5nw-categories-page`
- [ ] Task 16: `z7t0` — Tags and Members reference pages (FE; requires Task 15) — branch `z7t0-tags-members-pages`
- [ ] Task 17: `d7av` — command palette: navigation, entry, app actions (FE) — branch `d7av-command-palette`
- [ ] Task 18: `mrs9` — hierarchy restructuring API with subtree FQN rewrite (API; no UI consumer in this plan) — branch `mrs9-restructure-api`
- [ ] Task 19: `axf6` — Advanced journal editor tab with shorthand escalation (FE; stretch, only if the fleet gets here) — branch `axf6-journal-editor`

## Final Verification

- [ ] On `ui-stage-3` with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run exactly one and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, kata refs closed, residual findings and unmerged branches
- [ ] Move this plan to `docs/plans/completed/`
