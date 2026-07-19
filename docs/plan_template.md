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
