# Plan: <Short outcome-oriented title> <optional: Kata issue>

## Goal

<In a short paragraph, state the high-level outcome this plan will achieve.>

- <Optional concrete deliverable; remove this list when none are needed.>

## Constraints

- <Include only hard scope boundaries, prohibitions, immovable decisions, or compatibility, security, and permission requirements.>
- <If review-loop is prohibited, write `Do not run review-loop.`>

## Success Criteria

- [ ] <State the observable final outcomes and evidence that prove the goal is complete.>
- [ ] `<Only repository validation commands that provide relevant evidence>` pass.
<Include the review-loop item below only when Constraints do not prohibit it.>

- [ ] From a clean worktree, run `just review-loop --plan "<this plan's repo-relative path>"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] <If a Kata issue exists, close it with the commits and validation evidence.>
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

<Use tasks only when ordered steps make the work clearer or safer. Omit this section for a single cohesive change. Add one block per distinct outcome and do not repeat plan-wide goals, constraints, or success criteria.>

### Task 1: <Outcome>

<Describe this task's scope and only the local constraints or important details that are not clear from the goal.>

- [ ] <State the evidence that proves this task is complete.>
- [ ] <Add task-local validation only when it provides useful evidence.>
- [ ] Commit as `<descriptive commit subject>`.
