# Plan: qdra papercuts — operator review fixes (fix plan 1) — Kata issue `qdra`

Address three operator-review findings on branch `qdra-ui-papercuts`: an unnecessary reimplementation of react-router `NavLink`, hardcoded magic layout constants, and a brittle e2e shadow assertion. Implementation-only; the five original papercut fixes are done and verified live — do not redo them.

## Plan Context

- Do not run review-loop.
- Defects come from an operator architectural audit of `git diff ui-stage-3...HEAD` plus live UI verification. All five papercuts were confirmed fixed in the running app; this plan only cleans up how, without changing observable behavior.
- Protect — do not regress (verified live, guarded by existing e2e):
  - Detail panel shows the summary memo; memo-less row titles vertically centered; chip shadows unclipped; collapsed rail icons on one horizontal axis; Settings renders `SettingsCog2`.
  - Single-height transaction rows; tag line single-line ellipsis truncation; two-line title+memo layout on memo rows; tooltips on collapsed nav items; active nav item exposed as `aria-current="page"` (existing e2e assertion must keep passing).
- Scope exclusions: no new features, no ground-truth doc edits, no PROJECT_STATE.md update, no changes beyond the files/lines listed below, do not touch the detail-panel memo font or the pagination/test tweaks from the review-loop commits.

## Tasks

### Task/Commit 1: Restore NavLink and drop magic layout constants in app-shell

`frontend/src/features/app-shell/app-shell.tsx` — the review-loop commit "Expose active sidebar page to assistive tech" replaced react-router `NavLink` with `Link` + `useLocation` + a hand-rolled `isActive` and manual `aria-current` (`app-shell.tsx:17`, `:107`, `:123-135`). Installed react-router 8.1.0's `NavLink` already applies `aria-current="page"` when active and its built-in `isActive` matches the hand-rolled logic; this violates the repo rule "Do not recreate what project dependency already implements."

- [x] Restore `NavLink` for enabled nav items: `className={({ isActive }) => navLinkClass({ collapsed, isActive })}`, remove `useLocation`, the hand-rolled `isActive`, and the manual `aria-current` prop; `SidebarNav` returns to a plain component with no location subscription. The existing e2e `aria-current="page"` assertion must still pass (NavLink sets it natively).
- [x] Replace the hardcoded `w-[52px]` on `DisabledNavItem` (`app-shell.tsx:83`) and its tooltip wrapper (`:92`) with the same full-width pattern enabled items use (`w-full` button inside a full-width tooltip wrapper, matching `NewTransactionButton`), so collapsed alignment does not silently depend on the sidebar width minus padding. Verify collapsed icon centering still holds (the existing collapsed-rail e2e alignment assertion must keep passing).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: De-brittle the tag-line height and the chip shadow e2e assertion

Two couplings to opaque constants/implementation internals.

- [x] `frontend/src/features/ledger/transaction-browser.tsx:97`: the tag line uses a hardcoded `h-[18px]` (micro chip 16px + 2px shadow). Replace the opaque pixel height with a constraint that derives from the content (e.g. padding-bottom/right for the shadow offset on an intrinsically sized single-line container, or a `min-h`/line-box approach) so a future chip-size change cannot silently clip. Keep: single line, ellipsis truncation, no extra row height (existing e2e row-height assertion must keep passing).
- [x] `frontend/tests/e2e/transactions-page.spec.ts:109-155`: `chipShadowIsUnclipped` selects chips via `closest("[class*='shadow-']")` and positionally parses the computed `box-shadow` string. Rework to a boundary-level assertion: locate chips by role/text or a `data-testid`, and assert the clipping ancestor leaves ≥ the shadow offset of room below/right of the chip's bounding rect (or that the chip's rect plus shadow offset fits inside the ancestor's client rect) — without matching Tailwind class names or parsing the shadow shorthand ordering.
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
