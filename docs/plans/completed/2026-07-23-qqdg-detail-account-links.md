# Plan: Link accounts in transaction detail views to account pages — Kata `qqdg`

Record-table account paths in the transaction detail panel and account-register peek become single whole-path links to the account's register page. Kata issue: `qqdg`.

## Plan Context

- The design phase is complete. The behavior contract is the new hierarchical-names bullet and the extended Screen 2 detail sentence in `docs/webui-design.md`; the visual contract is the extended `FqnPath` line in `docs/webui-theme-arcade-cabinet.md` (rest state identical to the non-interactive path; whole-anchor hover underline, per-segment-colored, no fill, no press-in; standard focus ring; collapsed middle segments expand while focus is visible; ellipsis never focusable). Both are committed on this branch — implement exactly them.
- Additional detail in the untracked `design-prototypes/prototype-a.md` and `judgment.md`; NEVER commit `design-prototypes/`.
- Key decisions: the whole FQN is one react-router anchor (a link mode on the shared `FqnPath`) navigating to the leaf account's register page; destinations are always accounts, never groups (hierarchy prefix-free invariant); unresolvable accounts render plain text; account-name links never filter and never edit; the header counterparty title stays text; peek self-links are allowed (uniformity).
- Propagation: link activation (click, modified-click new-tab, Enter on the focused link) must not toggle the m3ea per-record disclosure or anything else; ride the existing `isInteractiveRowTarget` / target-guard machinery in `frontend/src/features/ledger/transaction-detail-panel.tsx`.
- Must not regress: m3ea lifecycle strip + disclosure, bn6q read-only contract, chip filter behavior (`frontend/src/features/ledger/PACKAGE.md`).
- Affected code: `frontend/src/features/ledger/fqn-path.tsx` (link mode), `transaction-detail-panel.tsx` (record account cells). Update `PACKAGE.md` if contract wording changes; update `PROJECT_STATE.md` (user-visible navigation feature) in the delivering commit.
- Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from the documented rule; note any such edit prominently in the completion report.

## Tasks

### Task 1: FqnPath link mode and detail wiring

End state: account paths link per the docs in both detail surfaces.

- [x] `FqnPath` gains the link mode per the theme contract; record-row account cells in the shared detail content render it linking to the account's register page; unresolvable accounts stay plain text; full path stays available (tooltip + expand-on-focus truncation with a never-focusable ellipsis).
- [x] Pointer and keyboard activation navigate without toggling the record disclosure, filtering, or editing; Enter on the row still toggles disclosure; one tab stop per account path.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` (if contract wording changes) and `PROJECT_STATE.md`.
- [x] Commit the task as `Link detail record account paths to account pages`.

### Task 2: End-to-end coverage

End state: e2e pins navigation and non-interference.

- [x] E2E asserts, in both the URL detail and the register peek: clicking an account path navigates to that account's register; Enter on the focused link navigates while Enter on the row toggles disclosure; link activation never opens editors or filters; keyboard focus reveals the collapsed middle segments.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover detail account links with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean (`design-prototypes/` stays untracked and uncommitted).
- [x] With a clean worktree run `just review-loop "Whole-FQN account links in detail/peek record rows per updated docs: navigate to registers, never filter/edit, no disclosure interference; m3ea/bn6q contracts unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `qqdg` with the commits and validation evidence: `kata close qqdg --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
