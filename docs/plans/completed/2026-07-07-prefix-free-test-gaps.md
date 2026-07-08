# Plan: Prefix-free API-boundary test gaps — tombstone exemption and lookalike boundary (Kata 9w1s)

Test-only task closing the coverage gaps left by 5w9q: the tombstone exemption and the segment-boundary lookalike case are app-tested only for accounts, while categories, tags, and transaction templates each have independent active-filtering code paths gating the same behavior. No production code changes.

## Plan Context

- Owning docs: `docs/hierarchy-semantics.md` (Model: tombstoned rows exempt from the prefix-free rule; `Food` prefixes `Food:Dining`, not `Foodie`), `docs/TESTING.md` (app-tests through the generated REST client only, per-test schemas, no SQL).
- Existing precedents to mirror, one per gap: `TestAccountAllowsHierarchyPrefixReuseAfterTombstone` (create at and under a tombstoned FQN succeeds) and the accounts lookalike case (`...Leafish:Child` created while `...Leaf` is active) in `internal/apptest/runtime/account_test.go`. Follow each entity's existing test file conventions (`category_test.go`, `tag_test.go`, `transaction_template_test.go`) and reuse their existing create/delete helpers; add helpers only if two or more tests share setup.
- Per entity (categories, tags, transaction templates), add coverage for exactly two behaviors:
  1. Tombstone exemption: create a leaf, tombstone it, then creating at the same FQN and under it (child path) both succeed with 201.
  2. Lookalike boundary: with leaf `X:Leaf` active, creating `X:Leafish:Child` succeeds with 201 (no false prefix conflict).
- Templates need a valid referenced category for records; use the file's existing fixture helpers.
- Keep it narrow: no production code, no new test scaffolding beyond the above, no reworking existing tests, no docs changes.

## Tasks

### Task/Commit 1: Add the six missing app-test cases

- [x] Categories: tombstone-exemption test and lookalike-boundary test in `internal/apptest/runtime/category_test.go`
- [x] Tags: same two cases in `internal/apptest/runtime/tag_test.go`
- [x] Transaction templates: same two cases in `internal/apptest/runtime/transaction_template_test.go`
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata 9w1s
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Test-only: add tombstone-exemption and lookalike-boundary prefix-free app-tests for categories, tags, and transaction templates, mirroring the existing accounts tests; constraints: no production code changes, REST-client-only fixtures per docs/TESTING.md, narrowest possible diff"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata 9w1s with evidence
