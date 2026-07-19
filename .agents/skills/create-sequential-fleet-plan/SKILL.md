---
name: create-sequential-fleet-plan
description: Find existing Kata issues relevant to a user-provided goal, inspect and dependency-order the issue set, render it into a dated sequential fleet plan from the bundled template, and commit the plan on an appropriate working branch. Use when the user asks to prepare, create, or commit a fleet plan that an operator can execute one Kata task at a time.
---

# Create Sequential Fleet Plan

Create and commit a self-contained operator plan. Do not implement or claim any Kata
issue while preparing the fleet.

## Workflow

1. Read `AGENTS.md` and `docs/architecture.md` before changing repository files.
2. Verify the required tools:

   ```sh
   command -v git
   command -v gt
   command -v kata
   ```

   Stop on an environment or tool failure. Do not work around it.

3. Derive a concise lowercase hyphenated `<topic>` from the user's description.
   Fleet plan names must match exactly:

   ```text
   docs/plans/YYYY-MM-DD-<topic>-fleet.md
   ```

   Use the current local date. Choose a more specific topic if that path already
   exists; do not overwrite a plan.

4. Choose the working branch before writing the plan:
   - If the current branch is not `main`, stay in the current worktree and commit
     only the new fleet plan there.
   - If the current branch is `main`, verify the current worktree has no tracked
     changes, create `fleet-<topic>` from `main`, and keep all work in its `gt`
     worktree:

     ```sh
     gt "fleet-<topic>" main -x true
     ```

     Locate the created worktree with `git worktree list --porcelain`, then run all
     remaining commands from it. Never commit a fleet plan directly to `main`.
   - If unrelated staged changes exist in the chosen worktree, stop and ask before
     committing. Preserve unrelated unstaged and untracked files.

5. Find existing Kata issues that materially contribute to the user's goal:
   - Inspect every direct issue ref from the user with `kata show <ref> --agent`.
   - Otherwise run `kata search "<user description or concise query>" --agent`.
     Use additional narrower searches only when the description contains distinct
     sub-goals that one search cannot represent.
   - Inspect plausible matches with `kata show <ref> --agent`. Use
     `kata ready --agent` and `kata list --status all --agent` when needed to resolve
     readiness, dependency, parent/child, or completion state.
   - Select only open issues with a strong scope match. Prefer actionable leaf
     issues over a parent that merely summarizes the same children. Do not create,
     edit, claim, or close issues.
   - If no strong match exists, or materially different issue sets remain equally
     plausible after inspection, stop and present the evidence instead of guessing.

6. Order the selected issues for strictly sequential delivery:
   - Topologically order explicit blockers before their dependents.
   - Treat a blocker already completed outside the fleet as satisfied and mention it
     in the dependent's ordering note rather than adding it as a task.
   - Among otherwise independent issues, put shared contracts and backend/API work
     before consumers, then foundational UI/infrastructure before feature polish.
   - Preserve priority and the user's stated order when no stronger dependency or
     integration reason applies.
   - Do not include an issue whose unresolved blocker is outside the selected fleet
     unless the plan clearly marks the task as conditional and orders it after that
     blocker can be satisfied.

7. Copy `assets/sequential-fleet-plan-template.md` to the dated plan path. Replace
   every instruction marked `<Replace ...>` and replace the example Kata task block
   with one unchecked task per selected issue. Use exact issue refs and titles,
   unique `<ref>-<slug>` branch names, scope classification, explicit dependencies,
   and short ordering rationale. Remove all template-only instructional notes.
   Preserve the rest of the operator workflow and keep every plan checkbox unchecked.

8. Review the rendered plan:
   - The filename matches `YYYY-MM-DD-<topic>-fleet.md` and remains directly under
     `docs/plans/`.
   - The overview states the user's goal and the Kata selection query or selector.
   - Every selected issue appears exactly once and every named dependency exists,
     is already satisfied, or is explicitly conditional.
   - The task order is executable from top to bottom with exactly one active
     sub-branch at a time.
   - No `<Replace ...>` instructions, example tasks, completed checkboxes, or stale
     scope from the template remain.
   - The implementor command uses `gpt-5.6-sol` with `high` reasoning.

9. Stage only the new plan and commit it:

   ```sh
   git add -- "docs/plans/YYYY-MM-DD-<topic>-fleet.md"
   git commit -m "docs: add <topic> sequential fleet plan"
   ```

   Do not run tests or `just review-loop` for this plan-only documentation commit.

## End State

- A committed `docs/plans/YYYY-MM-DD-<topic>-fleet.md` exists.
- The plan contains a dependency-safe sequence of existing Kata issues.
- Work stays on the pre-existing work branch, or on `fleet-<topic>` when invoked
  from `main`.
- No Kata issue is mutated and no implementation work is performed.
