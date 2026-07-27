# Plan: Entry modal must not eagerly persist a pristine draft (unfiled fleet Brief A)

A pristine open-then-close of the transaction entry modal leaves no persisted draft and never triggers the "discard draft?" confirmation later; the discard confirmation appears only when a draft with real user input exists. Per-tab draft persistence and restore for real input is preserved.

## Plan Context

- Unfiled user-reported bug (no Kata ref); this plan restates its full ground-truth scope from the fleet plan's Brief A (`docs/plans/2026-07-26-ui-papercuts-fleet.md`).
- Problem (observed live 2026-07-26): opening the transaction creation modal and touching nothing persists a per-tab entry draft. After closing it untouched, launching Edit on an existing transaction raises the "discard draft?" confirmation even though no draft was ever started.
- Root-cause analysis (operator, 2026-07-27, `frontend/src/features/ledger/entry-panel.tsx`):
  - The ordinary-draft persistence effect (`writeTransactionEntryDraft(draftForStorage(draft))`, ~line 2599) fires whenever `open && currentDraftReady && draftPersistence === "ordinary"` and the draft state changes — which includes the very first initialized draft on a pristine open. Initialization is being persisted as if it were input.
  - The discard prompt on launch fires via `existingOrdinaryDraftWouldBeDiscarded = Boolean(launchDraft) && draftHasUserInput(migratedDraft)` (~line 2569).
  - `draftHasUserInput` (~line 889) and `blankTabDraftIsEmpty` (~line 855) treat initialization defaults as significant: a tab draft is "empty" only when `draft.date === localTodayISODate()` and `normalizeCurrency(draft.currency) === "USD"`. A pristine draft persisted on day N therefore reads as user input on day N+1 (and any non-USD default reads as input immediately), producing the phantom discard prompt. The eager write is the enabler; the day-sensitive emptiness predicate is the trigger.
- Required direction: root-cause the dirty-tracking — prefill/default initialization must not count as user input and a pristine open must not persist a draft. Do not suppress the prompt cosmetically (e.g. by just widening the emptiness predicate while still eagerly persisting), and do not break these contracts:
  - Per `frontend/src/features/ledger/PACKAGE.md`: entry drafts are per tab and store UI form values only; drafts persist to IndexedDB so an accidental close is recoverable (`docs/webui-design.md` Screen 3: create closes without prompting, per-tab drafts persist and restore on reopen; `new` deep link restores the persisted draft).
  - A genuinely dirty draft (any real user input, including a user-changed date or currency) still persists, still restores on reopen, and still raises the discard confirmation when a launch would replace it.
  - Sticky-field behavior after saves and the launch-draft (`edit`/`split`/`duplicate`) discard flow for in-flight modified launches stay intact.
- The implementor must first reproduce against the live app (`just dev --demo`): confirm the pristine-open IndexedDB write, and construct the phantom-prompt repro (a persisted pristine draft whose stored dates differ from today — simulate the day rollover by seeding the stored draft directly or clock control — or a non-USD default path). Record the confirmed mechanism in the first task's commit message.
- Ground truth docs: `docs/webui-design.md` (Screen 3 close/Esc/drafts rules), `docs/frontend-architecture.md` (IndexedDB stores draft UI state only), `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Reproduce, then fix draft dirty-tracking at the root

End state: a pristine open (any entry point, any initial tab, with or without an existing stored draft) writes nothing to IndexedDB; persistence starts only once the draft genuinely diverges from its initialized baseline; `draftHasUserInput` no longer misclassifies initialization defaults (including a stale "today" from a previous day) as user input for pristine drafts.

- [x] Reproduce both halves live (eager write on pristine open; phantom discard prompt from a stale pristine stored draft) and record the mechanism in the commit message.
- [x] Implement the fix so initialization never persists and never reads as user input, while real input persists per tab and restores exactly as before. Cover the interaction with `draftForStorage`'s remembered-active-tab override and the `new:<type>` initial-tab launches.
- [x] Manually verify with `just dev --demo`: pristine open → close → Edit/Duplicate/Split on any transaction shows no discard prompt; typing anything (memo, amount, date change, currency change) then closing persists, restores on reopen, and Edit then prompts; discarding and keeping both behave.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` if the draft-persistence contract wording changes (drafts persist only once real user input exists).
- [x] Commit the task as `fix(frontend): stop persisting pristine entry drafts and misreading defaults as input`.

### Task 2: End-to-end regression coverage

End state: Playwright coverage pins the pristine-open-then-edit flow and the preserved dirty-draft behaviors.

- [x] Add e2e coverage (extend the existing entry-modal draft specs) for: (a) pristine create open → close → row Edit opens the editor directly with no discard confirmation; (b) same for Duplicate and Split (one representative is enough if they share the launch path, assert the shared path); (c) a draft with real input still prompts on Edit and restores after "keep"; (d) a pristine draft stored with non-today dates (seeded or clock-driven) does not prompt. Follow `docs/TESTING.md`.
- [x] `just test-frontend-e2e` passes with the new tests.
- [x] Commit the task as `test(frontend-e2e): cover pristine entry draft lifecycle and discard prompts`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-27-entry-eager-draft.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
