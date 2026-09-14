# Plan: Fix fixed-shell desktop canvas-scroll regressions (Kata k2gk)

## Goal

On every desktop (roomy-shell) fixed-shell route, page content never creates vertical application-canvas/window overflow: the designated table, list, or register viewport alone owns vertical overflow when its data exceeds the available space, while deliberately document-scrolling report pages keep their route-level scrolling. Recurring is the reported case; the demo audit at 1280×633 also found window overflow on Categories and Tags.

- One shared, named roomy fixed-page layout contract replaces the thirteen hand-copied `roomy-shell:h-[calc(100svh-2.5rem)] flex min-h-0 flex-col gap-6` page-root chains and the divergent Recurring frame.
- Every fixed-shell route classified as fixed or document-scrolling, with the classification recorded in the owning package docs.
- Focused representative browser coverage proving no page-level vertical overflow plus a usable designated scroller with overflowing data at a desktop viewport.

## Constraints

- Kata issue: `k2gk`. Related prior work `efrg` (closed) established the shared `referenceTableFrameClassName` frame in `frontend/src/components/reference-table-frame.ts`; extend that mechanism rather than adding a parallel one.
- Fixed-shell routes in scope: Transactions, Accounts, account and account-group registers, Categories, Tags, Members, member drill-down, Templates, Recurring, Status, Settings. Document-scrolling routes that must keep route-level scrolling: Overview, Category/Tag leaf and group drill-downs (`frontend/src/features/entity-overviews/entity-overview-page.tsx`), and any other report page per `docs/webui-design.md` "Report pages are the exception". Do not blanket-disable intentional document scroll.
- Status is a document-scrolling route with an internally capped audit-log table (`frontend/src/features/status/status-audit-log.tsx`); keep that model unless the audit finds it produces unintended overflow. Settings currently owns its own unconditional route-level internal scroller (`frontend/src/features/settings/settings-page-content.tsx`); in the roomy shell it must not create window overflow, and the compact-shell behavior is out of scope unless the fix requires touching it.
- Preserve sticky headers, pagination/footer visibility, side-panel and modal behavior, the compact-shell document-flow contract, and the standard bottom inset in both short and long data states. The compact shell (`docs/webui-design.md` layout bullets) is unchanged by this work.
- Non-loaded states count: skeleton, error, and empty branches of fixed routes must respect the same height bound as the loaded table (today `frontend/src/features/reference/reference-tree.tsx` skeleton/error, `frontend/src/features/accounts/accounts-tree.tsx` skeleton, and `frontend/src/features/recurring/recurring-page-content.tsx` skeleton/error/empty escape it).
- Do not change the demo seed in `internal/services/demo` to make Recurring overflow; create test-owned definitions through `POST /api/recurring-definitions` in the spec (see `frontend/tests/e2e/transactions/support.ts` for the existing helper pattern).
- Browser coverage: add only focused representative checks per `docs/FRONTEND-TESTING.md`. No exact-pixel assertions, no per-route matrix, no coordinate sweeps. Respect the 25-tests-per-file cap.
- Ground-truth docs: `docs/webui-design.md` layout bullets already state the fixed-shell contract; touch that file only if a rule is genuinely missing (at most one sentence naming canvas-overflow ownership and the document-scrolling classification). Record the classification and the shared primitive in `frontend/src/pages/PACKAGE.md`, `frontend/src/features/app-shell/PACKAGE.md`, `frontend/src/components/PACKAGE.md`, and any feature PACKAGE.md whose layout contract changes, via the `write-package-docs` skill. Do not change `docs/architecture.md`, `docs/frontend-architecture.md`, `VISION.md`, or `SCOPE.md`.
- Mina is pre-production with no users: no compatibility shims, no legacy fallbacks.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] At a 1280×633 desktop viewport with overflowing data, Recurring, Categories, and Tags (and every other fixed-shell route spot-checked manually) show `document.documentElement.scrollHeight <= clientHeight + 1`, and the designated inner scroller scrolls with its header still visible.
- [x] Overview, Category/Tag drill-downs, and Status still scroll at the route level.
- [x] Sticky headers, pagination footers at the standard bottom inset, side panels, and modals behave as before in short and long data states.
- [x] Package docs record the route classification and the shared fixed-page primitive.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e` passes.
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-13-fixed-shell-canvas-scroll.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report.
- [x] Close Kata `k2gk` with the commits and validation evidence (`kata close k2gk --done --message "..." --commit <sha> --test "<suites>" --agent`).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Measure and classify every route at the audit viewport

Before changing layout, establish the facts so the fix targets real causes. Run `just dev --demo` (or a Playwright script against the e2e backend) at 1280×633 in the roomy shell and record, per route, `documentElement.scrollHeight - clientHeight` in loaded, skeleton, and (where reachable) error/empty states, with Recurring padded to 20+ definitions through the API. Routes: `/overview`, `/transactions`, `/accounts`, one `/accounts/:id`, `/accounts/group?prefix=...`, `/categories`, one `/categories/:id`, `/tags`, `/members`, one `/members/:id`, `/templates`, `/recurring`, `/status`, `/settings`.

- [x] A short measurement table (route, state, overflow px, cause) is recorded in the Task 1 commit message body or in the completion report; it names which routes overflow the window and why (chain depth, unbounded skeleton, extra in-flow banner, padding arithmetic).
- [x] The route classification (fixed vs document-scrolling vs hybrid) is decided and listed in the same record.
- [x] Commit as `chore(frontend): record fixed-shell overflow audit` only if any repository file changed (e.g. a throwaway audit helper must not be committed; if nothing changed, fold the record into the Task 2 commit body).

### Task 2: Introduce one shared roomy fixed-page contract and repair every chain

Replace the copy-pasted page-root chains with one named primitive (a class constant beside `frontend/src/components/reference-table-frame.ts`, or a thin presentational wrapper in `frontend/src/components` if a component is clearer) that in the roomy shell bounds the page to the canvas height, clips its own overflow so nothing escapes to the window, and lays out header, optional banners, and the flexing table slot; in the compact shell it renders normal document flow. Apply it to every fixed route root (`transactions-page.tsx`, `accounts-page.tsx`, `account-page.tsx`, `account-group-page-content.tsx`, `categories-page.tsx`, `tags-page.tsx`, `members-page.tsx`, `member-page.tsx`, `templates-page.tsx`, `recurring-page.tsx`, and Settings if it adopts the primitive). Remove the extra unconditional `h-full` percentage hops in `categories-page-content.tsx`, `tags-page-content.tsx`, `templates-page-content.tsx`, and `members-page-content.tsx`. Make Recurring reuse `referenceTableFrameClassName` (or the shared scroller classes) instead of its hand-rolled frame, and give its scroller a `data-testid` consistent with the other tables. Bound skeleton, error, and empty branches to the same frame contract so loading states cannot scroll the canvas. Decide whether the canvas in `frontend/src/features/app-shell/app-shell.tsx` needs a roomy `min-h-0`/overflow rule; if the page-level clip is sufficient, leave the shell untouched.

- [x] Every fixed route root uses the shared primitive; no `roomy-shell:h-[calc(100svh-2.5rem)]` literal remains outside it.
- [x] Recurring uses the shared table frame classes and exposes a scroller test id.
- [x] Skeleton, error, and empty states of fixed routes stay inside the bounded frame.
- [x] Manual re-measurement at 1280×633 shows zero window overflow on every fixed route and unchanged route-level scrolling on document routes.
- [x] `just frontend-check` passes.
- [x] Commit as `fix(frontend): own vertical overflow inside fixed-shell page frames`.

### Task 3: Representative browser coverage

Extend `frontend/tests/e2e/reference-table-layout.spec.ts` (or a sibling spec if the file nears its cap) with a helper that asserts no document vertical overflow (`scrollHeight <= clientHeight + 1`) alongside the existing `expectInternalScrollWithReachableHeader`. Exercise it at 1280×633 on Recurring (definitions created through `POST /api/recurring-definitions` so the table overflows) and on Categories (which overflowed in the audit), reusing the existing API seeding helpers. Do not add a per-route matrix.

- [x] Two focused tests demonstrate absent page-level overflow and a usable designated scroller with overflowing data at a desktop viewport.
- [x] `just test-frontend-e2e` passes on chromium and webkit.
- [x] Commit as `test(frontend): cover fixed-shell canvas overflow ownership`.

### Task 4: Package docs

Use the `write-package-docs` skill for every touched package. Record the fixed-page primitive and its roomy/compact behavior in `frontend/src/components/PACKAGE.md`, the route classification (fixed, document-scrolling, hybrid) in `frontend/src/pages/PACKAGE.md`, the canvas-overflow ownership rule in `frontend/src/features/app-shell/PACKAGE.md`, and update `frontend/src/features/recurring/PACKAGE.md` plus any reference/categories/tags/templates/members feature docs whose layout contract changed. Keep every doc short and evergreen; no history.

- [x] Package docs updated for every touched package and `just prose-fmt` run.
- [x] Commit as `docs(frontend): document fixed-shell page frame and scroll ownership`.
