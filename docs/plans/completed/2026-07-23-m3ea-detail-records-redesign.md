# Plan: Redesign transaction detail records — lifecycle strip and dateless grid — Kata `m3ea`

The transaction detail panel (URL detail and account-register peek) gains a one-line lifecycle strip stating the transaction's chronology, and the record table drops its dates column for dense single-height rows with in-row deviation chains and a per-record disclosure. Kata issue: `m3ea`.

## Plan Context

- The design phase is complete (3 prototypes, judge, operator sign-off; evidence in the untracked `design-prototypes/` — read `judgment.md` and `prototype-c.md`/`prototype-a.md` for detail; NEVER commit that directory). The behavior contract is the updated Screen 2 Transaction detail bullet in `docs/webui-design.md`; the visual contract is the new "Lifecycle strip" bullet and the extended records-subtable sentence in `docs/webui-theme-arcade-cabinet.md`. Implement exactly these docs.
- Key behavior (authoritative wording in the docs):
  - Lifecycle strip under the panel header: Initiated/Pending/Posted segments with muted mono micro-labels, status glyphs, day-level dates; explicit muted dash for unreached stages; `min–max · varies` plus `n of m` counts when records disagree; expected-occurrence first segment; exact timestamps in stage tooltips; strictly financial chronology (created stays in the metadata footer); indicator class, zero tab stops... note: segments carry tooltips — tooltips must remain keyboard-reachable via the disclosure path, not via strip focus.
  - Record table: dates column removed; single-height rows (account, amount, category, tags, member, status, memo — full memos and complete tag sets stay inline); deviating records render a compact date chain in the Status cell as text with a glyph (never glyph/color alone); cancelled records keep their struck de-emphasized treatment.
  - Per-record disclosure: row activation (click/Enter/Space, `aria-expanded`) toggles a read-only sub-row with labeled exact timestamps, posting status, source, untruncated memo, rendered as plain undecorated table text; tooltips are supplements only; the disclosure never hosts editors (bn6q read-only contract).
  - Both surfaces share `TransactionDetailContent` (detail panel and `account-peek-panel.tsx`) with the existing ~680px container query — one implementation covers both, including the narrow layout.
- Must not regress: bn6q read-only panel (header Edit primary, footer Duplicate/Split/Delete, chips filter), 0288 EntryModal flows over the panel, expected-occurrence read-only contract, `frontend/src/features/ledger/PACKAGE.md` contracts.
- Affected code: `frontend/src/features/ledger/transaction-detail-panel.tsx`, `record-detail-cells.tsx`, related styles. Update `PACKAGE.md` contract wording and `PROJECT_STATE.md` in the delivering commit.
- Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from the documented rule; note any such edit prominently in the completion report.

## Tasks

### Task 1: Lifecycle strip and dateless record grid

End state: both detail surfaces render the strip and the redesigned grid per the docs.

- [x] The lifecycle strip renders under the panel header per both doc contracts, covering: uniform dates, varying dates (`min–max · varies`, `n of m`), unreached stages (muted dash), expected occurrences, single-record transactions (no deviation glyphs anywhere), exact timestamps in tooltips.
- [x] The record table drops the dates column; rows are single-height with full inline memos and complete tag sets; deviating records show the in-row date chain in the Status cell (text + glyph); cancelled records keep their treatment; freed width improves memo/tags.
- [x] Per-record disclosure via row activation (`aria-expanded`, click/Enter/Space) shows labeled exact timestamps, posting status, source, and untruncated memo as plain undecorated text; read-only always.
- [x] Narrow (peek/container-query) layout works per the shared component behavior.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` and `PROJECT_STATE.md`.
- [x] Commit the task as `Add the detail lifecycle strip and dateless record grid`.

### Task 2: End-to-end coverage

End state: e2e pins the redesign across representative variants.

- [x] E2E covers, in both the URL detail and the register peek: a simple 2-record spend (uniform dates — no deviation markers), a multi-record mixed-status transaction (strip varies/count segments + in-row chains), a recurring/expected occurrence (expected segment, read-only), and cancelled records; per-record disclosure open/close by mouse and keyboard with correct `aria-expanded`; no editor reachable anywhere (bn6q regression guard).
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover the detail records redesign with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean (`design-prototypes/` stays untracked and uncommitted).
- [x] With a clean worktree run `just review-loop "Detail lifecycle strip + dateless record grid per updated docs: strip variants, in-row deviation chains, per-record read-only disclosure, shared across detail and peek; bn6q/0288 contracts unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `m3ea` with the commits and validation evidence: `kata close m3ea --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
