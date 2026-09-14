# Plan: Seed new transaction dates from the active Transactions day (Kata 7gs0)

## Goal

A new transaction opened from the Transactions list starts with that list's currently selected day as its initiated date, while new transaction entry from every other surface starts with no initiated-date value. The seeded day is transient launch state: it never persists into the stored draft unless the operator edits the date or saves.

- Transactions list: the URL `anchor_date` when the view is anchored to a day; the current local day when the view is unanchored (the default view is "today", matching the Today shortcut's meaning).
- Every other create entry point (global `n` on other routes, command-palette entry commands off Transactions, Templates page Use, `?entry=new` deep links off Transactions) opens with an empty date and inline "Date is required." validation on save.
- Duplicate, Edit, and Split keep copying the source transaction's date.

## Constraints

- Kata issue: `7gs0`.
- Source of the active day: `readTransactionAnchorDateFromSearchParams` (`frontend/src/features/ledger/transaction-page-position.ts`) on `/transactions` only; do not read the hook-local uncommitted go-to-day input value. On `/transactions` without an anchor, seed `localTodayISODate()`. On any other pathname, seed nothing.
- Transport: extend `TransactionEntryLaunchContext` in `frontend/src/store/transaction-entry.ts` with a transient `initiatedDate?: string`, computed inside `captureTransactionEntryLaunchContext` (`frontend/src/features/ledger/entry-launch-context.ts`) so every create launch path (Transactions header and empty-state buttons, global `n`, command palette, template Use, `?entry=new` route restore) gets it through the existing seam; store it only in the create openers (`openTransactionEntryPanel`, `openTransactionEntryRoute`, `openTransactionEntryTemplate`), never in the saved-transaction launch path. Pass it to `EntryPanel` from `app-shell.tsx` as a prop.
- Blank drafts stop defaulting to today: `blankTabDraft`, `blankAdvancedDraft`, and `advancedDraftFromTemplate` in `frontend/src/features/ledger/entry-panel.tsx` use an empty date, and the "Edit as journal" escalation (`shorthandDraftToAdvanced`) no longer falls back to today.
- Transient application: follow the existing `initialTabOverrideRef` + `draftForStorage` pattern so the seeded date shows in the form and is used on save, but is stripped from the persisted copy and from both sides of the dirty comparison until the operator edits the Date field (a `userChangedDate`-style ref cleared like `userSelectedActiveTabRef`). Clear the override in `resetCreateDraft`, `applyTemplate`, and on close. Do not mutate the stored baseline date of a pre-existing draft just to seed. After a save, sticky-date behavior is unchanged (the saved date carries into the next entry and its baseline as today).
- Advanced validation gap: an empty Advanced date currently only disables Save with no inline message until blur. Make an empty date on Advanced produce the same inline "Date is required." plus first-error focus on submit as the shorthand tabs (surface the local error immediately or exclude date from the submit gate; pick the smaller change).
- Preserve: draft persistence envelope semantics (`frontend/src/services/indexeddb`), discard-existing-draft confirmations, the sticky account/type behavior, template application semantics, Duplicate/Edit/Split date copying, the kp0d and nwv6 behaviors merged on this branch base.
- Browser coverage per `docs/FRONTEND-TESTING.md` in `frontend/tests/e2e/transactions/entry.spec.ts` (16 tests today, cap 25) or `navigation.spec.ts`: (1) jump to a non-today day with `getByLabel("Go to day")`, open New transaction from the header, assert the Spend Date equals that day; (2) open entry from a non-Transactions surface (for example `/overview` with `n` or the palette) and assert the Date is empty and saving shows "Date is required."; (3) assert the seeded day did not persist (close without editing, reopen from an unanchored `/transactions`, Date shows today, not the jumped day). Add a small `jumpToDay` helper in `support.ts` if it removes duplication. Existing specs that launch from an unanchored `/transactions` and save without filling Date must keep passing.
- Docs: update the entry-points bullet, the sticky-fields sentence, and the `?entry=new` deep-link sentence in the transaction entry section of `docs/webui-design.md` with targeted edits only; update `frontend/src/features/ledger/PACKAGE.md`, `frontend/src/store/PACKAGE.md`, and `frontend/src/features/app-shell/PACKAGE.md` via the `write-package-docs` skill. Do not change `docs/architecture.md`, `docs/frontend-architecture.md`, `VISION.md`, or `SCOPE.md`.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo`: on `/transactions?anchor_date=<day>` New transaction shows that day on every shorthand tab and Advanced; on unanchored `/transactions` it shows today; from `/overview` (`n`), the palette off Transactions, and Templates Use the Date is empty and Save reports "Date is required." inline with focus on the field, including on Advanced.
- [x] A seeded date never appears in the persisted draft unless the operator edits Date or saves; reopening later shows the new launch context's seed (or the persisted user-entered date).
- [x] Duplicate still opens with the source transaction's date.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e` passes (full suite: blank-draft defaults changed).
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-seed-entry-date-from-active-day.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report.
- [x] Close Kata `7gs0` with the commits and validation evidence (`kata close 7gs0 --done --message "..." --commit <sha> --test "<suites>" --agent`).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Transient launch date in the entry launch context

Add `initiatedDate` to the launch context, compute it in `captureTransactionEntryLaunchContext`, store it in the create openers, and pass it to `EntryPanel`.

- [x] Every create entry point carries the seed described in Constraints; saved-transaction launches carry none.
- [x] Commit as `feat(ledger): capture the active Transactions day as entry launch context`.

### Task 2: Blank drafts without a date and Advanced inline validation

Remove the today defaults from blank draft factories and the escalation fallback; make an empty Advanced date report inline on submit.

- [x] Off-Transactions launches open with an empty Date; saving any tab reports "Date is required." inline and focuses the field.
- [x] Commit as `fix(ledger): stop defaulting new entry dates to today`.

### Task 3: Apply the seed transiently

Implement the override ref and `draftForStorage` stripping with a user-edit release, clearing in reset, template apply, and close.

- [x] Seeded date is visible and used on save but absent from IndexedDB until edited or saved; verified manually via the browser devtools or by reopen behavior.
- [x] Commit as `feat(ledger): seed the entry date from the active Transactions day`.

### Task 4: Browser coverage

Add the journeys listed in Constraints and run the full e2e suite.

- [x] `just test-frontend-e2e` passes on chromium and webkit; spec caps respected.
- [x] Commit as `test(frontend): cover entry date seeding from the active day`.

### Task 5: Docs

Apply the doc updates listed in Constraints and run `just prose-fmt`.

- [x] Design doc bullets and package docs updated.
- [x] Commit as `docs(frontend): document transient entry date seeding`.
