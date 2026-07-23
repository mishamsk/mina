# Plan: Disable inline editing in the transaction side detail panel — Kata `bn6q`

The transaction side detail/peek panel becomes read-only by construction: a single labeled header Edit action (plus footer Duplicate/Split/Delete) opens the transaction editor modal; no pointer or keyboard path starts an inline editor inside the panel. Kata issue: `bn6q`.

## Plan Context

- The design phase is complete. The behavior contract is `docs/webui-design.md` (updated on this branch): Screen 2 Transaction detail bullet (read-only panel, header Edit primary, footer Duplicate/Split/Delete, chips keep filtering, panel stays beneath the modal and refreshes after save), the simplified Overlays/Esc bullet (plain "Esc closes the panel" — the panel-inline-editor precedence branches are gone), and the new inline-editing bullet (inline editing exists only in transaction rows and the expanded records subtable). Implement exactly these docs.
- Additional detail in the untracked `design-prototypes/prototype-a.md` and `judgment.md` (affordance inventory, freed-space use, grafts: expected-occurrence rows expose no Edit affordance at all; tooltips carry no keyboard-hint chrome). Read them; NEVER commit `design-prototypes/`.
- This is largely a deletion: the panel's inline editors, their `inlineEdit`/`onUpdate*` plumbing, the panel branches of the inline-edit coordinator (`InlineEditAsideScope`, panel Esc/outside-click guard branches in `frontend/src/features/ledger/inline-editing.tsx`), and the panel's uniform-values editor scaffolding go away; `transaction-detail-panel.tsx`, `record-detail-cells.tsx`, `record-reference-cells.tsx` keep only display variants for the panel. The freed space improves the panel per the docs (full wrapped memos, complete tag sets, denser records).
- The table's inline editing (wkpr/46vf contracts) is untouched; the EntryModal (0288) is the only editing surface from the panel; expected occurrences remain read-only with Confirm/Dismiss only and now expose no Edit.
- Update `frontend/src/features/ledger/PACKAGE.md` contracts (panel editing clauses) and `PROJECT_STATE.md` in the delivering commit.
- Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from the documented rule; note any such edit prominently in the completion report.

## Tasks

### Task 1: Make the panel read-only and rewire actions

End state: the panel matches the updated docs in every embedding (transactions detail, register peek).

- [x] All panel cells (transaction-level values and record rows) are display-only: no hover edit controls, no F2/keyboard edit targets (read-only cells leave the tab order), no inline editors mountable inside the panel by any path; entity chips keep their filter behavior.
- [x] A labeled Edit button sits in the panel header as the primary action; Duplicate, Split, Delete sit in the footer bar; Edit/Duplicate/Split open the EntryModal over the panel, which stays open beneath and refreshes after save; expected-occurrence panels expose no Edit affordance.
- [x] The panel-specific branches of the inline-edit coordinator and the now-vestigial Esc/outside-click guards are removed; panel Esc simply closes the panel per the simplified doc rule; the freed layout renders full memos and complete tag sets per the detail-view contract.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` and `PROJECT_STATE.md`.
- [x] Commit the task as `Make the transaction detail panel read-only with a single Edit action`.

### Task 2: End-to-end coverage

End state: e2e pins read-only-ness and the action routing.

- [x] E2E asserts: no editor appears in the panel for any former trigger (hover, F2, Enter, click on values); chips filter from the panel; header Edit opens the modal in edit mode with the panel beneath, and the panel refreshes after save; footer Duplicate/Split/Delete work; expected-occurrence panel has no Edit; Esc closes the panel directly; existing panel-editing e2e is removed or rewritten to the new contract.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover the read-only detail panel with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean (`design-prototypes/` stays untracked and uncommitted).
- [x] With a clean worktree run `just review-loop "Read-only transaction detail panel per updated webui-design.md: single header Edit to the EntryModal, footer Duplicate/Split/Delete, no inline-edit path in the panel, simplified panel Esc; table inline editing and 0288 modal contracts unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `bn6q` with the commits and validation evidence: `kata close bn6q --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
