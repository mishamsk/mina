# Plan: Close the recurring-definition panel when navigating away (Kata dhg3)

## Goal

The recurring-definition editor side panel belongs to the route it was opened on and never overlays another route. Any completed navigation to a different route closes it and clears its fragment state; a dirty draft is protected by a discard confirmation before that navigation completes; history navigation restores only panel state that belongs to the restored `/recurring` entry (its `#definition-<id>` fragment).

- Backlinks still open `/recurring#definition-<id>` with the target definition resolved and pre-opened after the snapshot loads.
- Navigation protection uses React Router's own blocker rather than a hand-rolled history reversal.
- Ground-truth docs and package docs describe the new route-bound contract.

## Constraints

- Kata issue: `dhg3`.
- Route identity is the pathname. Search-param and hash changes on the same pathname (Recurring search query, `?transaction=` detail, `?entry=` transaction entry) never close the panel. The panel opened by "Create recurring" from `/transactions` or `/templates` is bound to that pathname the same way.
- Use `useBlocker` from `react-router` for dirty-draft protection. It requires the data-router mode, so convert `frontend/src/app.tsx` and `frontend/src/pages/router.tsx` from `BrowserRouter` + `Routes` to `createBrowserRouter` + `RouterProvider` with `AppShell` as a layout route rendering `Outlet`; keep every route path and element unchanged and keep the conversion contained to those files plus whatever `AppShell` needs to render an outlet instead of children. Do not add loaders, actions, or data APIs. Do not replace the existing entry-modal `popstate` handling in `app-shell.tsx`; it is out of scope.
- Dirty detection: the panel has no draft baseline today. Add one following `frontend/src/features/templates/template-editor-modal.tsx` (initial draft signature compared with the current draft). The discard confirmation reuses `frontend/src/components/confirmation-dialog.tsx` with the same title/action wording pattern as the template editor ("Discard definition changes?", "Discard changes", "Keep editing").
- Scope of the confirmation is navigation only. Escape and the explicit close button keep their current documented behavior (discard without confirmation, `docs/webui-design.md` overlay bullet); changing that is a separate decision.
- A clean panel closes immediately on route change with no dialog. Auto-close on navigation does not count as "consuming" the backlink: returning to the `/recurring#definition-<id>` history entry re-resolves the fragment and re-opens the editor with a fresh draft; moving away again closes it. Explicit close on `/recurring` keeps its current fragment-clearing behavior. Remove the now-dead off-route consumed-navigation bookkeeping in `frontend/src/store/recurring-definition-editor.ts` and `app-shell.tsx` once the panel can no longer be closed off-route.
- The editor's "View transactions" link becomes an ordinary in-app navigation under this contract: a dirty draft prompts, confirming discards and navigates, and the panel does not survive to `/transactions`. Update `docs/webui-design.md` (overlay bullet, editor bullet, the "View transactions ... navigation preserves the draft" bullet, the backlink bullets) and the package docs that promise draft survival across drill-down (`frontend/src/pages/PACKAGE.md`, `frontend/src/features/recurring/PACKAGE.md`, `frontend/src/features/app-shell/PACKAGE.md`, `frontend/src/store/PACKAGE.md`). These doc edits are required by the Kata issue. Keep them to targeted bullet rewrites; do not restructure sections. Do not change `docs/architecture.md`, `docs/frontend-architecture.md`, `VISION.md`, or `SCOPE.md`.
- Preserve: initial focus in the panel, shortcut suppression, stacking above transaction detail, Escape yielding to a modal stacked above it, the inert Recurring route while open, focus restoration on close, the unavailable-target notice, and the compact-shell behavior.
- Browser coverage per `docs/FRONTEND-TESTING.md`: rewrite the existing `frontend/tests/e2e/recurring-page.spec.ts` test "recurring editor guards interaction across route navigation" (it asserts the old contract) and adjust the drill-down test that asserts draft survival. Add focused journeys only; stay under 25 tests per file. Use `createRecurringTransactionFixture` from `frontend/tests/e2e/transactions/support.ts` for backlink coverage.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] From a transaction detail's definition backlink, `/recurring#definition-<id>` opens with the editor pre-opened; clicking a sidebar link closes the panel and the destination route renders without it; browser Back returns to `/recurring#definition-<id>` and re-opens the editor; Forward closes it again.
- [x] With a dirty draft, navigating away (sidebar link, the editor's View transactions link, or browser Back) shows the discard confirmation; Keep editing stays on the current route with the draft intact; Discard closes the panel and completes the navigation.
- [x] A panel opened by Create recurring over `/transactions` closes when navigating to another route.
- [x] Docs and package docs describe the route-bound contract; no stale "route-independent" or "navigation preserves the draft" statements remain for the recurring editor.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e` passes (full suite, because the router conversion is global).
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-close-recurring-panel-on-navigation.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report.
- [x] Close Kata `dhg3` with the commits and validation evidence (`kata close dhg3 --done --message "..." --commit <sha> --test "<suites>" --agent`).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Convert the router to data-router mode

Replace `BrowserRouter`/`Routes` with `createBrowserRouter`/`RouterProvider`; `AppShell` becomes the layout route element rendering `Outlet`. Route table, redirects, and page elements stay identical. Verify every existing route hook usage (`useLocation`, `useNavigate`, `useSearchParams`, `useNavigationType`, `Link`) keeps working.

- [x] `frontend/src/app.tsx` and `frontend/src/pages/router.tsx` use the data router; the login gate and error boundary wrapping are unchanged.
- [x] `just frontend-check` and `just test-frontend-e2e` pass with no behavior change.
- [x] Commit as `refactor(frontend): move routing to the react-router data router`.

### Task 2: Draft baseline, dirty detection, and discard confirmation in the editor

Add an initial-draft signature to `frontend/src/features/recurring/definition-editor-panel.tsx`, expose whether the draft is dirty and a `requestDiscard`-style callback to the app shell (a ref or store field, following the entry-modal `requestCloseRef` wiring), and render the confirmation dialog stacked above the panel. Escape and the close button remain unchanged.

- [x] The panel reports dirtiness accurately for new and existing definitions (untouched draft is clean; any field edit is dirty; saving resets the baseline).
- [x] The confirmation dialog opens above the panel, traps focus, and returns focus to the panel on Keep editing.
- [x] Commit as `feat(recurring): track definition draft dirtiness with a discard confirmation`.

### Task 3: Route-bound panel lifecycle in the app shell

Record the origin pathname in the editor launch. In `app-shell.tsx`, use `useBlocker` to block any navigation whose next pathname differs from the origin while the draft is dirty; on block, open the discard confirmation; Discard closes the editor and calls `proceed()`, Keep editing calls `reset()`. When the draft is clean, a completed pathname change closes the editor. Remove the off-route consumed-navigation bookkeeping and the off-route close branch that replace-navigates from another route. Keep the on-route explicit-close fragment clearing and the fragment re-resolution on history return.

- [x] Clean panel: closes on any pathname change (push, replace, pop); stays open across search/hash-only changes.
- [x] Dirty panel: navigation is held, the confirmation appears, and the outcome matches the choice; the URL never shows the destination while the dialog is open.
- [x] `frontend/src/store/recurring-definition-editor.ts` no longer exports consumed-fragment helpers, and `recurring-page.tsx` no longer branches on them.
- [x] Commit as `fix(app-shell): close the recurring-definition panel on route navigation`.

### Task 4: Browser coverage

Rewrite the outdated route-navigation test and adjust the drill-down test in `frontend/tests/e2e/recurring-page.spec.ts`; add journeys for backlink open then navigate away, Back/Forward, dirty-draft confirmation (Keep and Discard), and a Create-recurring panel opened over `/transactions` closing on navigation. Keep the spec under 25 tests; prefer extending existing journeys over new files.

- [x] Coverage exists for backlink opening, route navigation while open, Back/Forward, and dirty-draft protection.
- [x] `just test-frontend-e2e` passes on chromium and webkit.
- [x] Commit as `test(frontend): cover route-bound recurring editor lifecycle`.

### Task 5: Ground-truth and package docs

Apply the targeted rewrites listed in Constraints to `docs/webui-design.md` and the four package docs, and use the `write-package-docs` skill for every touched package (app-shell, recurring, store, pages, and any other package changed by Task 1). Run `just prose-fmt`.

- [x] Docs are short, evergreen, and consistent with the implemented behavior.
- [x] Commit as `docs: bind the recurring-definition editor to its route`.
