# <Replace with a short project name/goal description>

## Plan Context

<Add only context needed to understand this plan. Do not repeat project docs.>

## Tasks

> Keep commits small, self-contained, and individually verifiable when practical.
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
  - [ ] <optional. only add if it is a big independent commit: commit and run `just review-loop "<short summary of the task/goal of the commit>" <current commit sha>`>

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
  - [ ] <optional. only add if it is a big independent commit: commit and run `just review-loop "<short summary of the task/goal of the commit>" <current commit sha>`>

## <Optional: Deferred Verification>

- [ ] `just test-integration` passes after CLI, real-network REST, process startup, JSON-over-HTTP, or later TUI changes.
- [ ] Manual smoke commands are run only when a concrete uncovered risk remains, and are added as explicit temporary commands or comments.

## Final Verification

- [ ] `just init` passes on a clean checkout with required local tools available
- [ ] `just fmt` passes
- [ ] `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just review-loop "<short summary of the task/goal of the change>"`
