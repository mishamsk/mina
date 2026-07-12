# Plan: Phase-2 UI backlog sweep (ui-stage-5) — sequential sub-branch delivery (open frontend + UI-blocking backend/API Kata issues from the 2026-07-11 review set and earlier deferred work)

Deliver the post-ui-stage-4 web UI backlog: every open frontend issue added or amended in Misha's 2026-07-11 UI review, the backend/API issues that block frontend surfaces (member hidden state, account type change, featured flags, recurring demo data, status-page runs listing), the deferred editing suite (inline/record/detail/bulk editing), and the recurring-transactions UX direction change (inline occurrences + definitions management). Deliver one Kata task at a time as a Codex-implemented sub-branch of the main working branch, with the Codex session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the Codex session executing this plan. Authors sub-branch plans, launches and waits on implementor Codex sessions, reviews, merges, closes kata issues. Never edits implementation code — all code changes flow through implementor sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Implementor Codex: the only implementor, headless, one session at a time, running `gpt-5.6-terra` with `high` reasoning effort.
- Integration branch ("main working branch"): whatever branch the operator session is currently on when executing this plan. Never touch `main`.
- Issue set: full `kata list --status all --agent` sweep on 2026-07-11, then `kata show <ref> --agent` per candidate. Selected: all open `frontend`/`api`/`backend` issues that are frontend-facing or frontend-blocking, excluding `oss-readiness` issues, `backlog`-labeled far-off children (k7jx tree, yaza, 4d8j), exchange phase-1 follow-ups not blocking the UI (wxtq, 3bs4, c3d0, 2aya parent), design-only placeholders (xw0x, a07v), and t461 (owned by the separate `$garden-docs` workflow). Explicit refs: 2d1e, gb60, fyq2, t828, dgkf, 18w4, 45vz, 5qj0, fpa2, xds2, pgc2, d9hq, d8z6, bqc9, 1c5v, 8ara, 80qv, a4py, s4wf, r4yb, 6pdf, qkss, jrqp, f9c5, gwrc, dcjx, 5z54, 9985, 0wet, 6kcn, b1m2, bnvy, 7abv, 4xb9, gtmn, 89d7, ds26, bzav, 5hvz, ybtb, eg7c, hspf (42 issues, 31 tasks).

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / Codex session at any time. Finish (merge or fail) the current task before starting the next.
- Grouped tasks: a task that lists multiple Kata refs runs as ONE sub-branch and ONE implementation plan covering all listed refs (they are small, same-area issues sized ~1 commit each). Claim every listed ref at setup and close every listed ref at completion, each with its own evidence.
- Operator-owned doc amendments: tasks flagged "(doc amendment)" change ground-truth docs (`docs/webui-design.md`, `docs/recurring-transactions-semantics.md`, `docs/webui-theme-arcade-cabinet.md`). The operator authors and commits those amendments on the sub-branch BEFORE dispatching the implementor; implementors and fix plans must not edit ground-truth docs.
- Codex quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator (Codex) quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop`, run by Codex from the initial implementation plan's Final Verification. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
- After the Codex session: the operator runs the review below. Findings warrant at most TWO fix plans per task. Every fix plan MUST state "Do not run review-loop." in its Plan Context and omit review-loop from its Final Verification.
- A task still failing after 2 fix plans: leave the sub-branch unmerged, mark the task failed with findings, then proceed only to a task that is still viable — skip any task that depends on the failed one, directly or transitively. If no viable tasks remain, stop the fleet entirely. Never merge a failing branch; never silently drop scope.
- Environmental failure (toolchain, `gt`, non-resetting quota): stop and ask.

### Per-task workflow (referenced by every task below)

1. Setup: from the main working branch, `gt <branch> <main-working-branch> -x true` (worktree lands in `.worktrees/<branch>`). Claim: `kata claim <ref> --comment "Fleet sub-branch <branch>." --agent` (every ref for grouped tasks).
2. Author the Codex implementation plan in the sub-worktree at `docs/plans/2026-MM-DD-<topic>.md` from `docs/plan_template.md`: concrete checkboxes sized 1–4 commits, the kata ref(s), repo verification commands per commit (`just test`, `just pre-commit`; `just test-integration` for API/HTTP behavior; `just test-frontend-e2e` for frontend runtime behavior). Initial plans keep the standard Final Verification including one `just review-loop`. Feature-delivering plans include a PROJECT_STATE.md update item and package-doc updates where contracts change. Before authoring, read the owning ground-truth docs for the touched area (`docs/architecture.md`; for frontend also `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`; for API semantics `docs/business-requirements.md`, `api/openapi.yaml`). Commit the plan in the sub-worktree.
3. Dispatch: from the sub-worktree, headless in the background (do not use `just codex-goal` — it fails without a terminal), run exactly:

   ```sh
   codex exec -m gpt-5.6-terra -c model_reasoning_effort=high --dangerously-bypass-approvals-and-sandbox "/goal implement <plan_file>. Acceptance criteria - all checkboxes are ticked. When done - move file to docs/plans/completed folder. Make sure you go commit by commit, task by task and never jump forward or skip any item."
   ```

   Do not touch the worktree while the session runs. Completion signal: plan moved to `docs/plans/completed/` and process exit. Review-loop can take ~10 minutes; use long poll timeouts and do not kill it while heartbeat/progress lines continue.
4. Operator review (each iteration):
   - Sanity: all checkboxes ticked, plan archived, sub-worktree clean, suites reported green.
   - Docs governance: `git diff <main-working-branch>...<branch> -- docs/` — implementors and review fixers must not change scope, phasing, or UX/architecture rules in ground-truth docs. Revert unauthorized edits (operator-owned commit) and note it.
   - Architectural audit: read-only subagents over the sub-branch diff against the owning docs; demand file:line evidence and severity.
   - Live verification for anything with a runtime surface: run `just dev --demo`, drive the UI (Playwright or equivalent), screenshot, judge against `docs/webui-design.md` and the theme doc — observed behavior beats checkboxes. This includes the operator's critical high-level architectural and visual UI/UX judgment.
5. Fix loop (max 2 per task): author an implementation-only fix plan from the template — file:line defects with live evidence, a "protect — do not regress" list, explicit scope exclusions, "Do not run review-loop." in Plan Context, no review-loop in Final Verification. Commit it in the sub-worktree, re-dispatch Codex, re-review.
6. Merge: from the main working branch's worktree, `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`. Trivial conflicts (plans, docs) resolve as operator; implementation conflicts: abort, merge the main working branch into the sub-worktree, hand resolution to Codex via a fix plan (no review-loop), re-review, retry.
7. Cleanup: `git worktree remove .worktrees/<branch>`, `git branch -D <branch>`.
8. Close: `kata close <ref> --done --message "..." --commit <sha> --test "<suites>" --agent` if the session did not already (every ref for grouped tasks).
9. Rule changes discovered in review go into ground-truth docs first (operator edits, committed separately); long-horizon gaps become new kata issues, not fix-plan items.

## Tasks

Per-task checklist — every task below runs the full per-task workflow; tick a task only after completing all of:

1. Setup, claim, Codex plan authored and committed
2. Codex session completed (plan archived, worktree clean, suites green)
3. Operator review passed (fix plans used ≤2)
4. Squash-merged into the main working branch; worktree and branch removed
5. Kata issue(s) closed with evidence

Task scope details live in the Kata issues (`kata show <ref> --agent`). Respect the stated dependencies; otherwise run in the listed order.

### Test infra and backend foundations

- [x] Task 1: `2d1e` — Frontend e2e: stale reused demo servers poison cross-run state (test infra first: every later frontend task runs `just test-frontend-e2e`; stops stale-server flakiness from taxing the whole fleet) — branch `2d1e-e2e-demo-server-hygiene`
- [x] Task 2: `gb60` — Exchange-rate loading fails on malformed local Frankfurter cache ordering + `fyq2` — Invalidate exchange-rate currency cache after recurring materialization (grouped backend exchange fixes, ~1 commit each; gb60 also silences a failure logged on every `just dev --demo` the operator uses for live verification) — branch `gb60-exchange-cache-fixes`
- [x] Task 3: `t828` — Add hidden-state semantics for household members (backend/API contract before its UI consumer dcjx, Task 18) — branch `t828-member-hidden-api`
- [x] Task 4: `dgkf` — Support changing account type via update API (backend/API contract before its UI consumer 5z54, Task 19) — branch `dgkf-account-type-update-api`
- [x] Task 5: `18w4` — Featured flag for categories and tags (model + API; UX surface later) (backend-only per issue; lands before f9c5 reserves the star indicator slot in Task 16) — branch `18w4-featured-categories-tags-api`
- [x] Task 6: `45vz` — Seed real recurring definitions in demo data so the Recurring screen is demonstrable (backend demo seed before the recurring UI direction change b1m2/bnvy, Tasks 22–23, and before live verification of them) — branch `45vz-demo-recurring-definitions`

### Shared frontend foundations

- [x] Task 7: `5qj0` — Extract shared browser-page wiring used by transactions page and drill-down shell + `fpa2` — Consolidate ~15 verbatim apiErrorMessage copies into one helper (grouped consolidation refactors; extracting the shared wiring FIRST means the Task 10 toolbar redesign lands once instead of twice in duplicated code) — branch `5qj0-shared-browser-wiring`
- [x] Task 8: `xds2` — Extract shared ConfirmDialog and unify dialog/toast z-layers + `pgc2` — Close categories/tags edit panel when its entity is row-deleted (grouped: pgc2 mirrors the members close-on-delete path that xds2 already covers with tests; consolidating dialogs before the reference-table tasks touch delete flows) — branch `xds2-confirm-dialog-consolidation`
- [x] Task 9: `d9hq` — Adopt the shared themed dropdown component everywhere it fits (before the toolbar redesign so d8z6 builds on the themed class dropdown instead of patching the native one's missing shadow) — branch `d9hq-themed-dropdown-adoption`

### Transactions toolbar and table display

- [x] Task 10: `d8z6` — Transactions toolbar redesign: dedicated full-width filter bar, X dismiss, icon day-nav + `bqc9` — Decide Clear-all semantics for standing toolbar filters (class vs search) (bqc9 is explicitly folded into d8z6 per its comment; requires Tasks 7 and 9; doc amendment: webui-design toolbar section) — branch `d8z6-toolbar-redesign`
- [x] Task 11: `1c5v` — Go To Day does not apply the selected date and day-stepping breaks after use + `8ara` — Transactions filter toolbar polish: wrap re-centering, alignment coupling, tooltip nit (grouped toolbar behavior/e2e work after the Task 10 redesign; d8z6 supersedes most of 8ara — only the surviving items (tooltip, e2e gaps) are in scope, so e2e lands against the final toolbar) — branch `1c5v-day-jump-fix`
- [x] Task 12: `80qv` — Standardize table page sizes: default 25; transactions 25/50/100 default 50 + `a4py` — Chart of accounts: Name column truncates FQN segments despite available width + `s4wf` — Register amount columns wrap the currency marker onto a second line (grouped small table-display fixes, ~1 commit each, disjoint files) — branch `80qv-table-display-standards`

### Reference tables

- [x] Task 13: `r4yb` — Row actions always visible; overflow dot menu on narrow; drop Actions header (base design change before all other reference-table work; doc amendment: supersedes the webui-design action-visibility/fold rule) — branch `r4yb-always-visible-row-actions`
- [x] Task 14: `6pdf` — Make reference-table rows open read-only detail (former blocker sw33 closed; after Task 13 so edit-as-trailing-action coordinates with always-visible RowActions per the issue comment) — branch `6pdf-row-opens-detail`
- [x] Task 15: `qkss` — Replace full-width one-column Members and Tags tables with compact layouts (former blocker sw33 closed; after Tasks 13–14 so the compact layout embeds the final RowActions and row-activation semantics) — branch `qkss-compact-members-tags`
- [x] Task 16: `jrqp` — Disabled row-action buttons need a real disabled affordance + `f9c5` — Reference-table indicator polish: filled star glyph and hidden-eye alignment (grouped small reference-table visual fixes after the layout work settles; f9c5 reserves the categories/tags star slot enabled by Task 5; conditional doc amendment: arcade button rules if jrqp changes them) — branch `jrqp-row-action-affordances`
- [x] Task 17: `gwrc` — Account credit-limit UX: empty-state add button and credit-card indicator icon (after Tasks 12–14 settle the accounts tree name column and row semantics; doc amendment: indicator placement in webui-design) — branch `gwrc-credit-limit-ux`
- [x] Task 18: `dcjx` — Add member hide and unhide controls after API support (blocked by t828, Task 3; after Task 15 so controls integrate with compact Member RowActions) — branch `dcjx-member-hide-controls`
- [x] Task 19: `5z54` — Allow changing account type in the account edit UI (blocked by dgkf, Task 4; small frontend form change) — branch `5z54-account-type-edit-ui`
- [x] Task 20: `9985` — Stale deleteability: account delete stays blocked after its last transaction is deleted (frontend invalidation bug plus categories/tags/members staleness audit; after the reference-table tasks so the audit covers their final delete surfaces) — branch `9985-deleteability-invalidation`
- [x] Task 21: `0wet` — Category picker cache never refetches after invalidation while mounted + `6kcn` — Guard register-page snapshots against writes from fetches started before bulk invalidation (grouped frontend store cache-guard fixes, same invalidation-correctness area as Task 20) — branch `0wet-cache-guards`

### Recurring UX direction change

- [ ] Task 22: `b1m2` — Show recurring occurrences inline in Transactions by default; confirm/dismiss as row actions (requires Task 6 demo seeds and the Task 10 toolbar, since the expected-rows filter direction inverts inside the redesigned filter bar; doc amendments: docs/recurring-transactions-semantics.md clarification and webui-design section 8 replacement) — branch `b1m2-inline-recurring-occurrences`
- [ ] Task 23: `bnvy` — Recurring page becomes definitions management (design + implement) (blocked by b1m2, Task 22; doc amendment: webui-design definitions-management screen definition) — branch `bnvy-recurring-definitions-page`

### Editing suite (deferred from prior fleets)

- [ ] Task 24: `7abv` — Advanced entry: account dropdown filters out accounts that manual typing accepts (entry-form parity fix before the editing suite reuses the account picker) — branch `7abv-advanced-entry-account-parity`
- [ ] Task 25: `4xb9` — Add per-record editing in expanded records view (foundational record-level editors with shared pickers; first of the editing suite) — branch `4xb9-record-editing`
- [ ] Task 26: `gtmn` — Add transaction-row inline editing per uniformity rule (reuses the Task 25 pickers and record bulk endpoints) — branch `gtmn-row-inline-editing`
- [ ] Task 27: `89d7` — Add editing to transaction detail panel (detail-panel editing surface on top of the Task 25–26 editing patterns) — branch `89d7-detail-panel-editing`
- [ ] Task 28: `ds26` — Add bulk selection and floating action bar (last of the editing suite; shares the uniformity rule and bulk endpoints with Task 26) — branch `ds26-bulk-selection`

### Status page, polish, and e2e hygiene

- [ ] Task 29: `bzav` — Status page: operation navigation with generic runs table and per-type detail views (self-contained api+backend+frontend vertical; doc amendment: new webui-design screen section) — branch `bzav-status-operation-navigation`
- [ ] Task 30: `5hvz` — Saved-transaction edit polish: expected-occurrence dead-end, ns-timestamp display, e2e keyboard tweaks + `ybtb` — Palette transaction-search polish: off-page assertion, MixedSentinel reuse, exchange-amount maps (grouped review-residual polish; after Task 22 because b1m2 changes how expected occurrences surface and act) — branch `5hvz-edit-palette-polish`
- [ ] Task 31: `eg7c` — Reference-table e2e hygiene: fixture sort-order fragility and monolithic geometry test + `hspf` — Flaky Chromium e2e: shorthand entry session-counter timing (grouped e2e-only hygiene last, after Tasks 13–15 rewrite the reference-table layouts the geometry spec asserts) — branch `eg7c-e2e-hygiene`

## Final Verification

- [ ] On the main working branch with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run exactly one and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, Kata refs closed, residual findings and unmerged branches (per-task evidence recorded on each closed Kata issue)
- [ ] Move this plan to `docs/plans/completed/`
