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
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 2: [commit desc]
- [ ] Task 1
- [ ] ...
- [ ] Task N
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

## Deferred Verification

- [ ] `just test-cli` passes when relevant
- [ ] `just test-rest` passes when relevant
- [ ] `just smoke` passes for release or risky changes

## Final Verification

- [ ] `just test-boundary` passes
- [ ] `just test` passes
- [ ] `just pre-commit` passes
- [ ] Deferred verification completed or explicitly marked not relevant
