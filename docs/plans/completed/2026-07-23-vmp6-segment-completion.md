# Plan: Segment-by-segment completion for hierarchical entity inputs — Kata `vmp6`

The shared hierarchical pickers gain segment-by-segment completion: a breadcrumbed level-browser popup over a string-derived input model, with guarded Tab adoption and full-path search preserved. Kata issue: `vmp6`.

## Plan Context

- The design phase is complete. The behavior contract is the rewritten Pickers section (6 bullets) and the extended Keyboard line in `docs/webui-design.md`; the visual contract is the new `EntityPicker` popup note in `docs/webui-theme-arcade-cabinet.md`. All committed on this branch — implement exactly them.
- Additional interaction detail in the untracked `design-prototypes/judgment.md` (final spec, edge cases) and both prototype files; NEVER commit `design-prototypes/`.
- Key decisions (operator-approved): input text is the single source of truth with longest-resolvable-prefix derivation (unresolved colons fall back to prefix-scoped full-path search — existing `banks:Ch`-style substring queries keep working); Enter/ArrowRight drill into groups, Enter picks leaves, Tab adopts the active row ONLY after the user has typed text this session (never on tab-through past an untouched picker; Tab-select closes the popup so Tab-Tab still exits); `:` is always literal; ArrowLeft (empty filter) and Backspace at a trailing `:` back out one level; exact-FQN typing/paste selects immediately in every mode; intent-invalid and hidden subtrees are pruned, never disabled; sticky create row with prefix-free client validity rules and drill-then-create namespacing; multi-select retains the committed prefix for sibling batching while picked leaves drop from the list; level mode drops the 8-item slice (search mode keeps it).
- Shared implementation once in `frontend/src/features/ledger/entity-picker.tsx` (EntityPicker + EntityMultiPicker) so every FQN-backed input inherits it: entry-modal pickers, inline row editors (329k no-include-hidden contexts), bulk editors, filter pickers, reference-page pickers.
- Must not regress: existing picker e2e (exact-FQN selection, keyboard submission, create-new, account-type intent filtering), yvk7 constrained-cell popup layout, wkpr/hf98/0288 editor contracts (`frontend/src/features/ledger/PACKAGE.md`).
- Update `PACKAGE.md` picker contract wording and `PROJECT_STATE.md` in the delivering commit.
- Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from the documented rule; note any such edit prominently in the completion report.

## Tasks

### Task 1: Segment-completion model in the shared pickers

End state: the shared pickers implement the full contract; every consumer inherits it.

- [x] The string-derived model per the docs: prefix derivation, level-browser mode with the sticky breadcrumb header (theme treatment), prefix-scoped full-path search fallback, group rows with chevron+child-count, prune-don't-gray, exact-FQN immediate select.
- [x] The key vocabulary per the docs: Enter/ArrowRight drill, Enter-on-leaf pick, guarded Tab adoption (typed-text-this-session), literal `:`, ArrowLeft/trailing-`:` Backspace back-out, Esc unchanged; multi-select prefix retention; create row with the client validity rules.
- [x] Popup behavior holds in constrained cells (yvk7 constraints); level mode unsliced, search mode capped as today; aria-activedescendant plus polite mode-transition announcements.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` and `PROJECT_STATE.md`.
- [x] Commit the task as `Add segment-by-segment completion to the shared entity pickers`.

### Task 2: End-to-end coverage across representative inputs

End state: e2e pins the model on representative consumers.

- [x] E2E covers, on at least the entry-modal category picker, an inline row editor picker, and the tags multi-picker: drill by Enter/ArrowRight with breadcrumb updates; guarded Tab adoption (and that tab-through past an untouched picker moves focus without adopting); back-out by ArrowLeft and Backspace; full-path search fallback with unresolved colons; exact-FQN immediate select; create-new mid-path; multi-select sibling batching; account-type pruning on an account picker.
- [x] Existing picker e2e passes unmodified or with justified updates only.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover segment completion with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean (`design-prototypes/` stays untracked and uncommitted).
- [x] With a clean worktree run `just review-loop "Segment-by-segment picker completion per the rewritten Pickers section: breadcrumbed level browser, guarded Tab adoption, literal colon, prefix-scoped search fallback, prune-don't-gray, create row rules; existing picker contracts and yvk7/329k constraints unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `vmp6` with the commits and validation evidence: `kata close vmp6 --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
