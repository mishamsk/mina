# Plan: Per-record editing in the expanded records view (Kata 4xb9)

Make the expanded journal-records subtable editable per record, per `docs/webui-design.md`: journal records are one expansion away, always editable; per-record category, tags, member, memo, statuses, and dates edit in place with the shared pickers; non-mechanical structural changes (accounts, amounts, currencies, record add/remove) still route to the full journal editor. First task of the editing suite — the field→editor wiring built here is reused by row inline editing (gtmn) and detail-panel editing (89d7); build it as reusable ledger-feature pieces, not page-local code.

## Plan Context

- Kata issue: `4xb9`.
- MANDATORY pre-reads: `docs/webui-design.md` — "Inline editing — the uniformity rule" section (uniformity rule for transaction-level values; "Everything else is edited per-record in the expanded records view"; inline editors are the shared pickers; the edit trigger rule: keyboard edit action on the focused cell or a hover-revealed edit control on editable cells — chip activation always filters, never edits); `docs/webui-theme-arcade-cabinet.md` (the inline expanded records subtable renders plain undecorated table text — keep that at-rest look; editors appear on the edit trigger); `docs/frontend-architecture.md`; `docs/TESTING.md`; `api/openapi.yaml` (record-level/bulk endpoints and transaction replace).
- Editable per record: category (single picker), tags (multi picker), member (picker, clearable), memo (text), initiated/pending/posted dates (date inputs), posting status (themed select, constrained). NOT editable inline: account, amount, currency, record add/remove — those open the full journal editor (existing escalation affordance).
- API mapping (decided approach): use the smallest existing API that owns each field —
  - category/tags/member and posting status: the record-level bulk endpoints (single-record invocation) if they cover the field; otherwise transaction replace.
  - memo and dates: transaction replace (full replacement built from the current shape with the one record's field changed) unless a record endpoint exists.
  - NO new backend endpoints unless a field genuinely has no path (then OpenAPI + `just openapi`/`just frontend-openapi` + app-test coverage per docs/TESTING.md + `just test-integration`).
  - Surface backend rejections (e.g. mixed expected/cancelled posting-status outcomes, invalid references) per the standard feedback rules on the offending editor.
- Refresh rules: after a successful record edit, refresh the transaction row (classification/chips may change per the uniformity rule), the expanded subtable, affected snapshots, and compose with the 9985 reference-deleteability invalidation.
- Interaction: edit trigger per the design rule (keyboard edit action on focused cell + hover-revealed edit control on the cell); Escape cancels; save on commit (Enter/blur per existing inline patterns); pickers are the shared ledger pickers (EntityPicker etc. — reuse, never fork).
- Applies wherever the expanded records subtable renders (transactions page, drill-downs, registers use the records shape — scope this task to the transaction-shape expanded subtable; register/peek record editing only if it is the same shared component and comes for free).
- e2e (`transactions-page.spec.ts`): expand a transaction; edit category via picker → row chips/classification update; tags multi-select round-trip; member set+clear; memo edit; a date edit; posting-status change honoring constraints (attempt an invalid mix → error surfaced, state intact); structural fields show the escalation affordance, not inline editors; keyboard path for at least one field.
- PROJECT_STATE.md: update the transactions capability line (per-record inline editing).
- Package docs: ledger PACKAGE.md for the new shared editing pieces. No ground-truth edits.

## Tasks

### Task/Commit 1: Reference-field editors (category, tags, member)

- [x] Implement the cell edit trigger + shared-picker editors for category/tags/member with persistence, error surfacing, and refresh per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `4xb9` (`kata comment 4xb9 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Memo, dates, posting status

- [x] Implement the remaining field editors with their API mapping and constraint error handling.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] <if OpenAPI changed: `just test-integration` passes>
  - [x] Update progress in Kata issue `4xb9`
  - [x] Commit changes

### Task/Commit 3: e2e + PROJECT_STATE + docs

- [x] e2e per Plan Context; PROJECT_STATE.md and ledger PACKAGE.md updated.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `4xb9`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Per-record editing in expanded records view (kata 4xb9): category/tags/member/memo/dates/posting-status edit in place with shared pickers per the webui-design uniformity-rule section (edit trigger = keyboard edit action or hover-revealed control; chips still filter, never edit); smallest-owning-API persistence with backend-owned validation surfaced inline; structural changes still escalate to the journal editor; refresh rules incl. classification/chips and 9985 invalidation; built as reusable ledger pieces for the coming row-inline and detail-panel editing tasks"`
- [x] Move this plan to `docs/plans/completed/`
