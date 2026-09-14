# Plan: Re-seed the launch date after Clear draft and template application (Kata 7gs0, fix pass 1)

## Goal

Within a transaction-entry launch that carries a Transactions-day seed, Clear draft and template application produce blank dates that are re-seeded from that launch (transient, exactly like the initial open), while launches without a seed keep empty dates.

## Constraints

- Do not run review-loop.
- Implementation-only; do not edit completed plans, `docs/architecture.md`, or `docs/frontend-architecture.md`.
- Mechanism: in `frontend/src/features/ledger/entry-panel.tsx`, `resetCreateDraft` and `applyTemplate` currently clear the transient date override and build blank drafts with empty dates. When the panel's launch `initiatedDate` is set, re-apply it to every blank date in the new draft (shorthand tabs and Advanced) and re-arm the same transient override bookkeeping (`initialDateOverrideRef` / `userChangedDateRef` equivalents) so the re-seeded date is still stripped from persistence and the dirty comparison until edited or saved. A template default never carries a date, so the seed applies to every tab after template application too.
- Protect, do not regress: everything verified on this branch: anchored-day and unanchored-today seeding on `/transactions`, empty required dates off Transactions with inline "Date is required." and first-error focus on shorthand and Advanced, the attention-strip navigation fix, non-persistence of seeds, a user-edited date surviving a different anchor, cleared sticky dates staying dirty (`preserveDates` on the baseline side), Duplicate/Edit/Split copying the source date, and the existing e2e suite.
- Coverage: extend an existing journey in `frontend/tests/e2e/transactions/entry.spec.ts` (18 tests, cap 25) with a Clear draft on an anchored `/transactions` launch asserting the Date returns to the anchored day, and a Clear draft on an off-Transactions launch asserting it stays empty. Add at most one new test if extension is unclear.
- Docs: adjust the ledger package doc sentence about Clear draft / launch seeds if its wording no longer matches; no other doc changes.
- Mina is pre-production with no users: no compatibility shims.

## Success Criteria

- [x] On `/transactions?anchor_date=<day>`: open New transaction, type a memo, confirm Clear draft, and the Date shows `<day>` again on the active tab and on every other tab; applying a template also leaves the seeded day in place. On `/overview`: the same steps leave the Date empty.
- [x] Re-seeded dates are not written to IndexedDB until edited or saved (reopen from `/overview` shows an empty Date).
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/transactions/entry.spec.ts tests/e2e/transactions/entry-pickers.spec.ts` passes on chromium and webkit.
- [x] `just pre-commit` passes.
- [x] Commit as `fix(ledger): re-seed the launch date after clearing or templating a draft`.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.
