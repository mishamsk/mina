# Plan: Small UI fixes — sequential sub-branch delivery (all open P1/P2 Kata issues labeled `frontend`)

Close every open P1/P2 frontend Kata issue: initial table-row focus with `/` and `Meta+L` list-search shortcuts, first-empty-field focus in the transaction entry modal with a `Meta+L` template-search shortcut, and the Templates table trailing-action padding fix. Deliver one Kata issue at a time as a Codex-implemented sub-branch of the main working branch, with the session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the user's current Claude or Codex session executing this plan. Owns the plans, dispatches and checks sub-branch plans, launches and waits on implementor sessions, reviews, merges, closes kata issues. May make small plan adjustments directly or ask the planner to revise them; do so only when no implementor is running, and commit revisions before the next implementation dispatch. Never automatically switches provider and never edits implementation code — all code changes flow through implementor sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Planner: a headless `just agent-exec plan` session. The operator provides scope and constraints, waits for the plan, then reviews and commits it before implementation.
- Implementor: the only implementation session, headless, one session at a time, launched through `just agent-exec implement`. The Justfile owns model and effort settings for all dispatched roles.
- Integration branch ("main working branch"): whatever branch the operator session is currently on when executing this plan. Never touch `main`.
- Issue set: `kata list --agent` filtered to status `open`, priority ≤ 2, label `frontend` on 2026-09-17 — exactly `bmcb`, `cwxv`, `c53m` (no P1 issues were open).

### Testing policy (mandatory in every subplan and dispatch prompt)

- `docs/FRONTEND-TESTING.md` governs. No new e2e test for a bug fix or small behavior change; fold a visible assertion into the existing journey that already exercises that surface, or add nothing.
- No REST calls as the action or evidence under test; fixture-only API setup is allowed when it keeps a journey short. No per-state or per-route matrices, no exact-geometry assertions, no fixed waits.
- Net e2e test count may only go down or stay equal per task unless the issue names a genuinely new essential journey; none of the three issues does.
- Review-loop reviewers and fixers must not request or add coverage; each subplan's Constraints and the dispatch prompt say so verbatim: "Do not add e2e tests; reviewers must not request coverage; fold any missing assertion into an existing journey."
- Operator gate at every merge: `git diff <base>...<branch> --stat -- frontend/tests` plus a read of every added or changed test against the policy; violations go into a fix plan before merge.

### Design policy (mandatory for every user-visible change)

