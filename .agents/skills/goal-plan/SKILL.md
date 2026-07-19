---
name: goal-plan
description: "Use when creating implementation plans with the user interactively. Do not use for unattended sessions. Produces sequential, outcome-oriented plans with concrete validation and checkbox items suitable for automated agent execution."
---

# Goal Plan Creation

Create a reliable implementation plan through focused collaboration. Ground the plan in repository evidence, resolve only decisions that materially affect the result, and leave implementation mechanics to the executing agent when the repository already makes them clear.

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
   - Preserve a sequential, multi-task structure.
   - Make each task an independently useful, verifiable outcome and usually one commit.
   - Name affected files, packages, interfaces, state/data flow, failure behavior, tests, docs, and security/privacy considerations only when relevant.
   - Decide which tasks need validation and which exact repository-owned commands provide useful evidence. Do not mechanically repeat broad checks under every task.
   - Keep `review-loop` in the plan-wide Success Criteria by default; omit it only when the user's request explicitly excludes it.
4. Align and write.
   - Share a concise task outline and any material decisions when user confirmation would prevent meaningful rework.
   - Once the plan is sufficiently determined, write it to `docs/plans/YYYY-MM-DD-<topic>.md` and commit the plan.
   - If a material question remains unresolved, record it only when implementation can still proceed safely; otherwise stop and ask.

## Plan Format

```markdown
# Plan: <Short outcome-oriented title> <optional: Kata issue>

<In 1-2 sentences, state the user-visible outcome and what must be true for the plan to be complete.>

## Plan Context

<Include only context that changes implementation: requirements, constraints, chosen decisions, named files or interfaces, state/data flow, failure behavior, privacy/security concerns, and material open questions. Link to owning docs instead of repeating them. Omit categories that do not apply. If the user's request explicitly excludes review-loop, record `Do not run review-loop.` here.>

## Tasks

> Keep a sequential, multi-task structure. Size tasks as small, self-contained commits that are independently verifiable when practical.
> Describe the required outcome and completion evidence for each task; do not prescribe implementation mechanics the executing agent can derive from the repository.
> Add validation to the task(s) where it provides useful evidence. Select repository-owned commands from the affected behavior and guidance; do not mechanically repeat irrelevant checks. Do not include this note in the resulting plan.

### Task 1: [First independently useful outcome]

<State the end state, affected resources or contracts, dependencies, and success criteria.>

- [ ] Deliver <observable implementation outcome>, including required tests and documentation.
- [ ] <Add further outcome, acceptance, or task-specific validation checkboxes only when they change the completion bar.>
- [ ] Commit the task as `<descriptive commit subject>`.

### Task 2: [Next independently useful outcome]

<State how this task builds on the prior task, plus its end state and success criteria. Add further tasks only when they represent distinct, ordered outcomes.>

- [ ] Deliver <observable implementation outcome>, including required tests and documentation.
- [ ] <Add further outcome, acceptance, or task-specific validation checkboxes only when they change the completion bar.>
- [ ] Commit the task as `<descriptive commit subject>`.

## Success Criteria

- [ ] Every task's stated outcome and acceptance conditions are complete.
- [ ] `<Exact repository validation selected for the affected behavior>` passes; omit commands that do not provide relevant evidence.
- [ ] Planned commits are present and the worktree is clean.
- [ ] Unless Plan Context records the user's explicit request to omit it, with a clean worktree run `just review-loop "<short goal; review-relevant constraints and decisions>"`; resolve findings, rerun affected validation, and commit the fixes.
- [ ] Move this plan to `docs/plans/completed/` and commit the move.
- [ ] <If a Kata issue exists, close it with the commits and validation evidence.>
```

## Quality Bar

- Outcome-first: specify what must be true, not an exhaustive coding recipe.
- Evidence-backed: derive scope and decisions from the issue, code, and owning docs.
- Concrete: replace placeholders with named resources, observable behavior, and exact validation.
- Lean: state each requirement once and omit detail that does not change execution.
- Executable: include stopping conditions or open questions when missing evidence would make implementation unsafe or speculative.
