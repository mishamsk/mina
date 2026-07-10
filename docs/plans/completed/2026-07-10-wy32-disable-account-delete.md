# Plan: Disable ineligible account deletion in the edit panel (`wy32`)

Gate the accounts edit-panel Delete button on the existing `account.deletable` signal: ineligible accounts render it muted with `aria-disabled="true"` and an explanatory tooltip, and activation never opens the confirmation dialog. Eligible deletion is unchanged. No API work; no rule re-derivation.

## Plan Context

- Ground truth: `docs/webui-design.md` (disabled delete with explanatory tooltip when the node cannot be deleted); `docs/webui-theme-arcade-cabinet.md` (disabled affordance: muted outline/glyph, no press feedback).
- Current defect (ACC-2 audit, Kata `wy32`): the accounts table row action already honors `account.deletable` (`frontend/src/features/accounts/accounts-tree.tsx:692-694`), but the edit side-panel Delete button (`frontend/src/features/accounts/accounts-side-panel.tsx:~850`) opens the confirmation regardless.
- Template to mirror exactly: the members side-panel Delete gating delivered for Kata `47f4` (`frontend/src/features/members/members-side-panel.tsx:383-408`): Tooltip wrapper whose label switches to the explanatory reason when disabled, `aria-disabled` (button stays focusable per the WAI-ARIA disabled pattern and the panel focus trap), muted className overrides, and an `onClick` early-return gate. Improvement over that template (known review finding): also neutralize the destructive variant's `hover:bg-destructive/90` and the base `active:` press-in translate so the disabled button shows no hover fill or press animation — mirror the neutralization used by disabled `RowActions` buttons (`frontend/src/components/row-actions.tsx:43-45`).
- Copy: "Account has active dependent records." — identical to the accounts row-action `disabledReason`.
- The only eligibility signal is `account.deletable !== true`; do not re-derive dependency rules. A stale `deletable=true` still falls through to the existing confirmation + API error handling.
- Protect — do not regress: eligible account delete flow (panel confirmation, DELETE call, refresh, notice) and the row-action delete flow with its dialog; panel focus trap and `accountDeleteButtonRef` focus restore; credit-limit management in the same panel; existing `accounts-page.spec.ts` coverage.
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `wy32`.

## Tasks

### Task/Commit 1: Gate the edit-panel Delete on deletable

- [x] Wrap the edit-panel Delete button with the eligibility gate: `aria-disabled="true"`, muted styling with hover/active neutralization, tooltip "Account has active dependent records." when `account.deletable !== true`; `onClick` early-return so the confirmation never opens; eligible accounts unchanged.
- [x] Extend `frontend/tests/e2e/accounts-page.spec.ts`: an account with dependent records (real transaction via API against a seeded/created account) opens its edit panel and shows a disabled Delete with `aria-disabled="true"` and the tooltip; clicking (forced) and keyboard-activating it opens no confirmation; an eligible account still deletes through the panel confirmation successfully.
- [x] Update `PROJECT_STATE.md` only if it currently misstates account deletion behavior (likely no change — this closes a gap in behavior the state doc already implies).
- [x] Update the accounts package doc only if a non-obvious contract emerges (a one-line "deletable consumed verbatim" bullet mirroring members/categories/tags PACKAGE.md is appropriate if absent).
- [x] Add Kata `wy32` progress and verification evidence.
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
- [x] Run `just review-loop "Disable ineligible account deletion in the edit panel from the existing deletable signal, mirroring the members panel gating with full hover/active neutralization; eligible flows unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `wy32` only after the plan is moved to completed
