# Plan: Deliver the open P1 UI fixes and features — sequential sub-branch delivery (`kata ready --agent` open P1 frontend issues, excluding qbg9)

Deliver all currently ready, non-blocked P1 web UI Kata issues — transaction-table inline-editing correctness, table layout/space reclamation, transaction detail and editor surfaces, shared hierarchical inputs, and reference-table fixes. Deliver one Kata issue at a time as a Codex-implemented sub-branch of the main working branch, with the session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the session executing this plan. Authors sub-branch plans, launches and waits on implementor Codex sessions, reviews, merges, closes kata issues. Never edits implementation code — all code changes flow through implementor sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Implementor Codex: the only implementor, headless, one session at a time, running `gpt-5.6-sol` with `high` reasoning effort.
- Integration branch ("main working branch"): whatever branch the operator session is currently on when executing this plan. Never touch `main`.
- Issue set: the open P1 frontend issues returned by `kata ready --agent` on 2026-07-21: 329k, f6xc, 46vf, yvk7, trxj, zd6c, 8tkz, wkpr, 1tjt, vmp6, qqdg, hf98, zb9f, bn6q, m3ea, 0288, 9nkm. Issue qbg9 (wider transaction description column) is deliberately excluded per the user's instruction; it stays blocked-by trxj, 8tkz, hf98, and zb9f and is not part of this fleet.

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / implementor session at any time. Finish (merge or fail) the current task before starting the next.
- Implementor quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop`, run by the implementor from the initial implementation plan's Success Criteria. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
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

## Tasks

Per-task checklist — every task below runs the full per-task workflow; tick a task only after completing all of:

1. Setup, claim, implementation plan authored and committed
2. Implementor session completed (plan archived, worktree clean, suites green)
3. Operator review passed (fix plans used ≤2)
4. Squash-merged into the main working branch; worktree and branch removed
5. Kata issue closed with evidence

Task scope details live in the Kata issues (`kata show <ref> --agent`). Respect the stated dependencies; otherwise run in the listed order.

- [ ] Task 1: `wkpr` — Enforce single explicit-commit transaction inline editing (bug; foundational inline-editing interaction model — single active editor, explicit save/cancel — that Tasks 2–5 build on) — branch `wkpr-single-inline-edit`
- [ ] Task 2: `46vf` — Keep the transaction table responsive after inline saves (bug; builds directly on the explicit-commit save flow established in Task 1) — branch `46vf-inline-save-responsive`
- [ ] Task 3: `329k` — Remove Include hidden controls from inline transaction editors (bug; editor-content cleanup on the inline editors stabilized in Tasks 1–2) — branch `329k-remove-include-hidden`
- [ ] Task 4: `yvk7` — Prevent assigned tag chips from overlapping the tag editor menu (bug; tag-editor popup layout fix, ordered after the inline-editing model settles) — branch `yvk7-tag-editor-overlap`
- [ ] Task 5: `hf98` — Gate transaction selection behind an explicit bulk-edit mode (feature; structural table change removing the always-on checkbox column and layering bulk mode over the Task 1 editing model; first of the space-reclamation set) — branch `hf98-bulk-edit-mode`
- [ ] Task 6: `zb9f` — Remove transaction expansion chevrons (feature; reclaims the disclosure column; independent of Task 5 but grouped in the same layout wave) — branch `zb9f-remove-chevrons`
- [ ] Task 7: `trxj` — Collapse transaction row actions before they overlap amounts (bug; actions-cell collapse behavior tuned after the structural column removals in Tasks 5–6) — branch `trxj-collapse-row-actions`
- [ ] Task 8: `8tkz` — Keep recurring indicators inside the transaction description column (bug; description-cell layout after the surrounding column reclamations) — branch `8tkz-recurring-indicators`
- [ ] Task 9: `zd6c` — Restore right-aligned transaction amount chips (bug; amount alignment verified against the final row layout produced by Tasks 5–8) — branch `zd6c-amount-right-align`
- [ ] Task 10: `9nkm` — Render Hide expected as an icon chip in transaction toolbars (feature; toolbar polish, independent of row layout, closes out the transaction-table wave) — branch `9nkm-hide-expected-chip`
- [ ] Task 11: `0288` — Replace the transaction edit sidebar with a spacious modal editor (feature; establishes the canonical editor surface that Task 12 routes to) — branch `0288-modal-editor`
- [ ] Task 12: `bn6q` — Disable inline editing in the transaction side detail panel (feature; requires Task 11 — the panel's Edit action opens the canonical modal editor) — branch `bn6q-side-panel-readonly`
- [ ] Task 13: `m3ea` — Redesign transaction detail records through judged prototypes (feature; detail-record redesign lands before detail-view link work to avoid rework) — branch `m3ea-detail-records-redesign`
- [ ] Task 14: `qqdg` — Link accounts in transaction detail views to account pages (feature; lands account links on the redesigned detail records from Task 13) — branch `qqdg-detail-account-links`
- [ ] Task 15: `vmp6` — Add segment-by-segment completion for hierarchical entity inputs (feature; shared FQN-input behavior integrated after the editor surfaces from Tasks 11–12 settle so completion lands once across final editors and pickers) — branch `vmp6-segment-completion`
- [ ] Task 16: `1tjt` — Restore the compact Members table layout (bug; reference-table fix independent of the transaction work) — branch `1tjt-members-compact`
- [ ] Task 17: `f6xc` — Definitively fix clipped filled favorite stars (bug; root-cause fix in the shared icon/button primitive plus a regression check, run last so verification covers every table in its final state) — branch `f6xc-favorite-star-clip`

## Final Verification

- [ ] On the main working branch with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run exactly one and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, Kata refs closed, residual findings and unmerged branches (per-task evidence recorded on each closed Kata issue)
- [ ] Move this plan to `docs/plans/completed/`
