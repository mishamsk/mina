---
name: codex-goal-fleet
description: Deliver a whole feature set by splitting a user goal into parallel and sequenced sub-branches, each implemented by a headless Codex session against a committed plan in its own gt worktree, with the main agent as planner, reviewer, and integrator. Use when a goal spans multiple sub-features and the user asks for parallel/multi-branch Codex delivery; for a single committed plan use codex-goal-loop instead.
---

# Codex Goal Fleet

Multi-branch orchestration on top of codex-goal-loop. Read
`.claude/skills/codex-goal-loop/SKILL.md` first; its rules apply inside every
sub-branch. You are the operator: scope, plan, dispatch, review, merge. Codex is
the only implementor — never edit implementation code yourself. Dispatch mimics a
dynamic workflow: waves of background subagents, but every judgment call
(ordering, review verdict, merge) stays with you.

## Roles

- Operator (you, the main agent): goal decomposition, Kata mapping, plan
  authoring, per-branch review, merge judgment, integration, final report.
- Supervisor subagents (Agent tool, `run_in_background`): one per active
  sub-branch. They launch and babysit a Codex session and report raw completion
  state. They never review, never edit files, never merge.
- Codex: all implementation, via committed plan files.

## Stage 0: integration worktree (never on main)

- Verify `gt` is available (`command -v gt`); stop if missing.
- If the current checkout is on `main`, create the integration worktree with
  `gt <feature-branch> main` and run all orchestration from it. If already in a
  non-main worktree, its branch is the integration branch.
- All sub-branches fork from the integration branch and merge back into it.
  Nothing in this skill touches `main`.

## Stage 1: scope and Kata mapping

- Restate the goal; read the mandatory project docs for the areas in scope.
- Find associated Kata tasks with several targeted lexical searches (see the
  kata-tasks skill); inspect strong candidates with `kata show <ref> --agent`.
- Map each in-scope issue to exactly one sub-branch; note issues deliberately
  excluded. For required work with no issue, create one (with idempotency key)
  so every sub-branch has a ledger anchor.

## Stage 2: dependency plan (waves)

- Split the goal into sub-features, each sized for one Codex plan (roughly 1-4
  tasks/commits).
- Build waves: branches with no ordering dependency and no overlap in files or
  APIs run in the same wave; anything consuming another branch's output goes in
  a later wave. Overlapping files means sequence, not parallelize.
- Prefer fewer, well-separated branches over many overlapping ones.
- State the full plan (branches, Kata refs, dependencies, waves) in a progress
  update before dispatching anything.

## Stage 3: per-branch setup (operator, in each new worktree)

For each branch in the current wave:

1. `gt <branch> <integration-branch>` — name it `<kata-ref>-<slug>` when a Kata
   issue exists, else a short slug. Worktrees land under the repo's
   `.worktrees/<branch>` (confirm with `git worktree list`). If `gt` tries to
   open an interactive shell, use `gt <branch> <integration-branch> -x true`.
2. Claim the Kata issue: `kata claim <ref> --comment "Fleet sub-branch <branch>." --agent`.
3. Author the implementation plan yourself in the worktree at
   `docs/plans/YYYY-MM-DD-<topic>.md` from `docs/plan_template.md`: concrete
   checkboxes, the repo's verification commands, the Kata ref. Initial plans
   keep the standard Final Verification including review-loop.
4. Commit the plan in the sub-worktree (plans are operator-owned docs, not
   implementation code).

## Stage 4: dispatch

- Spawn one supervisor subagent per branch in the wave, all in a single message,
  `run_in_background`. Cap concurrent Codex sessions at 3; hold the rest until a
  slot frees.
- Each supervisor prompt must include: the worktree path, the plan file path, an
  instruction to read `.claude/skills/codex-goal-loop/SKILL.md` and follow only
  its "Launch" section (run `just codex-goal <plan_file>` from the worktree,
  `codex exec` fallback, relaunch-once on external usage limits), and to return
  a raw status report: checkbox state, whether the plan moved to
  `docs/plans/completed/`, `git status` and `git log --oneline` for the session
  range, a summary of any `docs/` changes, and test results as reported.
  Explicitly forbid the supervisor from editing files, reviewing, or merging.
- While a branch's session runs, do not touch its worktree.

## Stage 5: review and merge judgment (operator, per completed branch)

Run the codex-goal-loop "Review" section yourself against the sub-branch diff:
sanity, docs governance (revert unauthorized ground-truth edits — always diff
`docs/` after Codex runs), read-only architectural audit subagents, and live
verification when the change has a runtime surface. Then one verdict:

- **Merge**: findings none or trivial → merge (below).
- **Fix loop**: real findings → author a fix plan (below), commit it in the
  sub-worktree, re-dispatch (SendMessage the same supervisor while it is alive,
  else spawn a fresh one). Hard cap: 2 fix loops per branch.
- **Fail**: still broken after the cap, or environmental failure → leave the
  branch unmerged and report it with findings. Never merge a failing branch and
  never silently drop its scope.

## Fix plans

- Implementation-only, from `docs/plan_template.md`: file:line defects with live
  evidence, a "protect — do not regress" list, explicit scope exclusions.
- MUST explicitly instruct Codex not to run `just review-loop` — it is too heavy
  and slow for small fixes. Drop the review-loop items from Final Verification
  and state "Do not run review-loop." in Plan Context.
- Rule changes discovered in review go into ground-truth docs first (your edits,
  committed separately); long-horizon gaps go to Kata, not into fix plans.

## Merge mechanics

From the integration worktree:

1. `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`.
   Never use `gt --merge` — it targets the default branch, not the integration
   branch.
2. Conflicts: trivial ones (plan files, docs) resolve yourself. Implementation
   conflicts: abort the merge, merge the integration branch into the
   sub-worktree, hand the conflict resolution plus verification to Codex via a
   fix plan (no review-loop), re-review, retry the merge.
3. After a successful merge: `git worktree remove .worktrees/<branch>` and
   `git branch -D <branch>`.
4. Close the branch's Kata issue with evidence (`kata close <ref> --done
   --commit <sha> --test ... --agent`) if the Codex session did not already.

## Later waves

Start a branch as soon as everything it depends on is merged into the
integration branch — no full-wave barrier. Re-run Stage 3-5 per branch.

## Final integration

- With all branches merged, on the integration branch: `just test`,
  `just pre-commit`, `just test-integration`, and `just test-frontend-e2e` when
  frontend runtime behavior was touched.
- Run one `just review-loop "<feature-set summary>"` on the integrated result
  only if merges needed conflict resolution or cross-branch interactions were
  not covered by the per-branch review-loops. Unresolved comments become one
  final fix plan (no review-loop), not another review run.
- Do not merge the integration branch into `main` unless the user asked.

## Stop conditions

- Environmental failure (toolchain, `gt`, quota that will not reset soon) →
  stop and ask.
- One branch failing its fix-loop cap does not stop the fleet: finish what can
  be finished, report the rest.

## Report

Lead with the verdict for the whole feature set, then per branch: merged or
failed, fix loops used, live-verification evidence, governance interventions,
Kata refs closed, and residual findings including any unmerged branches.