- Before authoring a subplan, the operator reads the relevant `docs/webui-design.md` sections (Keyboard, Tables and filtering, Transaction entry) and `docs/webui-theme-arcade-cabinet.md`, and the planning prompt requires a short design spec in the subplan: placement, states, geometry stability (no layout jumps on focus, hover, or modifier state), theme tokens, keyboard and focus behavior.
- Implementor screenshots of the changed surface are required in the completion report; the operator judges them against the theme doc before merge. Anything jumpy, re-ordering, or styled off-theme is a fix-plan defect, not a nit.
- Focus visuals follow the existing entity-list contract: roving-tabindex row navigation with hover-style row highlight; no focus ring on non-editable surfaces.

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / implementor session at any time. Finish (merge or fail) the current task before starting the next.
- Implementor quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop --plan "<implementation plan path>"`, run by the implementor from the initial implementation plan's Success Criteria. The plan is immutable ground truth for review-loop reviewers and fixers. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
- After the implementor session: the operator runs the review below. Findings warrant at most TWO fix plans per task. Every fix plan MUST state "Do not run review-loop." in its Constraints and omit review-loop from its Success Criteria.
- A task still failing after 2 fix plans: leave the sub-branch unmerged, mark the task failed with findings, then proceed only to a task that is still viable — skip any task that depends on the failed one, directly or transitively. If no viable tasks remain, stop the fleet entirely. Never merge a failing branch; never silently drop scope.
- Environmental failure (toolchain, `gt`, non-resetting quota): stop and ask.
- Before every implementor dispatch: close leaked `agent-browser` sessions and confirm no stale `mina` demo servers hold ports 18080/18081.

### Per-task workflow (referenced by every task below)

1. Setup: from the main working branch, `gt <branch> <main-working-branch> -x true` (worktree lands in `.worktrees/<branch>`). Claim: `kata claim <ref> --comment "Fleet sub-branch <branch>." --agent`.
2. Dispatch `just agent-exec plan -C "<sub-worktree-path>" "<planning prompt>"` to author the implementation plan at `docs/plans/2026-MM-DD-<topic>.md` from `docs/plan_template.md`. Include the following requirements in the prompt: the subplan covers the Kata issue's full feature, component, bug set, or refactor slice and normally decomposes that substantial outcome into multiple sequential tasks and commits; fleet orchestration does not reduce a subplan to a single small task. Include concrete checkboxes, the kata ref, the Testing policy and Design policy text verbatim, the design spec, and only the repository-owned validation commands that provide relevant evidence for the affected behavior (`just pre-commit`, `just test-frontend-e2e`; backend suites only if Go code changes). Initial plans keep the standard Success Criteria including one `just review-loop`. Plans changing user-visible behavior include a PROJECT_STATE.md update item and package-doc updates (`write-package-docs`) where contracts change. Before authoring, the planner reads the owning ground-truth docs for the touched area (`docs/architecture.md`, `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, `docs/FRONTEND-TESTING.md`, and the `PACKAGE.md` of every touched frontend feature). The planner must not implement, run tests, commit, or run review-loop. Wait for the planner to finish, then review, make small adjustments directly or request a planner revision as needed, and commit the plan in the sub-worktree.
3. Dispatch: from the sub-worktree, headless in the background (do not use `just codex-goal` — it fails without a terminal), run exactly:

   ```sh
   just agent-exec implement "Implement <plan_file> end to end. Follow its task order, constraints, and stopping conditions. Success means every applicable checkbox and the plan's success criteria are complete, task commits are created as directed, and the finished plan is moved to docs/plans/completed. The plan file itself is immutable except for ticking checkboxes and the final move to docs/plans/completed. Do not add e2e tests; reviewers must not request coverage; fold any missing assertion into an existing journey. If the plan directs a just review-loop run, invoke it AT MOST ONCE in this session: after that one invocation and its fix commits, the review-loop item is satisfied permanently — never invoke it again, even if findings remain; record unresolved findings in your final report instead. If blocked, leave the affected checkbox open and report the blocker with evidence."
   ```

   Do not touch the worktree while the session runs. Completion signal: plan moved to `docs/plans/completed/` and process exit. Review-loop can take ~10 minutes; use long poll timeouts and do not kill it while heartbeat/progress lines continue.

4. Operator review (each iteration):
   - Sanity: all checkboxes ticked, plan archived, sub-worktree clean, suites reported green.
   - Testing gate: apply the Testing policy operator gate above.
   - Docs governance: `git diff <main-working-branch>...<branch> -- docs/` — implementors and review fixers may make targeted ground-truth doc updates when the implementation genuinely diverged from the documented rule (e.g. a new interaction precedence the doc did not anticipate); broad scope, phasing, or architecture rewrites remain off-limits. The operator judges every doc diff at review: warranted updates stay, unwarranted ones are reverted via a fix plan (or an operator-owned commit for trivial reverts), and the intervention is noted.
   - Architectural audit: read-only subagents over the sub-branch diff against the owning docs; the audit prompt includes the Testing policy and must flag added coverage as a defect; demand file:line evidence and severity.
   - Live verification for anything with a runtime surface: run `just dev --demo`, drive the UI (Playwright or equivalent), screenshot, judge against `docs/webui-design.md` and the theme doc — observed behavior beats checkboxes. This includes the operator's critical high-level architectural and visual UI/UX judgment.
