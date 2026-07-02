# <Replace with a short project name/goal description> <optional: Kata issue>

## Plan Context

<Add only context needed to understand this plan. Do not repeat project docs.>

## Tasks

> Keep commits small, self-contained, and individually verifiable when practical.
> Run review-loop only after committing.
> Do not include this note in the resulting plan.

### Commit 1: [commit desc]
- [ ] Task 1
- [ ] ...
- [ ] Task N
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test` passes
  - [ ] `just test-integration` passes when touched behavior affects CLI, real-network REST, process startup, JSON-over-HTTP behavior, or later TUI behavior
  - [ ] `just pre-commit` passes
  - [ ] <optional: Required docs updated>
  - [ ] <optional: If a Kata issue exists, update progress>
  - [ ] Commit changes
  - [ ] <optional. only add if it is a big independent commit: with a clean worktree, run `just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>" <current commit sha>`>

### Commit 2: [commit desc]
- [ ] Task 1
- [ ] ...
- [ ] Task N
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test` passes
  - [ ] `just test-integration` passes when touched behavior affects CLI, real-network REST, process startup, JSON-over-HTTP behavior, or later TUI behavior
  - [ ] `just pre-commit` passes
  - [ ] <optional: Required docs updated>
  - [ ] <optional: If a Kata issue exists, update progress>
  - [ ] Commit changes
  - [ ] <optional. only add if it is a big independent commit: with a clean worktree, run `just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>" <current commit sha>`>

## <Optional: Deferred Verification>

- [ ] `just test-integration` passes after CLI, real-network REST, process startup, JSON-over-HTTP, or later TUI changes.
- [ ] Manual smoke commands are run only when a concrete uncovered risk remains, and are added as explicit temporary commands or comments.

## Final Verification

- [ ] `just init` passes on a clean checkout with required local tools available
- [ ] `just fmt` passes
- [ ] `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] Commit final changes
- [ ] Run `just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>"`
- [ ] Move this plan to `docs/plans/completed/`
- [ ] <optional: If a Kata issue exists, close it after the plan is moved to completed>
