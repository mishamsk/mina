# Plan: Advanced journal editor tab with shorthand escalation — Kata issue `axf6`

Add the Advanced (full journal editor) tab to the entry panel per `docs/webui-design.md` §3: a free record grid with per-currency balance gating, deterministic picker guidance, IndexedDB draft persistence, and the "Edit as journal" escalation from every shorthand tab. Create-only (editing/splitting saved transactions is a separate issue `ksw0`).

## Plan Context

- Ground truth (read before starting): `docs/webui-design.md` §3 Transaction entry (Advanced tab spec, escalation, batch ergonomics), §Core UX Doctrine (no client-side re-derivation of accounting truths), Forms/feedback rules; `docs/accounting-semantics.md` (record shape rules by category intent `:90-104`, per-currency zero balance `:75`); `docs/webui-theme-arcade-cabinet.md` (`BalanceMeter`: segmented block bar per currency — mint ink when balanced, yellow while unbalanced; EntryPanel landmark rules); `docs/frontend-architecture.md`.
- Frontend-only (FE). The full-transaction API already exists: `createTransaction` = `POST /api/transactions` (`CreateTransactionRequest`: `{initiated_date, records: CreateJournalRecordRequest[] (minItems 2)}`) — generated client importable from `@/api` (no hand-written wrapper exists yet; add one in `frontend/src/api/ledger.ts` next to the shorthand wrappers `:704-714`). `CreateJournalRecordRequest` per record: `account_id`, `member_id?`, `currency`, **signed non-zero** `amount` (`^-?[0-9]{1,10}(\.[0-9]{1,8})?$`), `category_id`, `tag_ids[]`, `memo?`, `pending_date?`/`posted_date?` (nullable UTC date-times), `posting_status` (`pending|posted|cancelled`), `reconciliation_status` (`reconciled|unreconciled`), `source: "manual"`. Errors are a single `{error:{code,message}}` — no structured per-record contract.
- Current entry panel (read `frontend/src/features/ledger/entry-panel.tsx` fully; line numbers as of this plan's commit):
  - `entryTypes = ["spend","income","refund","transfer"]` (`:82`), per-tab config `tabConfigs` (`:96-141`), shared flat tab draft `TransactionEntryTabDraft` (`frontend/src/models/ui-state.ts:14-26`), draft persisted whole to IndexedDB (single `transaction-entry` key; hydration tolerant via `migrateStoredDraft` `:167-196,475-502` — adding a new tab shape needs NO DB version bump), submit builds shorthand payloads (`:648-733`), sticky-fields reset `stickyNextTabDraft` (`:362-399`), session tally (`:1011-1020`), Cmd/Ctrl+Enter submit (`:758-763`), currency datalist from account currencies (`:409-419,859-877`), `initialTab` override from the command palette (`:48,447-464`; store `frontend/src/store/transaction-entry.ts`).
  - `normalizeAmount` (`:214-225`) is positive-only — the journal grid needs a signed variant (nonzero, ≤8 decimals).
  - `EntityPicker`/`EntityMultiPicker` (`features/ledger/entity-picker.tsx`) are generic; callers pre-filter options. Account option sets: `balanceAccounts`/`flowAccounts` (`:564-583`).
  - `BalanceMeter` does not exist anywhere — build it (theme spec above).
  - No "Edit as journal" affordance exists anywhere; the detail panel is read-only + Delete — do NOT add detail-panel Edit/Duplicate/Split (kata `ksw0`).
- Design decisions:
  - New `advanced` entry type appended to the tab list (label "Advanced"). Its draft: `{records: RecordRowDraft[]}` sharing the panel-level initiated date field; `RecordRowDraft` = account, signed amount (string), currency, category, tags, member, memo, posting status (default `posted`), optional pending/posted date-times (collapsed behind a compact per-row "dates" disclosure is fine — keep rows scannable), reconciliation left `unreconciled` (no UI — reserved for Phase 5). Starts with two blank rows; add/remove row controls (min 2 rows for save; removing below 2 allowed while editing but save requires ≥2 per API).
  - Row layout: the panel is a docked narrow surface — lay each record out as a compact bordered row block (wrapping fields) consistent with the panel's existing form styling; no horizontal scrolling; keyboard reachable.
  - `BalanceMeter` pinned to the panel footer above the submit row: one segment per currency present in rows, showing the signed sum per currency; mint ink when a currency sums to zero, yellow while unbalanced; always visible while the Advanced tab is active (theme: EntryPanel internal scrolling keeps title and submit row visible).
  - Save gating: submit disabled until every row is complete/valid (account, category, nonzero signed amount, valid currency) AND every currency sums to exactly zero (integer math over 8-decimal mantissas — never floats). Zero-sum computed client-side is display/gating only; the server remains the authority.
  - API error mapping: reuse the existing message-substring approach — map row-referencing messages onto the offending row when the message allows it, otherwise show the standard general error above the submit row; entered data is never lost on error.
  - Deterministic guidance (NO record-role inference): once a row has a category, its account picker filters to the account types valid for that category's intent per the `docs/accounting-semantics.md:90-104` table (e.g. transfer → `balance` only; income → `balance` and `flow`; fee → `balance`, `flow`, `system`); with no category the picker offers all visible accounts (all types). Selecting an account defaults the row currency to the account's currency like shorthand tabs. Category pickers in rows are NOT intent-restricted (any intent; fetch with all intents or reuse the unrestricted lookups source — do not guess roles).
  - Escalation: an "Edit as journal" action on every shorthand tab converts the CURRENT form contents into Advanced rows and switches to the Advanced tab with nothing lost. The conversion must mirror the backend's shorthand record derivation exactly — read the backend shorthand builder (`internal/services/...` transactions shorthand creation) and replicate its record shapes (which side is negative/positive, which records carry category/tags/member/memo) so an unmodified escalated save produces the same records the shorthand save would. Partially filled forms convert partially (missing fields stay empty in the rows); the shorthand tab's draft stays intact (switching back keeps it — nothing lost in either direction).
  - Batch ergonomics parity: successful save calls `onSaved`, increments the session tally, resets the grid to a fresh two-row state keeping the initiated date (sticky date like other tabs); "Save and add another" label; Cmd/Ctrl+Enter submits.
  - The command palette's four entry commands and `TransactionEntryType` handling must keep working; `advanced` becomes a valid remembered/requested tab (no palette command for it — out of scope).
- Protect — do not regress: all four shorthand tabs (payloads, validation, sticky fields, drafts, currency datalist, session tally, e2e `:2320,2447,2547`); the palette entry commands and requested-tab semantics; draft hydration of existing stored drafts (legacy shapes keep working); entry panel Esc/close behavior; `just test-frontend-e2e` green.
- Scope exclusions: no editing/splitting/duplicating saved transactions (`ksw0`; `replaceTransaction` stays unused); no detail-panel changes; no friend-split/fee rows on shorthand tabs; no `amount_usd` input (omit — server/display concern); no reconciliation UI; no backend/API changes; no ground-truth doc edits; no new runtime dependencies.

## Tasks

### Task/Commit 1: Advanced tab — record grid, signed amounts, balance meter, save

After this commit the Advanced tab creates balanced multi-record transactions with the meter-gated save and persistent drafts.

- [x] Extend the entry models/draft (`TransactionEntryType` + advanced draft shape in `frontend/src/models/ui-state.ts`), tolerant hydration for existing stored drafts, and the tab bar entry.
- [x] Record grid per the design decisions (row blocks with account/amount/currency/category/tags/member/memo/status/date fields, add/remove rows, signed-amount normalization helper, currency handling and account-currency defaulting, keyboard operable).
- [x] `BalanceMeter` component (theme spec; place per package boundaries — it is Mina-specific, `features/ledger` is fine) pinned above the submit row; per-currency signed sums via integer mantissa math.
- [x] Save path: `createTransaction` wrapper in `api/ledger.ts`; submit disabled until valid + all currencies zero; success → `onSaved` + tally + sticky-date grid reset; API errors mapped per Plan Context; drafts persist across close/reopen.
- [x] e2e (`frontend/tests/e2e/transactions-page.spec.ts` or a new spec): a 3-row split spend (two negative funding/one positive counterparty or similar balanced shape) saves and appears in the list; save stays disabled while a currency is unbalanced and the meter shows the unbalanced state, flipping when zeroed; signed amount validation; draft survives panel close/reopen.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Deterministic picker guidance

After this commit account pickers in rows follow the intent table once a category is chosen.

- [x] Intent→account-type mapping module derived from `docs/accounting-semantics.md:90-104` (data, not inference); row account pickers filter to intent-valid types when the row has a category, unrestricted otherwise; category pickers unrestricted across intents.
- [x] e2e: with a `transfer`-intent category chosen, the row's account picker offers only `balance` accounts; clearing the category restores all types.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: "Edit as journal" escalation

After this commit every shorthand tab escalates losslessly into the Advanced grid; PROJECT_STATE reflects the journal editor.

- [x] Read the backend shorthand record derivation and implement the per-tab conversion (spend/income/refund/transfer → record rows matching the server's shapes: signs, account roles, category/tags/member/memo placement, statuses/dates); wire an "Edit as journal" action on each shorthand tab that converts current contents, switches to Advanced, and leaves the shorthand draft intact.
- [x] e2e: fill a spend form, escalate, assert the two generated rows (signs, fields), save unchanged, and verify the resulting transaction's records match what a direct shorthand save produces (compare via the API or the detail panel); escalating an incomplete form carries over what was entered.
- [x] Update `PROJECT_STATE.md`: Advanced journal editor tab + escalation shipped.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Advanced journal editor tab (kata axf6) per webui-design §3: free record grid (account, signed amount, currency, category, tags, member, memo, per-record status/dates) with add/remove rows; per-currency BalanceMeter (mint balanced / yellow unbalanced) pinned to the footer; save disabled until every currency sums to zero (integer mantissa math) via createTransaction; message-based API error mapping; deterministic intent->account-type picker guidance only (no record-role inference); Edit-as-journal escalation from every shorthand tab mirroring the backend derivation losslessly; IndexedDB draft persistence; batch ergonomics parity. Constraints: frontend-only; create-only (no edit/split of saved transactions - ksw0); shorthand tabs and palette entry commands unregressed; no new dependencies; no ground-truth doc edits."`
- [x] Move this plan to `docs/plans/completed/`
