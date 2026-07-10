# Plan: Phase 2 frontend/UI audit fixes — sequential sub-branch delivery (16 capped open Kata issues)

Deliver 16 audit-sized Phase 2 frontend/UI improvements and their small existing-response API enablers, favoring the smaller actionable leaves when the open set exceeds the cap. The selector is open `phase-2` frontend issues plus directly related API issues that extend an existing response without a data-model change or a new endpoint type; larger screens/editing workflows, migrations, and substantial backend semantic validation are excluded. Deliver one Kata issue at a time as a Codex-implemented sub-branch of the main working branch, with the Codex session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the Codex session executing this plan. Authors sub-branch plans, launches and waits on implementor Codex sessions, reviews, merges, closes kata issues. Never edits implementation code — all code changes flow through implementor sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Implementor Codex: the only implementor, headless, one session at a time, running `gpt-5.6-terra` with `high` reasoning effort.
- Integration branch ("main working branch"): whatever branch the operator session is currently on when executing this plan. Never touch `main`.
- Issue set: `hafw`, `cdd0`, `efrg`, `ja9z`, `0jg6`, `47f4`, `60tx`, `wy32`, `qwjb`, `cqft`, `0tvb`, `pj89`, `e1ke`, `r725`, `4fxe`, and `np9z`, selected from `kata list --status all --agent` under the selector above.

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / Codex session at any time. Finish (merge or fail) the current task before starting the next.
- Codex quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator (Codex) quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop`, run by Codex from the initial implementation plan's Final Verification. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
- After the Codex session: the operator runs the review below. Findings warrant at most TWO fix plans per task. Every fix plan MUST state "Do not run review-loop." in its Plan Context and omit review-loop from its Final Verification.
- A task still failing after 2 fix plans: leave the sub-branch unmerged, mark the task failed with findings, then proceed only to a task that is still viable — skip any task that depends on the failed one, directly or transitively. If no viable tasks remain, stop the fleet entirely. Never merge a failing branch; never silently drop scope.
- Environmental failure (toolchain, `gt`, non-resetting quota): stop and ask.

### Per-task workflow (referenced by every task below)

1. Setup: from the main working branch, `gt <branch> <main-working-branch> -x true` (worktree lands in `.worktrees/<branch>`). Claim: `kata claim <ref> --comment "Fleet sub-branch <branch>." --agent`.
2. Author the Codex implementation plan in the sub-worktree at `docs/plans/2026-MM-DD-<topic>.md` from `docs/plan_template.md`: concrete checkboxes sized 1–4 commits, the kata ref, repo verification commands per commit (`just test`, `just pre-commit`; `just test-integration` for API/HTTP behavior; `just test-frontend-e2e` for frontend runtime behavior). Initial plans keep the standard Final Verification including one `just review-loop`. Feature-delivering plans include a PROJECT_STATE.md update item and package-doc updates where contracts change. Before authoring, read the owning ground-truth docs for the touched area (`docs/architecture.md`; for frontend also `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`; for API semantics `docs/business-requirements.md`, `api/openapi.yaml`). Commit the plan in the sub-worktree.
3. Dispatch: from the sub-worktree, headless in the background (do not use `just codex-goal` — it fails without a terminal), run exactly:

   ```sh
   codex exec -m gpt-5.6-terra -c model_reasoning_effort=high --dangerously-bypass-approvals-and-sandbox "/goal implement <plan_file>. Acceptance criteria - all checkboxes are ticked. When done - move file to docs/plans/completed folder. Make sure you go commit by commit, task by task and never jump forward or skip any item."
   ```

   Do not touch the worktree while the session runs. Completion signal: plan moved to `docs/plans/completed/` and process exit. Review-loop can take ~10 minutes; use long poll timeouts and do not kill it while heartbeat/progress lines continue.
4. Operator review (each iteration):
   - Sanity: all checkboxes ticked, plan archived, sub-worktree clean, suites reported green.
   - Docs governance: `git diff <main-working-branch>...<branch> -- docs/` — implementors and review fixers must not change scope, phasing, or UX/architecture rules in ground-truth docs. Revert unauthorized edits (operator-owned commit) and note it.
   - Architectural audit: read-only subagents over the sub-branch diff against the owning docs; demand file:line evidence and severity.
   - Live verification for anything with a runtime surface: run `just dev --demo`, drive the UI (Playwright or equivalent), screenshot, judge against `docs/webui-design.md` and the theme doc — observed behavior beats checkboxes. This includes the operator's critical high-level architectural and visual UI/UX judgment.
5. Fix loop (max 2 per task): author an implementation-only fix plan from the template — file:line defects with live evidence, a "protect — do not regress" list, explicit scope exclusions, "Do not run review-loop." in Plan Context, no review-loop in Final Verification. Commit it in the sub-worktree, re-dispatch Codex, re-review.
6. Merge: from the main working branch's worktree, `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`. Trivial conflicts (plans, docs) resolve as operator; implementation conflicts: abort, merge the main working branch into the sub-worktree, hand resolution to Codex via a fix plan (no review-loop), re-review, retry.
7. Cleanup: `git worktree remove .worktrees/<branch>`, `git branch -D <branch>`.
8. Close: `kata close <ref> --done --message "..." --commit <sha> --test "<suites>" --agent` if the session did not already.
9. Rule changes discovered in review go into ground-truth docs first (operator edits, committed separately); long-horizon gaps become new kata issues, not fix-plan items.

## Tasks

Per-task checklist — every task below runs the full per-task workflow; tick a task only after completing all of:

1. Setup, claim, Codex plan authored and committed
2. Codex session completed (plan archived, worktree clean, suites green)
3. Operator review passed (fix plans used ≤2)
4. Squash-merged into the main working branch; worktree and branch removed
5. Kata issue closed with evidence

Task scope details live in the Kata issues (`kata show <ref> --agent`). Respect the stated dependencies; otherwise run in the listed order.

- [ ] Task 1: `hafw` — Expose member delete eligibility through the API (API contract; small extension to existing Member responses; enables Task 6) — branch `hafw-member-delete-eligibility`
- [ ] Task 2: `cdd0` — Categories/tags listings expose deleteability (parity with accounts) (API contract; completed external blocker `n1tb` is satisfied; small extension to existing list responses; enables Task 7) — branch `cdd0-reference-deleteability-api`
- [ ] Task 3: `efrg` — Restore internal scrolling and bottom inset on reference tables (frontend layout foundation across reference screens) — branch `efrg-reference-table-scrolling`
- [ ] Task 4: `ja9z` — Fix reference-table trailing action behavior (frontend shared-action foundation; precedes Tasks 5, 7, and 12) — branch `ja9z-reference-row-actions`
- [ ] Task 5: `0jg6` — Add supported edit and delete actions to member rows (frontend member actions; requires Task 4) — branch `0jg6-member-row-actions`
- [ ] Task 6: `47f4` — Disable ineligible member deletion before confirmation (frontend API consumer; requires Tasks 1 and 5) — branch `47f4-disable-member-delete`
- [ ] Task 7: `60tx` — Reference pages: delete row actions driven by deleteability (parity with accounts) (frontend API consumer; requires Tasks 2 and 4; before setup, the operator commits the issue-required `docs/webui-design.md` §6 rule update on the main working branch) — branch `60tx-reference-delete-actions`
- [ ] Task 8: `wy32` — Disable ineligible account deletion in the edit panel (frontend deleteability consumer using the existing Account contract) — branch `wy32-disable-account-delete`
- [ ] Task 9: `qwjb` — Stabilize the transactions filter toolbar (frontend toolbar foundation; precedes Tasks 10 and 11) — branch `qwjb-stable-filter-toolbar`
- [ ] Task 10: `cqft` — Promote transaction class to a top-level filter (frontend URL-backed filter; requires Task 9) — branch `cqft-transaction-class-filter`
- [ ] Task 11: `0tvb` — Add previous-day and next-day transaction controls (frontend local-date navigation; requires Task 9) — branch `0tvb-adjacent-day-controls`
- [ ] Task 12: `pj89` — Add a quick-delete action to transaction rows (frontend transaction RowActions; requires Task 4) — branch `pj89-transaction-quick-delete`
- [ ] Task 13: `e1ke` — Prevent mixed transaction amounts from overlapping members (frontend responsive amount-layout fix) — branch `e1ke-mixed-amount-overlap`
- [ ] Task 14: `r725` — Use neutral styling for income amount chips (frontend amount-chip semantic styling; follows Task 13's layout fix) — branch `r725-neutral-income-amounts`
- [ ] Task 15: `4fxe` — Use neutral styling for transaction member chips (frontend entity-chip semantic styling) — branch `4fxe-neutral-member-chips`
- [ ] Task 16: `np9z` — Fill the active featured-account star yellow (frontend toggle-state styling polish) — branch `np9z-featured-star-fill`

## Final Verification

- [ ] On the main working branch with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run exactly one and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, Kata refs closed, residual findings and unmerged branches (per-task evidence recorded on each closed Kata issue)
- [ ] Move this plan to `docs/plans/completed/`
