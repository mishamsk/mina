# Plan: Fix plan 1 for record editing — member editor interception (Kata 4xb9)

Unblock the 4xb9 branch: implementation and review follow-ups are committed, but the final e2e gate fails — the new "expanded records edit per-record values and escalate structural changes" spec times out in BOTH engines and its stranded fixtures break two downstream specs (server pagination controls at `transactions-page.spec.ts:870`, help/leaf chips at `:2810`).

## Plan Context

- Do not run review-loop.
- Operator diagnosis (verified, deterministic both engines): at `transactions-page.spec.ts:822` the spec clicks the member editor's "Clear member" button while the member PICKER POPOVER is open; the popover subtree ("Record editor …" option label) intercepts the pointer, the click retries for 90s, the test times out, and its fixtures stay in the shared demo DB, failing the two later specs. The tags editor had the same problem and was fixed spec-side by closing the picker before removal (`dc457dc6`) — the member path was missed.
- Fix BOTH layers:
  1. Spec: close/dismiss the member picker before activating "Clear member" (mirror the tags fix), and make the record-editing spec resilient enough that a mid-test failure cannot strand state that breaks unrelated specs where cheap (e.g. unique fixture scoping like other specs use — the two downstream specs failed only because of the timeout leftovers; unique scoping may already suffice once the timeout is fixed).
  2. Product (small): if "Clear member" is genuinely unreachable by pointer while the picker popover is open, adjust the editor layout/z-order so the clear affordance is not covered by its own popover (a real user shouldn't need to know to close the popover first). Keep it minimal; no redesign.
- Protect — do not regress: all committed work on this branch, the tags/category editors, every other spec.
- After the fix: full suite green both engines. The original plan is already archived — no bookkeeping needed beyond kata progress.
- No ground-truth doc edits.

## Tasks

### Task/Commit 1: Fix member-editor clear interaction and stabilize the spec

- [x] Implement per Plan Context (spec-side close-before-clear + minimal product layering fix if the pointer path is genuinely blocked).
- [x] Full suite green in chromium and webkit.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `4xb9` (`kata comment 4xb9 --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
