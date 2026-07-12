# Plan: Fix plan 1 for themed dropdown adoption — unblock e2e (Kata d9hq)

Unblock the d9hq branch: the implementation commits (`9fb7cb3d`, `1abb0119`) are correct, but `just test-frontend-e2e` fails on two pre-existing, geometry-marginal chromium specs, so the original plan's Task 2 e2e checkbox and Final Verification are unfinished. Fix the fragile specs, then finish the original plan's remaining checkboxes.

## Plan Context

- Do not run review-loop.
- Operator diagnosis (verified): the two failures reproduce IDENTICALLY on the pre-implementation baseline commit (`351f4210`), so they are NOT caused by the themed Select adoption. Root cause: with a side-panel editor open (`categories-side-panel`, fixed right, `w-[min(520px,...)]`, z-50), a full-width table row's hover/click target sits underneath the panel; chromium font metrics put the row center inside the panel bounds so `row.hover()` is intercepted forever ("subtree intercepts pointer events"); webkit metrics happen to fall outside. These specs passed marginally when authored.
- Failing specs (chromium):
  - `frontend/tests/e2e/categories-page.spec.ts:67` — "category row delete closes the matching open editor" (`row.hover()` at `:85` while the editor panel is open).
  - `frontend/tests/e2e/categories-page.spec.ts:490` — "categories side panel creates edits and deletes categories with conflict feedback" (same interception pattern where a row action is pointer-driven while the panel is open).
- Fix direction (decided): drive row actions with the KEYBOARD wherever a side panel is open — focus the row (`row.focus()`), Tab to the target row-action button, activate with Enter/Space, asserting the action button is focused before activation. This avoids pointer interception, matches the app's keyboard-reveal support, and keeps the specs honest (do NOT use `.click({ force: true })` and do NOT close the panel first — the panel-open state is the point of these tests).
- Harden the SAME pattern proactively where the equivalent editor-open + row-action interaction exists in `frontend/tests/e2e/tags-page.spec.ts` and `frontend/tests/e2e/members-page.spec.ts` (added alongside the categories specs) — they currently pass only by metric luck.
- Protect — do not regress:
  - The two implementation commits (`select.tsx` primitive, all seven adoption sites, the six rewritten selectOption interactions, the themed-listbox smoke assertion) stay exactly as committed.
  - All other e2e specs stay untouched.
  - No product/source code changes under `frontend/src/` — this fix plan is spec-only.
- Scope exclusions: do not redesign row-action reachability under open panels (reference-table layout tasks own that); do not touch ground-truth docs; do not modify the Justfile or playwright config.
- After the spec fixes, complete the ORIGINAL plan `docs/plans/2026-07-11-themed-dropdown-adoption.md`: tick its remaining checkboxes (Task 2 e2e, Final Verification EXCEPT its review-loop item — mark the review-loop item as intentionally skipped per operator fix-plan rules with a one-line note), and move it to `docs/plans/completed/`.

## Tasks

### Task/Commit 1: Keyboard-driven row actions in panel-open specs

Partially implemented in the working tree by the previous session (uncommitted) — review, finish, and commit that work.

- [x] Fix the panel-open pointer interceptions in `categories-page.spec.ts` (row-delete-closes-editor spec and the panel-open row interactions of the conflict spec) per the keyboard direction in Plan Context.
- [x] Harden the equivalent panel-open row-action interactions in `tags-page.spec.ts` and `members-page.spec.ts` the same way.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `d9hq` (`kata comment d9hq --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Align the categories/tags delete-conflict specs with gated deleteability

Operator diagnosis (verified on the integration branch itself — this failure pre-dates this sub-branch and both engines fail): the merged ConfirmDialog consolidation added deleteability gating to the categories/tags side-panel Delete buttons (`categories-side-panel.tsx:449-470`: `aria-disabled` + click guard + tooltip "Category has active dependent records." when `category.deletable !== true`), matching the existing members/accounts panel pattern. The specs "categories side panel creates edits and deletes categories with conflict feedback" (`categories-page.spec.ts:490`, Groceries section at `:596-620`) and the tags equivalent (its `Cash` section) still expect the OLD behavior — clicking panel Delete on a demo entity with dependents and asserting a 409 conflict in the dialog. That click now times out ("element is not enabled"). The gating is the intended product behavior; update the specs:

- [x] Replace the `Food:Groceries` (categories) and `Cash` (tags) conflict sections: assert the panel Delete button is `aria-disabled` with the dependent-records tooltip (mirroring the members deleteability assertions in `members-page.spec.ts`), instead of clicking it.
- [x] Preserve genuine API-conflict (409-in-dialog) coverage by staging a stale-deletability race in each spec: create a fresh entity via API (deletable), open its edit panel (Delete enabled), then create a dependent resource via API (e.g. a transaction referencing it) WITHOUT refreshing the page, click Delete + confirm, and assert the 409 conflict message surfaces in the dialog. This keeps the original spec intent (conflict feedback path) reachable and honest.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (full suite green in chromium and webkit)
  - [x] Update progress in Kata issue `d9hq` (`kata comment d9hq --agent ...`)
  - [x] Commit changes

### Task/Commit 2b: Advanced-journal layout spec — exclude Radix's hidden native select from control measurement

Operator authorization (supersedes the "all other e2e specs stay untouched" protection for exactly this change): the advanced-journal layout assertion (`transactions-page.spec.ts:4107`, measurement block `:4075-4104`) computes `minControlWidth` over all form controls, filtering only `display:none`/`visibility:hidden`. Radix Select renders a visually-hidden native `<select>` (clip-positioned, ~1px wide, `aria-hidden`) next to the visible trigger, so the measurement now includes a 1px control and fails deterministically in both engines. This is a legitimate consequence of the posting-status Select swap.

- [x] Update ONLY the measurement filter in that spec to exclude visually-hidden/`aria-hidden` elements (e.g. skip elements that are `aria-hidden="true"` or have an ancestor with `aria-hidden="true"`, or skip `select[tabindex="-1"]`), so it measures the VISIBLE controls including the new posting-status trigger.
- [x] Keep the `>= 120` assertion intact. If the visible posting-status trigger itself measures under 120px (the themed trigger is `w-fit` where the old native select stretched), fix the TRIGGER WIDTH in `entry-panel.tsx` (make it fill its field column like the old select) rather than weakening the assertion — the spec guards real layout.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (full suite green in chromium and webkit)
  - [x] Commit changes

### Task/Commit 3: Finish the original plan

- [x] Tick the remaining checkboxes of `docs/plans/2026-07-11-themed-dropdown-adoption.md` (annotating the skipped review-loop item as intentionally skipped per operator fix-plan rules), and move that plan to `docs/plans/completed/`.
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
