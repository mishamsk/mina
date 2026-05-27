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
  - [ ] `gofmt` applied to edited Go files
  - [ ] Focused boundary scenario tests pass
  - [ ] `go test ./...` passes
  - [ ] Required docs updated

### Commit 2: [commit desc]
- [ ] Task 1
- [ ] ...
- [ ] Task N
- [ ] Verification
  - [ ] `gofmt` applied to edited Go files
  - [ ] Focused boundary scenario tests pass
  - [ ] `go test ./...` passes
  - [ ] Required docs updated

## Deferred Verification

- [ ] True CLI scripts pass when relevant
- [ ] True JSON REST API scripts pass when relevant
- [ ] Release/risky-change smoke tests pass

## Final Verification

- [ ] In-memory boundary scenario suite passes
- [ ] `go test ./...` passes
- [ ] Deferred verification completed or explicitly marked not relevant
