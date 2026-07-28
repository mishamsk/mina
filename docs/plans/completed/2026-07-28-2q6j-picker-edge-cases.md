# Plan: Polish segment-completion picker edge cases (Kata `2q6j`)

The eight enumerated residual picker edge cases from the vmp6 review are each re-verified against current code, fixed where they still reproduce, and recorded as already-resolved where they do not — closing the issue with accurate per-item evidence.

## Plan Context

- Kata issue: `2q6j` — "Polish segment-completion picker edge cases" (P3, frontend). The issue body enumerates the residuals; they are the complete scope:
  1. Discarded persisted drafts can briefly show stale picker values until refocus.
  2. In-flight tag creation may affect the next transaction if saving completes first.
  3. Inline flow-account creation may lose focus during lookup refresh.
  4. Late create failures may reopen an unfocused picker.
  5. Restored drafts may temporarily hide inline-created IDs pending lookup refresh.
  6. Breadcrumb tab stops are result-dependent.
  7. Pending-create rows lack the full theme-disabled treatment/tooltip.
  8. Recurring-definition member pickers interpret colon-containing flat names hierarchically — members are flat and must bypass segment derivation entirely (a member named `a:b` is one leaf, never a group path).
- IMPORTANT triage-first rule: the entry-draft lifecycle was reworked on this branch's base (see `docs/plans/completed/2026-07-27-entry-eager-draft.md` and its fix round) — items 1 and 5 in particular may already be resolved or changed shape. For each of the eight: reproduce against current code with `just dev --demo` (or explain concretely why it is unreachable), then fix or record as already-resolved. The closure message lists the disposition of every item.
- Likely area: `frontend/src/features/ledger/entity-picker.tsx` (segment derivation, breadcrumbs, create rows), `entry-panel.tsx` (draft/lookup/create lifecycle), recurring definition editor's member picker wiring. For item 8, the fix belongs at the picker-option/segment-derivation boundary (a flat-entity mode or flat option set), not a recurring-editor special case — member pickers everywhere must treat member names as opaque leaves.
- Design constraints: `docs/webui-design.md` Pickers section is ground truth for segment behavior (its rules assume hierarchical data; flat entity sets are the boundary case item 8 formalizes — if a doc sentence is needed to state that flat entities bypass segment completion, keep it to one line). Theme-disabled treatment for item 7 per `docs/webui-theme-arcade-cabinet.md` (disabled controls: muted outline/glyph, muted fill, `not-allowed`, explanatory tooltip, no hover/press feedback).
- Preserve: all current picker behavior pinned by e2e (segment keys, level browser vs full-path search, inline create flows, multi-select prefix retention, hidden-entity policies), the entry-draft lifecycle contracts from the eager-draft work, and suite greenness.
- Ground truth: `docs/webui-design.md` (Pickers), `docs/webui-theme-arcade-cabinet.md` (`EntityPicker` notes, disabled treatment), `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Triage all eight; fix the state/focus lifecycle items (1–5)

- [x] Reproduce or rule out each of items 1–5 against current code; record per-item disposition in the commit message; fix the ones that reproduce at their root (draft/lookup/create lifecycle), preserving the eager-draft contracts.
- [x] Commit the task as `fix(frontend): resolve picker draft, creation, and focus lifecycle edges`.

### Task 2: Breadcrumb tab stops, pending-create treatment, flat-entity bypass (6–8)

- [x] Fix item 6 (breadcrumb tab behavior must not depend on result contents), item 7 (full theme-disabled treatment + tooltip on pending-create rows), and item 8 (flat entity sets — members — bypass segment derivation everywhere; verify the recurring-definition editor's member picker with a colon-containing member name selects the literal member). Add the one-line doc sentence only if genuinely needed.
- [x] Commit the task as `fix(frontend): flat member pickers, breadcrumb tab stops, pending-create treatment`.

### Task 3: Coverage

- [x] e2e coverage for the items that reproduce and are automatable — at minimum the flat-member colon-name selection (item 8) and the pending-create disabled treatment (item 7); extend existing picker specs rather than duplicating fixtures. Follow `docs/TESTING.md`.
- [x] Commit the task as `test(frontend-e2e): pin picker edge-case fixes`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-28-2q6j-picker-edge-cases.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `2q6j` with `kata close 2q6j --done --message "<per-item disposition of all eight residuals>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
