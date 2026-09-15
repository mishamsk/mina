# Plan: P1/P2 fleet feedback round — sequential sub-branch delivery (operator briefs, no Kata issues)

Address Misha's feedback on the 2026-09-13 P1/P2 fleet: return frontend e2e coverage to the testing guidance, fix the keyboard-shortcuts help and command-palette behaviors that shipped wrong, repair entity-list keyboard navigation and focus styling, simplify transaction-draft persistence, add entry chords, and redesign the palette modifier hint per the design docs. Deliver one brief at a time as a Codex-implemented sub-branch of the main working branch, with the session running this plan acting as operator: plan author, reviewer, integrator. This plan is self-contained; it deliberately inlines a modified (strictly sequential) version of the codex-goal-fleet workflow and does not depend on that skill.

## Plan Context

### Roles and ground rules

- Operator: the session executing this plan. Authors sub-branch plans, launches and waits on implementor Codex sessions, reviews, merges. Never edits implementation code — all code changes flow through implementor sessions against committed plan files. Plan files and reverts of unauthorized `docs/` edits are operator-owned.
- Implementor Codex: the only implementor, headless, one session at a time, running `gpt-6-astra` with `medium` reasoning effort.
- Integration branch ("main working branch"): `fleet-p1-p2-open-issues`, the branch the operator session is on when executing this plan. Never touch `main`.
- Issue set: no Kata issues; the briefs below are the scope. No Kata claim or close steps apply.

### What went wrong last round (and the rules that fix it)

- Over-coverage: every subplan demanded "browser coverage" for its fix, echoing Kata acceptance text instead of `docs/FRONTEND-TESTING.md`. Implementors and review-loop fixers then added REST-driven fixtures as evidence, regression tests for one-line fixes, and per-state matrices. Testing policy below is mandatory in every subplan and every review prompt.
- Design shortfall: the palette modifier subtitle was specified from a research summary, not from `docs/webui-design.md` and `docs/webui-theme-arcade-cabinet.md`, and the jumpy result was accepted at review. Design policy below is mandatory for every user-visible change.

### Testing policy (mandatory in every subplan and dispatch prompt)

- `docs/FRONTEND-TESTING.md` governs. No new e2e test for a bug fix or small behavior change; fold a visible assertion into the existing journey that already exercises that surface, or add nothing.
- No REST calls as the action or evidence under test; fixture-only API setup is allowed when it keeps a journey short. No per-state or per-route matrices, no exact-geometry assertions, no fixed waits.
- Net e2e test count may only go down or stay equal per task unless the brief names a genuinely new essential journey.
- Review-loop reviewers and fixers must not request or add coverage; each subplan's Constraints and the dispatch prompt say so verbatim: "Do not add e2e tests; reviewers must not request coverage; fold any missing assertion into an existing journey."
- Operator gate at every merge: `git diff <base>...<branch> --stat -- frontend/tests` plus a read of every added or changed test against the policy; violations go into a fix plan before merge.

### Design policy (mandatory for every user-visible change)

- Before authoring a subplan, the operator reads the relevant `docs/webui-design.md` sections and `docs/webui-theme-arcade-cabinet.md`, and writes a short design spec into the subplan: placement, states, geometry stability (no layout jumps on selection, hover, or modifier state), theme tokens, keyboard and focus behavior.
- Implementor screenshots of the new surface are required in the completion report; the operator judges them against the theme doc before merge. Anything jumpy, re-ordering, or styled off-theme is a fix-plan defect, not a nit.

### Rules of engagement

- Strictly sequential: exactly one active sub-branch / implementor session at any time. Finish (merge or fail) the current task before starting the next.
- Implementor quota exhausted: stop, schedule a timed background wait until the stated reset time, relaunch once. Do not ask the user.
- Operator quota exhausted: stop and wait without asking.
- Review budget per task: at most ONE `just review-loop --plan "<implementation plan path>"`, run by the implementor from the initial implementation plan's Success Criteria. The plan is immutable ground truth for review-loop reviewers and fixers. If review-loop leaves unresolved comments, they fold into operator fix plans — never re-run review-loop.
- After the implementor session: the operator runs the review below. Findings warrant at most TWO fix plans per task. Every fix plan MUST state "Do not run review-loop." in its Constraints and omit review-loop from its Success Criteria.
- A task still failing after 2 fix plans: leave the sub-branch unmerged, mark the task failed with findings, then proceed only to a task that is still viable — skip any task that depends on the failed one, directly or transitively. If no viable tasks remain, stop the fleet entirely. Never merge a failing branch; never silently drop scope.
- Environmental failure (toolchain, `gt`, non-resetting quota): stop and ask.

### Per-task workflow (referenced by every task below)

