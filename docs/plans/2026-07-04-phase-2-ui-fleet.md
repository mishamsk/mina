# Plan: Phase 2 UI fleet — sequential sub-branch delivery (kata label `ui-stage-3`)

Drive the remaining phase-2 web UI scope to mostly-complete by delivering one kata issue at a time as a Codex-implemented sub-branch of `ui-stage-3`, with the Claude session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the Claude session executing this plan. Authors sub-branch plans, launches and waits on Codex, reviews, merges, closes kata issues. Never edits implementation code — all code changes flow through Codex sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Codex: the only implementor, headless, one session at a time.
- Integration branch: `ui-stage-3` (this worktree). Never touch `main`.
- Today's issue set carries kata label `ui-stage-3`: query with `kata list --label ui-stage-3 --agent`.

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / Codex session at any time. Finish (merge or fail) the current task before starting the next.
- Codex quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator (Claude) quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop`, run by Codex from the initial implementation plan's Final Verification. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
- After the Codex session: the operator runs the review below. Findings warrant at most TWO fix plans per task. Every fix plan MUST state "Do not run review-loop." in its Plan Context and omit review-loop from its Final Verification.
- A task still failing after 2 fix plans: leave the sub-branch unmerged, mark the task failed with findings, continue to the next task. Never merge a failing branch; never silently drop scope.
- Environmental failure (toolchain, `gt`, non-resetting quota): stop and ask.

### Per-task workflow (referenced by every task below)

1. Setup: from `ui-stage-3`, `gt <branch> ui-stage-3 -x true` (worktree lands in `.worktrees/<branch>`). Claim: `kata claim <ref> --comment "Fleet sub-branch <branch>." --agent`.
2. Author the Codex implementation plan in the sub-worktree at `docs/plans/2026-MM-DD-<topic>.md` from `docs/plan_template.md`: concrete checkboxes sized 1–4 commits, the kata ref, repo verification commands per commit (`just test`, `just pre-commit`; `just test-integration` for API/HTTP behavior; `just test-frontend-e2e` for frontend runtime behavior). Initial plans keep the standard Final Verification including one `just review-loop`. Feature-delivering plans include a PROJECT_STATE.md update item and package-doc updates where contracts change. Before authoring, read the owning ground-truth docs for the touched area (`docs/architecture.md`; for frontend also `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`; for API semantics `docs/business-requirements.md`, `api/openapi.yaml`). Commit the plan in the sub-worktree.
3. Dispatch: from the sub-worktree run `just codex-goal <plan_file>` headless in the background (fallback `codex exec` with the exact prompt from the `codex-goal` recipe if stdin is not a terminal). Do not touch the worktree while the session runs. Completion signal: plan moved to `docs/plans/completed/` and process exit. Review-loop can take ~10 minutes; use long poll timeouts and do not kill it while heartbeat lines continue.
4. Operator review (each iteration):
   - Sanity: all checkboxes ticked, plan archived, sub-worktree clean, suites reported green.
   - Docs governance: `git diff ui-stage-3...<branch> -- docs/` — implementors and review fixers must not change scope, phasing, or UX/architecture rules in ground-truth docs. Revert unauthorized edits (operator-owned commit) and note it.
   - Architectural audit: read-only subagents over the sub-branch diff against the owning docs; demand file:line evidence and severity.
   - Live verification for anything with a runtime surface: run `just dev --demo`, drive the UI (Playwright or equivalent), screenshot, judge against `docs/webui-design.md` and the theme doc — observed behavior beats checkboxes. This includes the operator's critical high-level architectural and visual UI/UX judgment.
5. Fix loop (max 2 per task): author an implementation-only fix plan from the template — file:line defects with live evidence, a "protect — do not regress" list, explicit scope exclusions, "Do not run review-loop." in Plan Context, no review-loop in Final Verification. Commit it in the sub-worktree, re-dispatch Codex, re-review.
6. Merge: from the `ui-stage-3` worktree, `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`. Trivial conflicts (plans, docs) resolve as operator; implementation conflicts: abort, merge `ui-stage-3` into the sub-worktree, hand resolution to Codex via a fix plan (no review-loop), re-review, retry.
7. Cleanup: `git worktree remove .worktrees/<branch>`, `git branch -D <branch>`.
8. Close: `kata close <ref> --done --message "..." --commit <sha> --test "<suites>" --agent` if the session did not already.
9. Rule changes discovered in review go into ground-truth docs first (operator edits, committed separately); long-horizon gaps become new kata issues, not fix-plan items.

### Deliberately out of this plan

- Filed but deferred: `d608` (palette txn search), `gtmn` (row inline edit), `4xb9` (per-record edit), `89d7` (detail-panel edit), `ds26` (bulk ops), `ksw0` (Edit/Duplicate/Split).
- Out of scope: `a07v` (transfer fee shorthand), `zetq`/recurring anything, keyboard-complete table navigation (declined), Templates page (not filed).
- `mrs9` lands as API-only; its restructuring-UI consumer issue is intentionally not filed yet.

## Tasks

> Each task = one full per-task workflow cycle. Tasks marked (API) are backend/API-only; (FE) are frontend-only. Respect the stated ordering dependencies; otherwise order is the priority order.

### Task 1: qdra — Fix web UI transaction and navigation papercuts (FE)

P1 polish on the existing Transactions UI: detail memo display, title alignment without memo, tag chip shadow clipping, collapsed nav icon alignment, missing Settings icon. Branch `qdra-ui-papercuts`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed (plan archived, worktree clean, suites green)
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged into `ui-stage-3`; worktree and branch removed
- [ ] Kata `qdra` closed with evidence

### Task 2: ah5b — Improve transaction tag chip overflow display (FE)

P1: up to two rows of tag chips before the dotted overflow chip, or a documented deliberate fallback style. Branch `ah5b-tag-chip-overflow`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `ah5b` closed with evidence

### Task 3: 4nmw — Transaction detail panel interaction polish (FE)

Modality coherence, keyboard path to open detail from a focused row, no horizontal scrollbar in the record table, auto-dismissing toasts, detail workflow extracted to a feature hook. Branch `4nmw-detail-panel-polish`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `4nmw` closed with evidence

### Task 4: z8v9 — Add jump-to-date control to Transactions page (FE)

Date-jump control synchronized with the pager using the existing anchor_date pagination API; URL state per frontend-architecture. Branch `z8v9-date-jump`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `z8v9` closed with evidence

### Task 5: f9yj — Entry pickers fetch intent-filtered categories (FE)

Remaining acceptance of f9yj: entry-form category pickers fetch pre-filtered lists via the already-merged `economic_intent` filter instead of client-side filtering. Branch `f9yj-intent-pickers`.

- [ ] Setup, claim (already owned — comment instead), Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `f9yj` closed with evidence

### Task 6: y7yk — Extend account balances API for Overview aggregates (API)

USD-equivalent per balance row (resolvable rates, unconverted rows identifiable) and bulk current credit limits — no N+1. OpenAPI + regenerated clients + integration tests. Branch `y7yk-balances-aggregates-api`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `y7yk` closed with evidence

### Task 7: d7jh — Add featured-accounts balance strip (FE)

Always-visible strip of featured balance accounts in/adjacent to the sidebar, both sidebar states, domain display rules. Branch `d7jh-balance-strip`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `d7jh` closed with evidence

### Task 8: vp80 — Add Overview dashboard page (FE; requires Task 6)

Landing page: grouped balances with ≈USD subtotals and remaining credit (from y7yk API), month pulse numbers, recent activity; `/` lands on Overview. Branch `vp80-overview-page`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `vp80` closed with evidence

### Task 9: npb5 — Extend transactions list API with filter/search params (API)

Filter dimensions per webui-design (account, category, tag, member, amount range, date ranges, posting status, class) plus free-text search; typed allowlists; correct pagination under filters. Branch `npb5-transactions-filter-api`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `npb5` closed with evidence

### Task 10: 0b17 — Add Transactions search and filter bar (FE; requires Task 9)

Free-text search + Add-filter menu with removable typed chips, all server-driven and URL-backed; shared entity pickers. Branch `0b17-filter-bar`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `0b17` closed with evidence

### Task 11: bm0h — Extend account-record search API for registers (API)

Server-derived per-record running balance in chronological order and FQN-prefix record querying for group registers. Branch `bm0h-register-api`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `bm0h` closed with evidence

### Task 12: 7ts6 — Add Accounts chart-of-accounts page (FE)

FQN tree table with type badges, balances, hidden state; search/type filter/include-hidden toolbar; side-panel create/edit incl. credit-limit history; sidebar item enabled. Branch `7ts6-accounts-page`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `7ts6` closed with evidence

### Task 13: 6a1w — Add account page with register (FE; requires Task 11)

URL-addressable account page: header (balances, credit limit, metadata) + records-shape register with side peek panel and running balance in default chronological view. Branch `6a1w-account-register`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `6a1w` closed with evidence

### Task 14: t3ph — Add account group pages (FE; requires Tasks 11 and 13)

Every non-leaf FQN node is a page: child balance subtotals + combined prefix register including flow accounts. Branch `t3ph-group-pages`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `t3ph` closed with evidence

### Task 15: s5nw — Add Categories reference page (FE)

Establishes the reference-data pattern (searchable FQN tree + side-panel editor + include-hidden + tombstone delete), intent badges and required-intent editor. Gets the full operator review treatment — the next task copies this pattern. Branch `s5nw-categories-page`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `s5nw` closed with evidence

### Task 16: z7t0 — Add Tags and Members reference pages (FE; requires Task 15)

Instantiates the pattern from Task 15: Tags (tree) and Members (flat list) pages with editors; sidebar items enabled. Branch `z7t0-tags-members-pages`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `z7t0` closed with evidence

### Task 17: d7av — Add command palette: navigation, entry, app actions (FE)

Global-shortcut launcher: page/entity navigation (targets now exist from earlier tasks), entry commands, app actions; no dead commands; transaction search excluded (d608). Branch `d7av-command-palette`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `d7av` closed with evidence

### Task 18: mrs9 — Hierarchy restructuring API with subtree FQN rewrite (API)

Rename/move endpoints with atomic subtree FQN prefix rewrite for accounts, categories, tags, templates; reference integrity preserved. API-only — no UI consumer in this plan. Branch `mrs9-restructure-api`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `mrs9` closed with evidence

### Task 19 (stretch): axf6 — Advanced journal editor tab with shorthand escalation (FE)

Free record grid with per-currency balance meter, zero-sum save gate, row-mapped API errors, "Edit as journal" escalation. Last priority — only if the fleet gets here. Branch `axf6-journal-editor`.

- [ ] Setup, claim, Codex plan authored and committed
- [ ] Codex session completed
- [ ] Operator review passed (fix plans used ≤2)
- [ ] Squash-merged; cleanup done
- [ ] Kata `axf6` closed with evidence

## Final Verification

- [ ] On `ui-stage-3` with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run exactly one and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, kata refs closed, residual findings and unmerged branches
- [ ] Move this plan to `docs/plans/completed/`