5. Fix loop (max 2 per task): dispatch the `plan` role to author an implementation-only fix plan from the template — file:line defects with live evidence, a "protect — do not regress" list, explicit scope exclusions, "Do not run review-loop." in Constraints, no review-loop in Success Criteria. Review and commit it in the sub-worktree, re-dispatch the `implement` role, re-review.
6. Merge: from the main working branch's worktree, `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`. Trivial conflicts (plans, docs) resolve as operator; implementation conflicts: abort, merge the main working branch into the sub-worktree, hand resolution to Codex via a fix plan (no review-loop), re-review, retry.
7. Cleanup: `git worktree remove .worktrees/<branch>`, `git branch -D <branch>`.
8. Close: `kata close <ref> --done --message "..." --commit <sha> --test "<suites>" --agent` if the session did not already.
9. Rule changes discovered in review go into ground-truth docs first (operator edits, committed separately); long-horizon gaps become new kata issues, not fix-plan items.

### Per-task planning guidance

- Task 1 (`bmcb`): the subplan decomposes into (a) initial first-row focus on entry for every populated table page — Transactions, account registers, Accounts, Categories, Tags, Members, Templates, Recurring — reusing the existing roving-tabindex row contract and preserving row activation, overlay, and focus-restoration behavior; (b) `/` and `Meta+L` list-search focus in the app-shell global shortcut layer, suppressed while typing, inside editable controls, or under blocking overlays, and active only on pages that render a list-search field; (c) page-aware shortcuts-help registration so `/` and `Meta+L` appear only on applicable pages; (d) `docs/webui-design.md` Keyboard bullet and touched `PACKAGE.md` updates. Design spec covers which row is focused on first load versus URL-restored list position, and that focus never scrolls the page or shifts layout.
- Task 2 (`cwxv`): the subplan decomposes into (a) initial-focus change in the entry modal for create: first empty editable field of the active tab (Date for an unanchored blank draft, next empty field for a restored or partially populated draft), leaving edit/split/duplicate initial focus unchanged; (b) modal-scoped `Meta+L` that focuses and opens Start from a template only on tabs with one or more compatible templates, layered above the Task 1 global list-search binding so the global binding never fires inside the modal; (c) preserved template application, draft-replacement confirmation, Esc ladder, and focus restoration; (d) `docs/webui-design.md` Transaction entry focus bullet and `features/ledger/PACKAGE.md` updates. Design spec covers the Date field's focused state on the Arcade Cabinet theme and no frame movement when focus lands.
- Task 3 (`c53m`): the subplan is a small styling slice: align the Templates trailing actions column inset with the shared table action-column rule, verify the responsive collapse into ⋯ and keyboard reach of row actions remain intact, and fix any shared table primitive if the defect lives there rather than in the Templates table alone. No PROJECT_STATE.md update unless a shared primitive changes user-visible behavior elsewhere.

## Tasks

Per-task checklist — every task below runs the full per-task workflow; tick a task only after completing all of:

1. Setup, claim, implementation plan authored and committed (with Testing policy, Design policy, and design spec)
2. Implementor session completed (plan archived, worktree clean, suites green)
3. Operator review passed (testing gate, docs gate, audit, live verification; fix plans used ≤2)
4. Squash-merged into the main working branch; worktree and branch removed
5. Kata issue closed with evidence

Task scope details live in the Kata issues (`kata show <ref> --agent`). Respect the stated dependencies; otherwise run in the listed order.

- [ ] Task 1: `bmcb` — Focus first table row and add slash search shortcut (shared table focus and global shortcut infrastructure; registers `Meta+L` list-search semantics and shortcuts-help entries that Task 2 must not collide with; no blockers) — branch `bmcb-table-focus-search-shortcut`
- [ ] Task 2: `cwxv` — Focus transaction entry on first empty field (entry-modal focus contract plus modal-scoped `Meta+L`; ordered after Task 1 so the modal binding is layered over the committed global list-search binding; no Kata blocker) — branch `cwxv-entry-first-empty-focus`
- [ ] Task 3: `c53m` — Fix Templates table trailing action padding (isolated table styling polish; independent, last so it lands on the final shared table markup from Task 1) — branch `c53m-templates-action-padding`

## Final Verification

- [ ] On the main working branch with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run `just review-loop --plan "<this fleet plan's repo-relative path>"` exactly once and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, Kata refs closed, residual findings and unmerged branches (per-task evidence recorded on each closed Kata issue)
- [ ] Move this plan to `docs/plans/completed/`
