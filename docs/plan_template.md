# Plan: <Replace with a short project name/goal description> <optional: Kata issue>

<Brief description of the feature and overall goal - the overview section>

## Plan Context

<Add only context needed to understand this plan. Do not repeat project docs.>

## Tasks

> Keep tasks/commits small, self-contained, and individually verifiable when practical.
> Make sure that review-loop steps always come after committing.
> Do not include this note in the resulting plan.

### Task/Commit 1: [First Task Title]

<2-4 sentences of context: what this task accomplishes, key components involved, what becomes possible after this task completes>

- [ ] Implement X
- [ ] ...
- [ ] Add tests for Y
- [ ] Verification
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] <OPTIONAL, only when touched behavior affects CLI, real-network REST, process startup, JSON-over-HTTP behavior, UI: `just test-integration` passes>
  - [ ] <OPTIONAL, if a Kata issue exists: update progress in the Kata issue>
  - [ ] Commit changes
  - [ ] <OPTIONAL, only add if it is a big independent commit: with a clean worktree, run `just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>" <current commit sha>`>

### Task/Commit 2: [Second Task/Commit Title]

<Context for task 2...>

- [ ] Implement Z
- [ ] ...
- [ ] Update documentation
- [ ] Verification
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] <OPTIONAL, only when touched behavior affects CLI, real-network REST, process startup, JSON-over-HTTP behavior, UI: `just test-integration` passes>
  - [ ] <OPTIONAL, if a Kata issue exists: update progress in the Kata issue>
  - [ ] Commit changes
  - [ ] <OPTIONAL, only add if it is a big independent commit: with a clean worktree, run `just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>" <current commit sha>`>

## Final Verification

- [ ] `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] Commit final changes
- [ ] Run `just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>"`
- [ ] Move this plan to `docs/plans/completed/`
- [ ] <optional: If a Kata issue exists, close it after the plan is moved to completed>
