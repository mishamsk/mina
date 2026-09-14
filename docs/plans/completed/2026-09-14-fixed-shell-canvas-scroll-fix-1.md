# Plan: Fixed-shell canvas-scroll review fixes (Kata k2gk, fix pass 1)

## Goal

Resolve the operator-review findings on branch `k2gk-fixed-shell-canvas-scroll` without regressing the delivered fixed-shell contract: the single-account summary card must sit flush with the register beneath it while keeping its keyboard focus ring visible, and the shadow-reservation class literal must have one owner.

## Constraints

- Do not run review-loop.
- Implementation-only; do not edit `docs/webui-design.md`, `docs/architecture.md`, `docs/frontend-architecture.md`, or completed plans.
- Protect, do not regress: zero window vertical overflow on every roomy fixed route at 1280×633 (verified by the operator on Transactions, Accounts, account and group registers, Categories, Tags, Members, member drill-down, Templates, Recurring, Status, Settings); route-level scrolling on Overview and category/tag drill-downs; the `recurring-definitions-table-scroll` and `account-group-subtotals-scroll` test ids; the 40% summary/subtotal caps; frame shadows visible inside the clipped page frame; existing e2e coverage in `frontend/tests/e2e/reference-table-layout.spec.ts` and `frontend/tests/e2e/accounts-page.spec.ts`.
- Out of scope: gating the account-summary `tabIndex`/`role="region"` to the roomy shell (accepted as-is; no JS shell-mode hook exists and adding one is not warranted), the group-subtotals cap value, any new tests beyond adjusting an existing assertion if an alignment change requires it.
- Mina is pre-production with no users: no compatibility shims.

## Success Criteria

- [x] On `/accounts/:id` in the roomy shell, the account summary card's left and right edges align with the register table's edges (both at the page content edge), matching the group page, and pressing Tab onto the summary region shows a focus ring that is not clipped by the page frame (verify manually with `just dev --demo` at 1280×800; state the mechanism used, e.g. a negative outline offset on that region, in the commit body).
- [x] The `-m-[4px] box-content p-[4px]` shadow-reservation literal repeated in `frontend/src/features/reference/reference-tree.tsx` and `frontend/src/features/members/members-page-content.tsx` is replaced by one exported constant beside `referenceTableStateClassName` in `frontend/src/components/reference-table-frame.ts`, with `frontend/src/components/PACKAGE.md` updated if the exported surface changes.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/accounts-page.spec.ts tests/e2e/reference-table-layout.spec.ts` passes on chromium and webkit.
- [x] `just pre-commit` passes.
- [x] Commit as `fix(frontend): align account summary flush with its register` (and a separate `refactor(frontend): share the shadow-reservation class` if kept apart).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.
