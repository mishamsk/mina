# Plan: Recent UI/frontend papercuts and small follow-ups — sequential sub-branch delivery (`kata search "UI frontend web polish papercut"` + full open-issue sweep for frontend-labeled and frontend-consequence issues)

Clear the current backlog of small/medium, well-scoped web UI and frontend bugs and polish follow-ups from previous fleets — URL/deep-link state handling, transaction lifecycle timestamp correctness and display, table ordering defaults, record-role and class indicators, bulk-categorize skip semantics, picker/inline-save/register-header polish — plus two user-observed unfiled bugs briefed inline below (entry-modal eager draft, mixed-class amount display). One backend/API bug (`5qah`) is included because it owns the contract its frontend consumer (`e222`) renders. `xy9q` was reverified against the merged accounting-semantics refactor and rescoped: its original whole-batch-failure repro is no longer reachable from the UI; the surviving scope is skip-warning/toast/count accuracy (see the task note). Excluded deliberately: `qbg9` (requires a multi-prototype design workflow and carries blocked-by links) and `2ffd` (CI e2e concurrency stabilization — infra diagnosis verified on hosted runners, not UI behavior). Deliver one Kata issue at a time as a Codex-implemented sub-branch of the main working branch, with the session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the session executing this plan. Authors sub-branch plans, launches and waits on implementor Codex sessions, reviews, merges, closes kata issues. Never edits implementation code — all code changes flow through implementor sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Implementor Codex: the only implementor, headless, one session at a time, running `gpt-5.6-sol` with `high` reasoning effort.
- Integration branch ("main working branch"): whatever branch the operator session is currently on when executing this plan. Never touch `main`.
- Issue set: explicit refs selected 2026-07-26 from the open Kata ledger: `3fp5`, `zh4g`, `5qah`, `e222`, `ekp3`, `2qf5`, `y8fz`, `3c4q`, `xy9q`, `ndkg`, `2q6j`, `r2ae`, `q3rh` — plus two unfiled user-reported bugs with no Kata refs, scoped by the "Unfiled task briefs" section below.
- Unfiled tasks (no Kata ref): skip the `kata claim` part of step 1 and the `kata close` step 8 of the per-task workflow; their ground-truth scope is the brief in this plan, and the implementation plan restates it in full.

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / implementor session at any time. Finish (merge or fail) the current task before starting the next.
- Implementor quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop --plan "<implementation plan path>"`, run by the implementor from the initial implementation plan's Success Criteria. The plan is immutable ground truth for review-loop reviewers and fixers. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
- After the implementor session: the operator runs the review below. Findings warrant at most TWO fix plans per task. Every fix plan MUST state "Do not run review-loop." in its Plan Context and omit review-loop from its Success Criteria.
- A task still failing after 2 fix plans: leave the sub-branch unmerged, mark the task failed with findings, then proceed only to a task that is still viable — skip any task that depends on the failed one, directly or transitively. If no viable tasks remain, stop the fleet entirely. Never merge a failing branch; never silently drop scope.
- Environmental failure (toolchain, `gt`, non-resetting quota): stop and ask.

### Per-task workflow (referenced by every task below)

1. Setup: from the main working branch, `gt <branch> <main-working-branch> -x true` (worktree lands in `.worktrees/<branch>`). Claim: `kata claim <ref> --comment "Fleet sub-branch <branch>." --agent`.
2. Author the implementation plan in the sub-worktree at `docs/plans/2026-MM-DD-<topic>.md` from `docs/plan_template.md`. The subplan covers the Kata issue's full feature, component, bug set, or refactor slice and normally decomposes that substantial outcome into multiple sequential tasks and commits; fleet orchestration does not reduce a subplan to a single small task. Include concrete checkboxes, the kata ref, and only the repository-owned validation commands that provide relevant evidence for the affected behavior. Initial plans keep the standard Success Criteria including one `just review-loop`. Feature-delivering plans include a PROJECT_STATE.md update item and package-doc updates where contracts change. Before authoring, read the owning ground-truth docs for the touched area (`docs/architecture.md`; for frontend also `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`; for API semantics `docs/business-requirements.md`, `api/openapi.yaml`). Commit the plan in the sub-worktree.
3. Dispatch: from the sub-worktree, headless in the background (do not use `just codex-goal` — it fails without a terminal), run exactly:

   ```sh
   codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --dangerously-bypass-approvals-and-sandbox "Implement <plan_file> end to end. Follow its task order, constraints, and stopping conditions. Success means every applicable checkbox and the plan's success criteria are complete, task commits are created as directed, and the finished plan is moved to docs/plans/completed. The plan file itself is immutable except for ticking checkboxes and the final move to docs/plans/completed. If the plan directs a just review-loop run, invoke it AT MOST ONCE in this session: after that one invocation and its fix commits, the review-loop item is satisfied permanently — never invoke it again, even if findings remain; record unresolved findings in your final report instead. If blocked, leave the affected checkbox open and report the blocker with evidence."
   ```

   Do not touch the worktree while the session runs. Completion signal: plan moved to `docs/plans/completed/` and process exit. Review-loop can take ~10 minutes; use long poll timeouts and do not kill it while heartbeat/progress lines continue.
4. Operator review (each iteration):
   - Sanity: all checkboxes ticked, plan archived, sub-worktree clean, suites reported green.
   - Docs governance: `git diff <main-working-branch>...<branch> -- docs/` — implementors and review fixers may make targeted ground-truth doc updates when the implementation genuinely diverged from the documented rule (e.g. a new interaction precedence the doc did not anticipate); broad scope, phasing, or architecture rewrites remain off-limits. The operator judges every doc diff at review: warranted updates stay, unwarranted ones are reverted via a fix plan (or an operator-owned commit for trivial reverts), and the intervention is noted.
   - Architectural audit: read-only subagents over the sub-branch diff against the owning docs; demand file:line evidence and severity.
   - Live verification for anything with a runtime surface: run `just dev --demo`, drive the UI (Playwright or equivalent), screenshot, judge against `docs/webui-design.md` and the theme doc — observed behavior beats checkboxes. This includes the operator's critical high-level architectural and visual UI/UX judgment.
5. Fix loop (max 2 per task): author an implementation-only fix plan from the template — file:line defects with live evidence, a "protect — do not regress" list, explicit scope exclusions, "Do not run review-loop." in Plan Context, no review-loop in Success Criteria. Commit it in the sub-worktree, re-dispatch Codex, re-review.
6. Merge: from the main working branch's worktree, `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`. Trivial conflicts (plans, docs) resolve as operator; implementation conflicts: abort, merge the main working branch into the sub-worktree, hand resolution to Codex via a fix plan (no review-loop), re-review, retry.
7. Cleanup: `git worktree remove .worktrees/<branch>`, `git branch -D <branch>`.
8. Close: `kata close <ref> --done --message "..." --commit <sha> --test "<suites>" --agent` if the session did not already.
9. Rule changes discovered in review go into ground-truth docs first (operator edits, committed separately); long-horizon gaps become new kata issues, not fix-plan items.

### Unfiled task briefs

These tasks have no Kata issue; this section is their ground-truth scope.

**Brief A — entry modal must not eagerly create a draft (branch `entry-eager-draft`)**

- Problem (observed live 2026-07-26): opening the transaction creation modal and touching nothing apparently persists a per-tab entry draft. After closing it untouched, launching Edit on an existing transaction raises the "discard draft?" confirmation even though no draft was ever started.
- Expected: a pristine open-then-close of the entry modal leaves no persisted draft and never triggers a discard prompt later; the discard confirmation appears only when a draft with real user input exists. Per `frontend/src/features/ledger/PACKAGE.md`, entry drafts are per tab and store UI form values only — prefill/default initialization must not count as user input.
- Likely area: `frontend/src/features/ledger/entry-modal.tsx`, `entry-panel.tsx`, `entry-launch-context.ts`, and the draft persistence they use. Root-cause the dirty-tracking (initialization writing the draft store vs. a real dirty check) rather than suppressing the prompt cosmetically.
- Acceptance: pristine create open/close then Edit/Duplicate/Split on any transaction shows no discard prompt; a genuinely dirty draft still prompts and restores; per-tab draft persistence for real input is preserved. Frontend e2e covers the pristine-open-then-edit flow.

**Brief B — mixed-class transaction amount display: one honest amount plus a more-parts indicator (branch `mixed-amount-display`)**

- Problem (observed live 2026-07-26 on the demo dataset): the new multi-amount presentation is inconsistent for mixed-class transactions. A mixed spend+transfer row renders amounts on two lines, making the row taller — `docs/webui-design.md` forbids variable transaction-row heights. The demo's mixed transaction renders two inline values separated by `/` with the second formatted like `100x2`, which reads as nonsensical.
- Direction (user-decided): do not guess a composite presentation for mixed transactions. Show at most one amount: the spend/income economic amount when identifiable, otherwise no amount — always with a compact indicator that more parts exist (tooltip/detail carries the rest). For mixed spend+transfer specifically, show the spend amount (the economically meaningful one) with the same more-parts indicator.
- Likely area: `frontend/src/features/ledger/transaction-amount-cell.tsx`, `amount-text.tsx`, `mixed-sentinel.tsx`, `format.ts`; amounts are server-provided per `frontend/src/features/ledger/PACKAGE.md` (no client-side re-derivation of accounting truths).
- Acceptance: constant row height across all classes; mixed rows show at most one spend/income amount with an accessible more-parts indicator (or indicator only when no spend/income part exists); no `/`-joined or `x2`-style composite values anywhere in list rows; exchange and simple-class rendering unchanged; full amounts remain reachable in transaction detail. Verify against the demo dataset's mixed transactions and update `docs/webui-design.md` amount-display rules if the implemented rule diverges from what the doc currently states.

**Brief C — lifecycle timestamps: no display magic, status-first lifecycle presentation, end-of-day derived stamps (branch `lifecycle-timestamp-simplify`; added by the user 2026-07-28 after reviewing the merged `5qah`/`e222` behavior)**

- Direction (user-decided; ground truth for the task):
  1. Remove the midnight-UTC "day-marker" display heuristic introduced by the `e222` task entirely — no special magic treatment for midnight timestamps anywhere in display code. Timestamps that remain displayed render plainly in browser local time.
  2. Transaction detail lifecycle breadcrumbs: stop showing pending/posted timestamps there. The strip shows only the civil `initiated_date` plus a text indicating status when not simply posted — `expected`, `cancelled`, or `pending`; posted shows no status text. Exact pending/posted timestamps remain reachable in the per-record disclosures (unchanged truth path), just not in the breadcrumbs.
  3. Transaction list: use icons to the right of the description (inside the description cell, where the expected-recurring icon already renders) to indicate not only expected recurring but also pending — and cancelled only if cancelled rows can ever actually be visible in the list; if cancelled transactions are always hard-filtered out, omit the cancelled icon entirely (verify and record which).
  4. Retain the `5qah` behavior that manual posting-status edits record a posted rather than pending timestamp.
  5. Even though the UI creates implicit manual transactions with no pending but a posted timestamp, the API must still allow creating non-`manual` source records (e.g. external loads) with their own explicit lifecycle timestamps — verify the create/replace contracts don't over-restrict to the manual pattern, and cover it.
  6. Any lifecycle timestamp derived from the initiated civil date — pending and posted alike, in every derivation path (direct manual posts, created-pending defaults, recurring confirm-as-of) — is stamped `<initiated_date>T23:59:59Z`, never midnight. One symmetric rule, no exceptions.
- Consequential updates in scope: `docs/webui-design.md` (drop the day-marker sentence; rewrite the Screen 2 lifecycle-strip spec and the row-composition wording to match the new presentation), OpenAPI descriptions that state the midnight default, and every e2e/testscript that pins the old strip contents, day-marker rendering, or `00:00:00Z` stamps.

## Tasks

Per-task checklist — every task below runs the full per-task workflow; tick a task only after completing all of:

1. Setup, claim, implementation plan authored and committed
2. Implementor session completed (plan archived, worktree clean, suites green)
3. Operator review passed (fix plans used ≤2)
4. Squash-merged into the main working branch; worktree and branch removed
5. Kata issue closed with evidence

Task scope details live in the Kata issues (`kata show <ref> --agent`). Respect the stated dependencies; otherwise run in the listed order.

- [x] Task 1: `3fp5` — Preserve transaction detail and split editor while debounced search syncs URL (P1 frontend bug; no dependencies; leads the fleet on priority and owns the debounced-search URL-sync behavior later tasks build on) — branch `3fp5-search-url-detail-preserve`
- [x] Task 2: `zh4g` — Restore transaction detail from deep-link query parameters (P2 frontend bug; same transactions URL-parameter surface as Task 1 — runs after it so deep-link restore builds on the corrected param-preserving sync) — branch `zh4g-detail-deep-link`
- [x] Task 3: (no Kata ref) — Entry modal must not eagerly create a draft (user-reported bug; scope is Brief A above; fixes the draft dirty-tracking that Task 13's draft-adjacent picker polish later builds on) — branch `entry-eager-draft`
- [x] Task 4: `5qah` — Do not assign pending timestamps to directly posted manual transactions (P2 backend/API bug; nullable pending-timestamp contract must land before its frontend lifecycle-display consumer in Task 5) — branch `5qah-no-pending-direct-post`
- [x] Task 5: `e222` — Render transaction lifecycle timestamps in browser local time (P2 frontend bug; depends on Task 4's nullable pending timestamps so lifecycle rendering is built once against the corrected contract) — branch `e222-lifecycle-local-time`
- [x] Task 6: `ekp3` — Polish detail lifecycle strip internals (P4 polish promoted next to Task 5: both touch lifecycle derivation/display in the transaction detail panel; extracting the shared derivation immediately after avoids churning the same code twice) — branch `ekp3-lifecycle-strip-polish`
- [x] Task 7: `2qf5` — Default time-based UI tables to newest first (P2 frontend bug; shared-browser ordering defaults are foundational table behavior, so they precede the remaining table/detail polish; independent of Tasks 1–6) — branch `2qf5-newest-first-tables`
- [x] Task 8: `y8fz` — Surface derived journal record roles in the UI (P2 frontend; adds a record-role indicator across journal-record tables; runs before Task 9 so detail-panel chip/marker conventions settle in one direction) — branch `y8fz-record-role-indicators`
- [x] Task 9: `3c4q` — Remove redundant class metadata from transaction detail (P2 frontend bug; small detail-panel presentation change following Task 8's marker work on the same panel) — branch `3c4q-detail-class-chip`
- [x] Task 10: (no Kata ref) — Mixed-class transaction amount display: one honest amount plus a more-parts indicator (user-reported regression from the accounting-semantics merge; scope is Brief B above; follows Tasks 8–9 so class/role marker conventions are settled before amount-cell rework) — branch `mixed-amount-display`
- [x] Task 11: `xy9q` — Skip intent-incompatible transactions in bulk categorize instead of failing the batch (P2 frontend; RESCOPED after the 2026-07-26 accounting-semantics reverification: the original whole-batch 400 repro is no longer reachable from the UI — client-side pre-skip and "N updated, M skipped" reporting already exist in `use-transaction-browser-page.ts`. Surviving scope, per the issue comment: align the pre-apply skip warning predicate with the actual `isUniformBulkField` skip predicate, report the true skip cause instead of the hardcoded "mixed records" toast, and stop counting transactions that contributed zero flow records as "updated". The subplan must start by re-reproducing against current post-refactor behavior and record what is already satisfied so the issue closes with accurate evidence) — branch `xy9q-bulk-categorize-skip`
- [x] Task 12: `ndkg` — Differentiate dictionary edit and move/rename icons (P2 frontend-only iconography polish on Accounts/Categories/Tags row actions; independent) — branch `ndkg-dictionary-icons`
- [x] Task 13: `2q6j` — Polish segment-completion picker edge cases (P3 frontend; enumerated residual edge cases from the vmp6 review, including flat recurring-member picker names bypassing segment derivation; after Task 3 so draft-lifecycle fixes land first) — branch `2q6j-picker-edge-cases`
- [x] Task 14: `r2ae` — Polish inline-save background reconciliation edges (P3 frontend; two enumerated edges in `use-transactions-resource.ts`; independent, ordered by priority) — branch `r2ae-inline-save-reconcile`
- [x] Task 15: `q3rh` — Register page header middle-truncates the account FQN despite available width (P4 frontend; smallest polish item, applies the a4py width policy to the register header; independent) — branch `q3rh-register-header-fqn`
- [ ] Task 16: (no Kata ref) — Lifecycle timestamps: no display magic, status-first lifecycle presentation, end-of-day derived stamps (user-directed follow-up revising the merged `5qah`/`e222` outcomes; scope is Brief C above; runs last so it revises settled lifecycle behavior exactly once) — branch `lifecycle-timestamp-simplify`

## Final Verification

- [ ] On the main working branch with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run `just review-loop --plan "<this fleet plan's repo-relative path>"` exactly once and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, Kata refs closed, residual findings and unmerged branches (per-task evidence recorded on each closed Kata issue)
- [ ] Move this plan to `docs/plans/completed/`
