# Plan: Disable ineligible member deletion before confirmation (`47f4`)

Consume the Member `deletable` API capability in the members UI: when a member is not deletable, the Delete affordances render disabled with an explanatory tooltip and never open the confirmation dialog. Eligible members keep the existing named-confirmation delete flow unchanged.

## Plan Context

- Ground truth: `docs/webui-design.md` — button-class row actions may be "delete disabled with an explanatory tooltip when the node cannot be deleted" (accounts already do this); `docs/webui-theme-arcade-cabinet.md` — disabled row actions use muted outline/glyph with tooltip.
- API capability exists (Kata `hafw`): Member responses expose optional `deletable` (`frontend/src/api/generated/types.gen.ts`); the members store snapshot carries raw `Member` objects, so the field flows to the UI without store changes.
- Established consumption pattern to mirror: `frontend/src/features/accounts/accounts-tree.tsx:692-694` — `disabled: account.deletable !== true` with `disabledReason: "Account has active dependent records."`. The shared `RowActions` component already renders disabled buttons with `aria-disabled="true"`, muted styling, tooltip = `disabledReason`, and ignores activation (`frontend/src/components/row-actions.tsx`).
- Surfaces to cover: (1) the member row Delete action (`frontend/src/features/members/members-page-content.tsx`); (2) the member editor side-panel Delete button (`frontend/src/features/members/members-side-panel.tsx`) — no other fleet task covers the member panel (the analogous account-panel task `wy32` is accounts-only), and leaving it enabled while the row action is disabled would be an inconsistent surface. Both must consume `deletable !== true` verbatim — do not duplicate or re-derive dependency rules in the frontend.
- Disabled copy: match the accounts wording style; use "Member has attributed records." (or closely equivalent) consistently across both surfaces.
- Protect — do not regress: eligible-member delete flow (row action and side panel, named confirmation, DELETE call, refresh, notice) and its e2e coverage in `frontend/tests/e2e/members-page.spec.ts`; whole-row edit activation; Edit action; fit-based fold contract (`reference-row-actions.spec.ts`); the in-dialog API-error rendering (a 409 on an eligible-looking member must still render, since `deletable` is advisory).
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `47f4`.

## Tasks

### Task/Commit 1: Disable ineligible member Delete affordances

Wire `deletable` into the member row Delete action and the side-panel Delete button, with e2e coverage for both the disabled and still-working eligible paths.

- [x] Member row Delete action: `disabled: member.deletable !== true` with the explanatory `disabledReason`; activating it (mouse or keyboard) does not open the confirmation dialog; disabled state carries `aria-disabled="true"` and the tooltip.
- [x] Side-panel Delete button: same eligibility gate and explanatory tooltip; activation is inert when ineligible; eligible flow unchanged.
- [x] No frontend re-derivation of dependency rules — the only signal is the API `deletable` field.
- [x] Extend `frontend/tests/e2e/members-page.spec.ts`: a member with dependent records (create a member and a transaction attributing them via API) shows a disabled Delete with `aria-disabled="true"` and the explanatory tooltip on the row action, clicking/keyboard-activating opens nothing, and the side-panel Delete is likewise disabled; an eligible member still deletes through the named confirmation successfully.
- [x] Update `PROJECT_STATE.md` with a one-line note that ineligible member deletion is proactively disabled from the API deleteability signal.
- [x] Update the members package doc only if a non-obvious contract emerges.
- [x] Add Kata `47f4` progress and verification evidence.
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
- [x] Run `just review-loop "Disable ineligible member deletion from the API deletable signal on the row action and side panel; keep eligible delete flows, tooltips, aria-disabled semantics, and existing members e2e intact"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `47f4` only after the plan is moved to completed
