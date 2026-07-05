---
name: codex-goal-loop
description: Drive a headless Codex implementation session against a plan file, wait for completion, run an authoritative high-level review, and iterate with fix plans. Use when the user asks to implement a committed plan via Codex with supervised review iterations. The user must state how many iterations are allowed before returning for input.
---

# Codex Goal Loop

Supervise Codex as the implementor; you are the reviewer and plan author. Never edit
implementation code yourself — all code changes flow through Codex sessions against
committed plan files.

## Inputs (ask if missing)

- `plan_file`: a committed plan in `docs/plans/` following `docs/plan_template.md`.
- `max_iterations`: how many implement→review→fix-plan cycles are allowed before
  stopping for user input. Never assume; the user must provide it.

## Launch

1. Ensure the worktree is clean and the plan file is committed.
2. Launch headless, tracked in the background — do not use `just codex-goal`, it
   fails without a terminal. Run exactly:

   ```sh
   codex exec --dangerously-bypass-approvals-and-sandbox "/goal implement <plan_file>. Acceptance criteria - all checkboxes are ticked. When done - move file to docs/plans/completed folder. Make sure you go commit by commit, task by task and never jump forward or skip any item."
   ```
3. Do not touch the worktree while the session runs. Completion signal: the plan file
   moves to `docs/plans/completed/` and the process exits. If the session dies on an
   external usage limit, schedule a timed background wait until the stated reset time
   and relaunch once.

## Review (each iteration, after completion)

1. Sanity: all plan checkboxes ticked, plan archived, worktree clean, test suites
   reported green.
2. Governance: `git log --oneline -- docs/` for the session's range. Review fixers must
   not change scope, phasing, or UX/architecture rules in ground-truth docs. Revert
   unauthorized ground-truth edits yourself (docs are reviewer-owned) and tell the user.
3. Architectural review: launch read-only audit subagents over the session's diff
   against the owning ground-truth docs (architecture, design/UX, theme, package
   boundaries). Demand file:line evidence and severity per finding.
4. Live verification when the change has a runtime surface: run the app (e.g.
   `just dev --demo`), drive it (Playwright or equivalent), screenshot, and judge
   against the specs — never trust checkboxes over observed behavior.

## Fix plan (if findings warrant another iteration)

- Write a new implementation-only plan from `docs/plan_template.md`: file-referenced
  defects with live evidence, a "protect — do not regress" list of verified behaviors,
  and explicit scope exclusions.
- The initial plan runs the one allowed `just review-loop` (in its Final Verification).
  Every fix plan MUST forbid it: state "Do not run review-loop." in the plan's Plan
  Context and omit review-loop from its Final Verification. Fold any unresolved
  review-loop comments into fix plans yourself — never let Codex re-run review-loop.
- Rule changes discovered during review go into the ground-truth docs first (your
  edits, committed separately); the plan then references them as already-committed.
- Long-horizon gaps go to the issue ledger (Kata), not into plans or design docs.
- Commit the plan, relaunch Codex on it, repeat.

## Stop conditions

- Findings are trivial or none → report convergence with evidence.
- `max_iterations` reached → report all residual findings; do not launch another
  session without user input.
- Environmental failure (toolchain, quota that won't reset soon) → stop and ask.

## Report (every iteration)

Lead with the verdict, then: what was verified live (with evidence), findings by
severity, governance interventions, plan/commit refs, and what the next iteration
covers or why the loop is done.
