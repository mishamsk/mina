# Plan: Alfred-style transaction search in the command palette (`d608`)

Add a transaction-search mode to the global command palette: a leading ASCII apostrophe (or Space on an empty input, which inserts the apostrophe) switches the palette to searching transactions through `GET /api/transactions?search=`; result rows show date, class, title/memo, and amount; selecting a result navigates to the URL-addressable transaction detail (`/transactions?transaction={id}`), which opens the detail panel even when the transaction is not on the current page.

## Plan Context

- Ground truth (operator-amended — do not edit docs): `docs/webui-design.md` §Command Palette — the transaction-search bullet defines the apostrophe entry convention, result-row content, and detail navigation. Search field semantics are owned by `api/openapi.yaml` (expanded by `m4ye` across reference metadata). Theme: `docs/webui-theme-arcade-cabinet.md` (palette treatment, skeleton loading, class icons, amount chips).
- Current state: the palette is `frontend/src/features/command-palette/command-palette.tsx` (input `aria-label="Command search"`, grouped static commands, keyboard selection machinery, loading state helper). The transaction deep link exists: `?transaction={id}` is read by `frontend/src/features/ledger/use-transaction-detail.ts:79` and opens the detail panel URL-addressably (existing e2e covers deep links).
- Mode mechanics (kata acceptance, exact):
  - ASCII apostrophe `'` as the FIRST character of the input enters transaction-search mode; the query is everything after it.
  - Space pressed on an EMPTY input performs the same transition and displays/inserts the apostrophe; later spaces are literal query characters.
  - Deleting the apostrophe leaves search mode and restores normal command filtering.
- Search behavior: debounce input, call the existing transactions list client (existing generated client / `frontend/src/api/ledger.ts`) with `search` and a small page size (e.g. limit 20, page 1); no new API surface; cancel/ignore stale responses (the palette must never show results for an outdated query).
- Result rows: initiated date, class (existing class icon/indicator treatment), title (the same `From → To`/memo-fallback line derivation the transaction browser uses — reuse the shared helper if exported, extract-and-share only if it already lives in a shared spot; do not re-derive accounting truths), memo when distinct from the title, display amount (existing `AmountText`, neutral chip treatment). Keyboard up/down + Enter and click both select.
- Selection: navigate to `/transactions?transaction={transaction_id}` (palette closes; the detail panel opens through the existing deep-link path, including for transactions not on the current page — assert this).
- States: loading skeleton (existing palette loading treatment), empty ("no matching transactions" message), API-error message in the results region; all keyboard-safe.
- Protect — do not regress: all existing palette commands, grouping, navigation, entry commands, backup/exchange-rate actions, shortcut handling (Cmd/Ctrl+K), focus restore on close; transactions page URL state; existing `command-palette.spec.ts` coverage.
- e2e in `frontend/tests/e2e/command-palette.spec.ts`: apostrophe entry; Space-on-empty inserts apostrophe and enters mode; spaces inside query preserved; results render date/class/title/amount for a seeded match (including a reference-metadata match, e.g. by tag or member, proving the m4ye semantics flow through); Enter opens the detail panel for an off-current-page transaction with the URL containing `transaction={id}`; keyboard selection; empty and error (mocked failure) states; leaving the mode restores commands.
- Update `PROJECT_STATE.md`: one line — palette supports Alfred-style transaction search.
- Follow `docs/TESTING.md`.
- Kata issue: `d608`.

## Tasks

### Task/Commit 1: Search mode, fetching, and result model

- [x] Implement the apostrophe/Space mode transition in the palette input with mode exit on apostrophe deletion; debounced, stale-response-safe fetching through the existing transactions client; palette state for loading/empty/error.
- [x] Render result rows (date, class indicator, title/memo per the shared derivation, neutral amount) with existing keyboard selection; Enter/click navigates to `/transactions?transaction={id}` and closes the palette.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata `d608`
  - [x] Commit changes

### Task/Commit 2: Browser coverage and closeout

- [x] Extend `command-palette.spec.ts` with the coverage matrix from Plan Context (mode entry variants, query spaces, result shape, off-page detail navigation, keyboard, empty/error, mode exit).
- [x] Update `PROJECT_STATE.md` (one line) and the command-palette/ledger package docs only if a non-obvious contract emerges.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata `d608`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Alfred-style transaction search in the command palette: apostrophe/space mode entry, debounced stale-safe search via the existing endpoint, result rows with date/class/title/amount, Enter opens URL-addressable detail off-page; existing palette commands and shortcuts unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `d608` only after the plan is moved to completed
