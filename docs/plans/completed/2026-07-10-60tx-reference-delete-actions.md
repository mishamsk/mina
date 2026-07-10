# Plan: Deleteability-driven delete row actions on Categories and Tags (`60tx`)

Bring Categories and Tags to affordance parity with Accounts and Members: leaf rows carry a hover/focus-revealed Delete quick action in the trailing actions column, disabled with an explanatory tooltip when the listing reports the entity as not deletable; activation opens the standard confirm dialog naming the FQN and calls the existing delete endpoint. Group rows carry no delete. Side-panel editor delete stays.

## Plan Context

- Ground truth: `docs/webui-design.md` §6 — reference row actions follow the accounts affordance philosophy: deleteability-driven delete quick action on deletable rows, disabled + explanatory tooltip when `deletable=false`, standard confirm dialog naming the entity, API errors as fallback, no delete on group-only rows, editor delete stays. Also the trailing-actions affordance rules (hover/focus reveal, fit-based per-row folding) and `docs/webui-theme-arcade-cabinet.md` disabled-affordance treatment.
- API capability exists (Kata `cdd0`): Category and Tag listing responses expose optional `deletable` (`frontend/src/api/generated/types.gen.ts`); delete endpoints and client functions already exist (`frontend/src/api/ledger.ts`, used by the side panels).
- Current state: `frontend/src/features/categories/categories-page-content.tsx` and `frontend/src/features/tags/tags-page-content.tsx` build `renderActions` for the shared `ReferenceTree` — leaf rows get a hide toggle + move/rename, group rows get a group-hide toggle + move/rename, no delete. Delete lives only in the side panels with reactive 409 errors.
- Patterns to mirror (do not invent new ones):
  - Disabled gating: `disabled: leaf.deletable !== true` + explanatory `disabledReason` (accounts: `frontend/src/features/accounts/accounts-tree.tsx:692-694`; members row action). Wording parity: category/tag flavored equivalent of "has active dependent records" / "has attributed records" — pick copy consistent with what actually blocks deletion (dependent transactions/child usage) and use it consistently for both pages.
  - Confirmation: page-owned named confirm dialog like the members row-delete dialog (`frontend/src/features/members/members-page-content.tsx` — alertdialog naming the entity, destructive confirm, in-dialog `role="alert"` API-error rendering, focus restore on cancel, z-layer above toasts) — the dialog must name the full FQN for tree entities.
  - Success: call the existing delete client, refresh the page data through the existing mutation-refresh helpers, show the standard "Category deleted." / "Tag deleted." notice.
- Leaf rows only: rows with `row.leaf` get the delete action; group rows (including derived groups) get none — no group delete operation exists.
- The frontend consumes `deletable` verbatim; no re-derivation of dependency rules. A stale `deletable=true` falls back to the 409 in-dialog error.
- Protect — do not regress: existing hide/unhide toggles and move/rename actions; side-panel create/edit/delete workflows and their e2e specs (`categories-page.spec.ts`, `tags-page.spec.ts`); shared `ReferenceTree` behavior for both pages and Members; fit-based per-row fold contract (`reference-row-actions.spec.ts` — leaf action count changes from 2 to 3, which the per-row count mechanism handles automatically, but the spec's count expectations for categories/tags must be updated deliberately, keeping the measured fit predicate); full-height table frames (`reference-table-layout.spec.ts`); whole-row/keyboard interactions.
- Check the categories/tags stores refresh paths: snapshots must carry `deletable` through refresh without stale merging (members store replaces wholesale — verify these do the equivalent; fix only if the field is actually dropped or stuck).
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `60tx`.

## Tasks

### Task/Commit 1: Categories leaf-row delete action

Add the deleteability-driven Delete action and named confirmation to the Categories page, with e2e coverage.

- [x] Leaf rows in `categories-page-content.tsx` gain a Delete button action after move/rename: `disabled: leaf.deletable !== true` with the explanatory tooltip; activation (when eligible) opens the page-owned named confirm dialog showing the category FQN; confirm calls the existing category delete endpoint, refreshes via existing helpers, shows "Category deleted."; API failure renders in-dialog; group rows get no delete.
- [x] e2e in `categories-page.spec.ts`: an ineligible category (attributed to a transaction via API) shows disabled Delete + tooltip and inert activation; an eligible leaf deletes through the FQN-named confirmation (real DELETE, row gone, notice); cancel keeps it; a mocked 409 on an eligible-looking category renders the in-dialog error; group rows expose no delete action.
- [x] Update `reference-row-actions.spec.ts` count expectations for categories deliberately (leaf cluster count 2 → 3), keeping measured fit predicates.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata `60tx`
  - [x] Commit changes

### Task/Commit 2: Tags leaf-row delete action

Apply the identical pattern to Tags, sharing what the categories commit established where that reduces drift without inventing an abstraction the pages do not need.

- [x] Leaf rows in `tags-page-content.tsx` gain the same deleteability-driven Delete action, FQN-named confirm dialog, existing tag delete endpoint, refresh, "Tag deleted." notice, in-dialog errors; group rows get no delete.
- [x] e2e in `tags-page.spec.ts`: same coverage matrix as categories (disabled + tooltip + inert; eligible delete happy path; cancel; 409 fallback; no group delete).
- [x] Update `reference-row-actions.spec.ts` tag count expectations if they exist, as above.
- [x] Update `PROJECT_STATE.md` with a one-line note that Categories and Tags rows carry deleteability-driven delete actions.
- [x] Update the categories/tags/reference package docs only if a non-obvious contract emerges (e.g., page-owned row-delete dialog vs side panel, mirroring the members PACKAGE.md line).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata `60tx`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Deleteability-driven delete row actions on Categories and Tags leaf rows with FQN-named confirmation and 409 fallback; group rows and side-panel workflows unchanged; consume the API deletable signal without re-deriving rules"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `60tx` only after the plan is moved to completed