1. Setup: from the main working branch, `gt <branch> <main-working-branch> -x true` (worktree lands in `.worktrees/<branch>`).
2. Author the implementation plan in the sub-worktree at `docs/plans/2026-MM-DD-<topic>.md` from `docs/plan_template.md`. The subplan covers the brief's full slice and normally decomposes it into multiple sequential tasks and commits. Include concrete checkboxes, the Testing policy and Design policy text, the design spec, and only the repository-owned validation commands that provide relevant evidence. Initial plans keep the standard Success Criteria including one `just review-loop`. Plans changing user-visible behavior include a PROJECT_STATE.md update item and package-doc updates where contracts change. Before authoring, read the owning ground-truth docs for the touched area (`docs/architecture.md`, `docs/frontend-architecture.md`, `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, `docs/FRONTEND-TESTING.md`). Commit the plan in the sub-worktree.
3. Dispatch: from the sub-worktree, headless in the background (do not use `just codex-goal` — it fails without a terminal), run exactly:

   ```sh
   codex exec -m gpt-6-astra -c model_reasoning_effort=medium --dangerously-bypass-approvals-and-sandbox "Implement <plan_file> end to end. Follow its task order, constraints, and stopping conditions. Success means every applicable checkbox and the plan's success criteria are complete, task commits are created as directed, and the finished plan is moved to docs/plans/completed. The plan file itself is immutable except for ticking checkboxes and the final move to docs/plans/completed. Do not add e2e tests; reviewers must not request coverage; fold any missing assertion into an existing journey. If the plan directs a just review-loop run, invoke it AT MOST ONCE in this session: after that one invocation and its fix commits, the review-loop item is satisfied permanently — never invoke it again, even if findings remain; record unresolved findings in your final report instead. If blocked, leave the affected checkbox open and report the blocker with evidence."
   ```

   Do not touch the worktree while the session runs. Completion signal: plan moved to `docs/plans/completed/` and process exit. Review-loop can take ~10 minutes; use long poll timeouts and do not kill it while heartbeat/progress lines continue.

4. Operator review (each iteration):
   - Sanity: all checkboxes ticked, plan archived, sub-worktree clean, suites reported green.
   - Testing gate: diff `frontend/tests` against the policy; count tests per spec before and after.
   - Docs governance: `git diff <main-working-branch>...<branch> -- docs/` — targeted ground-truth doc updates that the brief requires stay; anything broader is reverted via a fix plan (or an operator-owned commit for trivial reverts).
   - Architectural audit: read-only subagents over the sub-branch diff against the owning docs; the audit prompt includes the Testing policy and must flag added coverage as a defect.
   - Live verification for anything with a runtime surface: run `just dev --demo`, drive the UI (Playwright script), screenshot, judge against `docs/webui-design.md` and the theme doc — observed behavior and appearance beat checkboxes.
5. Fix loop (max 2 per task): author an implementation-only fix plan from the template — file:line defects with live evidence, a "protect — do not regress" list, explicit scope exclusions, "Do not run review-loop." in Constraints, no review-loop in Success Criteria. Commit it in the sub-worktree, re-dispatch Codex, re-review.
6. Merge: from the main working branch's worktree, `git merge --squash <branch>`, commit as `Squash merge branch '<branch>'`. Trivial conflicts (plans, docs) resolve as operator; implementation conflicts: abort, merge the main working branch into the sub-worktree, hand resolution to Codex via a fix plan (no review-loop), re-review, retry.
7. Cleanup: `git worktree remove .worktrees/<branch>`, `git branch -D <branch>`.
8. Rule changes discovered in review go into ground-truth docs first (operator edits, committed separately); long-horizon gaps become new Kata issues, not fix-plan items.

## Briefs

### Brief A — Entity list keyboard navigation and focus styling

On Categories and every other entity list (Accounts tree, Tags, Members, Templates, Recurring definitions; check registers and the Transactions browser for consistency), Tab currently lands on the first row instead of the table, arrows scroll the container instead of moving row selection, Tab walks rows, and focused rows show the purple focus ring. Required: the table is one Tab stop (roving tabindex); Up/Down move the active row, Home/End jump, Enter/Space activate the row's destination or action exactly as click does; the active row uses the hover highlight semantics (instant fill step per the theme), never the `--ring` outline; keyboard-selected rows scroll into view inside the designated scroller; nested row controls stay reachable by Tab from the active row. Update `docs/webui-design.md` table keyboard rules and the theme doc focus bullet only where the rule is genuinely missing.

### Brief B — Keyboard shortcuts help corrections

The help dialog must show the Transaction entry group only while the entry modal is visible, which means `?` opens the help above the entry modal (stacking and focus return to the modal) instead of being suppressed under it, and the static Transaction entry group becomes a group registered by the mounted entry modal. Remove the Command palette group entirely. The dialog shows no focus ring on its scroll region; Up/Down (and PageUp/PageDown) scroll the catalog regardless of which element inside the dialog has focus; Escape closes. Keep `?` suppressed while typing in editable targets.

