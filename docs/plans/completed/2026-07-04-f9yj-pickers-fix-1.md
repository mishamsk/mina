# Plan: f9yj intent pickers — operator review fixes (fix plan 1) — Kata issue `f9yj`

Three low-severity operator-audit items on branch `f9yj-intent-pickers`. Implementation-only; the feature is verified live (lazy per-tab `economic_intent` requests, correctly filtered options, hidden excluded server-side) — do not change the fetch/caching design.

## Plan Context

- Do not run review-loop.
- Protect — do not regress: all 40 e2e; per-intent-set store cache and its stale-response semantics; form-stays-visible/draft-preserved behavior; `fetchLedgerLookups` untouched; scoped `categoryLookupRevision`.
- Scope exclusions: no invalidation mechanism for the picker cache (conscious decision — becomes relevant only when inline category create lands), no new features, no ground-truth doc edits, no PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: Retry path, arrow-key coverage, test literal comment

- [x] `frontend/src/features/ledger/use-transactions-resource.ts:160-186` + `entry-panel.tsx`: a failed intent-filtered fetch currently leaves the category picker disabled until the user switches tabs or reopens the panel (effect deps never re-run). Add a lightweight retry path — e.g. re-trigger the fetch for the current intent key when the errored picker (or a small retry affordance next to the surfaced `FieldError`) is activated. Keep it minimal and consistent with existing error display.
- [x] Restore e2e coverage for arrow-key picker driving (design rule: "arrows + `Enter` drive pickers"): one test (or an assertion inside an existing entry test) that highlights a non-first option with `ArrowDown` and selects it with `Enter`.
- [x] `frontend/tests/e2e/transactions-page.spec.ts:1836`: add a one-line comment explaining the intentional `"ransfer"` truncated search text (forces a real search instead of an exact `searchLabel` match) so it does not read as a typo.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
