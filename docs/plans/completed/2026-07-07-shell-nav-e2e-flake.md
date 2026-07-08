# Plan: Fix flaky shell navigation e2e nav-link assertions (Kata dmta)

Test-only, single-test fix. In `frontend/tests/e2e/status-page.spec.ts`, the test `shell renders and navigates between routed pages` asserts `getByRole("link", { name: "Overview" })` (and `"Transactions"`) unscoped. Playwright's `getByRole` name matching is case-insensitive substring, so when the Overview recent-activity list has rendered rows whose accessible names contain "overview" (the `overview-page.spec.ts` fixtures use memos like "E2E overview month income"), three links match and strict mode fails. The failure is timing-dependent (async recent-activity render) and webkit-flaky.

## Plan Context

- Do not run review-loop.
- Fix exactly one test: scope the sidebar nav-link assertions the same way the adjacent assertion on line 168 already scopes the "New transaction" button (`page.getByLabel("Primary")...`), or use `exact: true` — whichever matches the file's existing conventions. Audit the SAME test for any other unscoped `getByRole("link", ...)` assertions with substring-collision potential and give them the same treatment; touch nothing else.
- No production code, no other test files, no docs.

## Tasks

### Task/Commit 1: Scope the nav-link assertions

- [x] Fix the `Overview`/`Transactions` (and any sibling) nav-link assertions in `shell renders and navigates between routed pages` per Plan Context
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata dmta
  - [x] Commit changes

## Final Verification

- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata dmta with evidence
