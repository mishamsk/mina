# Plan: Editing in the transaction detail panel (Kata 89d7)

Make the transaction detail panel an editing surface consistent with the row and expanded-records editing just merged (gtmn, 4xb9): transaction-level values edit per the uniformity rule, the detail panel's full record table edits per record — all reusing the same ledger editing pieces. The Edit/Duplicate/Split escalation actions already exist and stay as they are.

## Plan Context

- Kata issue: `89d7`.
- MANDATORY pre-reads: `docs/webui-design.md` — Transactions detail-panel bullet ("class badge, counterparty title, display amount, initiated date, full record table, metadata, actions: Edit, Duplicate, Delete, Split…") and the "Inline editing — the uniformity rule" section; `docs/frontend-architecture.md`; `docs/TESTING.md`.
- Reuse (never fork): the ledger editing pieces from 4xb9/gtmn — `record-editing.ts`, `record-reference-cells.tsx`, `record-detail-cells.tsx`, `transaction-amount-cell.tsx`, and their field→API mapping (bulk record endpoints / transaction replace) and refresh rules (classification/chips, snapshots, 9985 invalidation). The detail panel is `frontend/src/features/ledger/transaction-detail-panel.tsx`.
- Behavior:
  - Transaction-level values in the panel header/summary (category/tags/member when uniform; amount for simple shapes) follow the uniformity rule exactly as on rows. Separate panel-header initiated-date editing is out of scope for this kata; initiated-date changes stay in the record-table date editor.
  - The panel's full record table gains the same per-record editors as the expanded records view (category, tags, member, memo, dates, posting status); structural changes keep escalating via the existing Edit/Split actions.
  - EXPECTED occurrence transactions: no editing in the panel (consistent with gtmn; confirm/dismiss flows own them).
  - After any successful edit: the panel content, the underlying list row, and affected snapshots refresh.
  - The panel remains non-modal per the overlays rule; keyboard/Escape behavior unchanged.
- e2e (`transactions-page.spec.ts` detail-panel patterns): edit a uniform transaction-level field from the panel → list row and panel refresh; per-record edit inside the panel's record table round-trips; simple-shape amount edit from the panel; expected transaction's panel shows no editors; deep-linked panel edit works; Escape/focus behavior preserved (regression).
- PROJECT_STATE.md: extend the inline-editing capability line if it enumerates surfaces. Ledger PACKAGE.md if contracts change. No ground-truth edits.

## Tasks

### Task/Commit 1: Detail-panel record-table and transaction-level editing

- [x] Implement per Plan Context reusing the shared editing pieces.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `89d7` (`kata comment 89d7 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: e2e + docs

- [x] e2e per Plan Context; PROJECT_STATE/PACKAGE.md updates as needed.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `89d7`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Detail-panel editing (kata 89d7): transaction-level values per the uniformity rule and per-record editors in the panel's record table, all reusing the 4xb9/gtmn ledger editing pieces and refresh rules; expected occurrences excluded; Edit/Duplicate/Delete/Split escalations unchanged; panel/list refresh after edits; e2e covers panel-level, record-level, simple-amount, expected-exclusion, deep-link and focus paths"`
- [x] Move this plan to `docs/plans/completed/`
