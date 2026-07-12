# Plan: Transaction-row inline editing per the uniformity rule (Kata gtmn)

Add in-place editing on transaction rows exactly per the `docs/webui-design.md` "Inline editing — the uniformity rule" section, reusing the per-record editing pieces just built for the expanded records view (`record-editing.ts`, `record-reference-cells.tsx`, `record-detail-cells.tsx` in the ledger feature) — reuse and parameterize, never fork.

## Plan Context

- Kata issue: `gtmn`.
- MANDATORY pre-reads: `docs/webui-design.md` uniformity-rule section (this is the complete acceptance spec), `docs/webui-theme-arcade-cabinet.md` (in-table chips/markers; edit trigger visuals), `docs/frontend-architecture.md`, `docs/TESTING.md`.
- The uniformity rule (spec, verbatim intent):
  - Category, tags, member: editable ON THE ROW only when the value is identical across all active records; the edit applies to ALL of them. Rows with mixed values (MIXED chips) offer NO row-level editor for that field — editing happens per record in the expansion.
  - Amount: editable on the row ONLY for simple shapes — minimal two-sided single-currency spend/income/refund/transfer — where the change derives mechanically to both records. All other shapes: no row amount editing.
  - Edit trigger: the keyboard edit action on the focused cell or a hover-revealed edit control on editable cells. Chip activation still ALWAYS filters, never edits.
- Persistence: category/tags/member row edits map to the record bulk endpoints across all the transaction's active record ids (or transaction replace where a bulk endpoint doesn't cover the field — match the task-25 field→API mapping); the simple-shape amount edit maps to transaction replace with both record amounts derived mechanically. Backend validation errors surface on the editor per standard feedback rules.
- Expected occurrence rows (b1m2): row editing does not apply to EXPECTED occurrence rows (they confirm/dismiss; editing follows confirmation per recurring semantics "no confirm-with-edits") — assert the editors are absent there.
- Refresh: same rules as task 25 (row classification/chips, snapshots, 9985 invalidation).
- e2e (`transactions-page.spec.ts`): uniform-value row edits category/tags/member and applies to all records (verify via expansion); mixed-value row lacks the editor for that field; simple spend row edits amount and both records update mechanically; non-simple shape lacks amount editing; expected occurrence row lacks all editors; keyboard path for one field; chip click still filters (regression guard).
- PROJECT_STATE.md: extend the inline-editing capability line. Ledger PACKAGE.md if contracts change. No ground-truth edits.

## Tasks

### Task/Commit 1: Row-level reference-field editing (category, tags, member)

- [x] Implement per Plan Context (uniform-value gating, apply-to-all persistence, reuse task-25 editors).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `gtmn` (`kata comment gtmn --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Simple-shape amount editing

- [x] Implement per Plan Context (shape detection, mechanical two-record derivation via replace).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `gtmn`
  - [x] Commit changes

### Task/Commit 3: e2e + docs

- [x] e2e per Plan Context; PROJECT_STATE.md/PACKAGE.md updates.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `gtmn`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Transaction-row inline editing (kata gtmn): uniformity rule implemented verbatim from webui-design — category/tags/member row edits only when identical across active records applying to all (bulk endpoints), amount only for minimal two-sided single-currency shapes deriving mechanically via replace; reuses the 4xb9 record-editing pieces; expected occurrence rows excluded; chips still filter; e2e covers uniform/mixed/simple/non-simple/expected paths"`
- [x] Move this plan to `docs/plans/completed/`
