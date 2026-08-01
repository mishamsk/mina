---
name: goal-plan
description: "Use when creating implementation plans with the user interactively. Do not use for unattended sessions. Produces lean, sequential, outcome-oriented plans with explicit constraints, completion evidence, relevant validation, and task decomposition only when useful."
---

# Goal Plan Creation

Create a reliable implementation plan through focused collaboration. Ground the plan in repository evidence, assess plausible implementation approaches far enough to identify scope and guardrail constraints, resolve only decisions that materially affect the result, and avoid prescribing mechanics the executing agent can derive from the repository.

## Constraints

- This is plan-only work. Inspect the repository and issue ledger, but do not implement, run implementation validation, or make unrelated changes.

## Workflow

1. Ground the request.
   - Read the repository guidance and owning product, architecture, semantic, API, and package docs.
   - Inspect current code, relevant tests, recent changes, and the Kata issue when one exists.
   - Identify the requested outcome, constraints, approval boundaries, completion bar, and validation requirements.
2. Resolve material decisions.
   - Infer details that repository evidence answers clearly.
   - Ask the smallest useful question only when the answer would materially change scope, architecture, behavior, or acceptance.
   - Offer alternatives only when there is a real tradeoff; lead with the recommended choice and its evidence.
3. Shape the work.
   - Keep plan execution sequential. Split it into tasks only when distinct ordered outcomes make execution clearer or safer.
   - Make each task an independently useful, verifiable outcome.
   - Assess plausible implementation approaches far enough to identify scope boundaries, foreseeable over-engineering, and task-local constraints; do not prescribe an approach when the repository and plan constraints leave several valid choices.
   - Name affected files, packages, interfaces, state/data flow, failure behavior, tests, docs, and security/privacy considerations only when relevant.
   - Decide which tasks need validation and which exact repository-owned commands provide useful evidence. Do not mechanically repeat broad checks under every task.
   - Keep `review-loop` in the plan-wide Success Criteria by default; omit it only when the user's request explicitly excludes it.
4. Align and write.
   - Share a concise task outline and any material decisions when user confirmation would prevent meaningful rework.
   - Once the plan is sufficiently determined, write it to `docs/plans/YYYY-MM-DD-<topic>.md` and commit the plan.
   - If a material question remains unresolved, record it only when implementation can still proceed safely; otherwise stop and ask.

## Quality Bar

- Outcome-first: specify what must be true, not an exhaustive coding recipe.
- Evidence-backed: derive scope and decisions from the issue, code, and owning docs.
- Concrete: replace placeholders with named resources, observable behavior, and exact validation.
- Lean: state each requirement once and omit detail that does not change execution.
- Executable: include stopping conditions or open questions when missing evidence would make implementation unsafe or speculative.

## Plan Format

```markdown
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
```
