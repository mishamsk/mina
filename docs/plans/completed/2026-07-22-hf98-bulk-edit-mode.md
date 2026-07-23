# Plan: Gate transaction selection behind an explicit bulk-edit mode — Kata `hf98`

The shared transaction browser hides selection checkboxes during normal browsing and gains an explicit bulk-edit mode: a toolbar action enters/exits it, entering reveals the checkbox column and a persistent bulk action surface, and supported-field edits from the surface or any selected row apply to the whole selection per the uniformity rule. Kata issue: `hf98`.

## Plan Context

- The design phase is complete. Implement the interaction contract in [Bulk operations](../webui-design.md#bulk-operations) and its presentation contract in [Arcade Cabinet: Shape & Depth](../webui-theme-arcade-cabinet.md#shape--depth).
- Reuse the existing machinery: the current checkbox column, header checkbox, page-local selection state, and `BulkActionBar` (pickers, endpoints, skip reporting) get gated/evolved behind the mode flag — do not rebuild bulk editing. The kata's framing is removing the always-on checkbox column, not new bulk semantics.
- Applies to every embedding of the shared browser in transaction shape (Transactions page, drill-down pages). Account-register record-level bulk is out of scope and unchanged.
- Preserve the existing contracts in [the ledger package documentation](../../frontend/src/features/ledger/PACKAGE.md).
- Update `frontend/src/features/ledger/PACKAGE.md` implicit contracts for the mode-gated selection in the same commit; this is a user-visible feature — update `PROJECT_STATE.md` accordingly.
- Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from the documented rule; note any such edit prominently in the completion report.

## Tasks

### Task 1: Bulk-edit mode state and toolbar swap

End state: the mode lifecycle and toolbar conform to the owning design contract.

- [x] Deliver the lifecycle, entry points, toolbar swap, frozen controls, pagination behavior, and transient-state cleanup specified by [Bulk operations](../webui-design.md#bulk-operations).
- [x] Commit the task as `Add bulk-edit mode gating to the transaction browser`.

### Task 2: In-mode selection mechanics and interaction lockdown

End state: selection is keyboard-complete and conflicting browser interactions are unavailable.

- [x] Deliver the selection and interaction-availability behavior specified by [Bulk operations](../webui-design.md#bulk-operations), with the selected-row and inert-marker treatments owned by [Arcade Cabinet: Shape & Depth](../webui-theme-arcade-cabinet.md#shape--depth).
- [x] Commit the task as `Implement bulk-mode selection mechanics and interaction lockdown`.

### Task 3: Bulk field edits from surface and selected rows

End state: bulk field edits conform to the owning design contract from both entry points.

- [x] Evolve the existing `BulkActionBar` and row editor machinery to deliver the field-edit behavior, uniformity handling, and Esc lifecycle specified by [Bulk operations](../webui-design.md#bulk-operations).
- [x] Update `frontend/src/features/ledger/PACKAGE.md` contracts and `PROJECT_STATE.md` in this commit.
- [x] Commit the task as `Wire bulk field edits to the selection with uniformity reporting`.

### Task 4: End-to-end coverage

End state: e2e pins the complete owning contract across shared-browser embeddings and supported widths.

- [x] E2E covers [Bulk operations](../webui-design.md#bulk-operations) at the browser boundary, including keyboard and narrow-screen behavior.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover bulk-edit mode with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean (`design-prototypes/` stays untracked and uncommitted).
- [x] review-loop has already been run for this plan and its fix commits are on the branch; the review budget is consumed. Do not invoke `just review-loop` again under any circumstances.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `hf98` with the commits and validation evidence: `kata close hf98 --done --message "<summary>" --commit <sha> --test "just pre-commit; just test; just test-frontend-e2e" --agent`.