### Brief C — Command palette: keyboard-only rows, stable heights, modifier ribbon

Remove all mouse-hover effects on palette rows (mouse position never changes the active row; click still activates). Rows have stable heights: transaction rows always use a taller fixed allowance showing the full account and description view without expanding on selection; account rows always use the truncated view. Replace the in-row modifier subtitle with a hanging ribbon attached below the palette window, shown only while the active row has a conditional modifier action, with stable content regardless of modifier state (e.g. `Enter` open register · `Cmd/Ctrl Enter` open filtered Transactions), styled per the cabinet landmark treatment; no re-ordering, no per-row subtitle, no live-region churn beyond one description. Remove the account-action description clutter from row accessible names.

### Brief D — Entry chords

`n` opens Spend as today; two-key chords `n s` (Spend), `n i` (Income), `n r` (Refund), `n t` (Transfer), `n e` (Exchange), `n a` (Advanced) open the entry modal on that tab. Use a short chord window after `n` (about 500 ms) during which the second key selects the tab and a timeout opens Spend; ignore chords while typing or over blocking overlays. Register the chords in the Global help group and the command-palette entry commands' `Kbd` hints; update `docs/webui-design.md` global shortcuts.

### Brief E — Simplified transaction draft persistence

Flip the create-draft model: nothing persists across modal close by default. Closing a dirty create draft (Esc, close button, navigation-driven close) asks "Save draft?" with Discard draft as the default action (Enter and Esc both discard) and Save draft as the explicit alternative; `Cmd/Ctrl S` while the modal is open saves the draft and closes. Only an explicitly saved draft is stored in IndexedDB (with its active tab) and restored on the next create launch; Clear draft still clears both memory and the saved draft after its confirmation. Sticky defaults (date, account, type) carry only within the open modal session across Save and add another, never across close. Remove the now-unneeded baseline-persistence machinery, the launch-conflict flow where it no longer applies, and rewrite the entry-modal draft bullets in `docs/webui-design.md` and the ledger package doc. Edit/split/duplicate discard confirmations keep their current wording but adopt the same Enter-and-Esc-discard default for consistency.

### Brief F — Frontend e2e hygiene sweep

Audit every e2e test added or changed by the 2026-09-13 fleet and by this fleet (`git log --format=%h main..HEAD -- frontend/tests`) against `docs/FRONTEND-TESTING.md`: remove regression tests for small fixes, matrix-style tests, REST-driven actions or evidence, exact-geometry assertions, and fixed waits; fold any essential visible assertion into the existing journey for that surface; consolidate per-surface specs; leave the suite smaller than it started this fleet. Record the before/after test count per spec in the commit body. This brief runs last so it covers the whole fleet.

## Tasks

Per-task checklist — every task below runs the full per-task workflow; tick a task only after completing all of:

1. Setup, implementation plan authored and committed (with Testing policy, Design policy, and design spec)
2. Implementor session completed (plan archived, worktree clean, suites green)
3. Operator review passed (testing gate, docs gate, audit, live verification; fix plans used ≤2)
4. Squash-merged into the main working branch; worktree and branch removed

- [x] Task 1: Brief A — Entity list keyboard navigation and focus styling (foundational table behavior; first) — branch `fb-entity-list-keyboard`
- [x] Task 2: Brief B — Keyboard shortcuts help corrections (shell overlay stacking; before palette and chords work that register help content) — branch `fb-shortcuts-help`
- [ ] Task 3: Brief C — Command palette keyboard-only rows, stable heights, modifier ribbon (depends on Task 2 for the help group removal) — branch `fb-palette-rows-ribbon`
- [ ] Task 4: Brief D — Entry chords (registers help content; after Task 2) — branch `fb-entry-chords`
- [ ] Task 5: Brief E — Simplified transaction draft persistence (largest; after chords so the entry shortcut set is final) — branch `fb-draft-persistence`
- [ ] Task 6: Brief F — Frontend e2e hygiene sweep (last; covers both fleets) — branch `fb-e2e-hygiene`

## Final Verification

- [ ] On the main working branch with all merged branches: `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] `just test-frontend-e2e` passes
- [ ] Testing gate at fleet level: total e2e test count is lower than at the start of this fleet, and no test added by either fleet violates the policy
- [ ] Deviation from template, per operator rules: NO fleet-level `just review-loop` (each branch already ran its one allowed loop) — unless merges needed conflict resolution or cross-branch interactions were never covered, in which case run `just review-loop --plan "<this fleet plan's repo-relative path>"` exactly once and fold unresolved comments into a final fix plan (no further review-loop)
- [ ] Final report: per task — merged/failed, fix plans used, live-verification evidence, governance interventions, residual findings and unmerged branches
- [ ] Move this plan to `docs/plans/completed/`
