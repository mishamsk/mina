# Plan: Render transaction lifecycle timestamps correctly in browser local time (Kata `e222`)

Lifecycle timestamps display in the browser's local timezone everywhere they appear, and day-precision lifecycle markers no longer shift to the previous local day — a directly posted transaction initiated Jul 27 never renders "Posted Jul 26". Initiated stays its stored civil date.

## Plan Context

- Kata issue: `e222` — "Render transaction lifecycle timestamps in browser local time" (P2, bug, frontend).
- Operator reverification (2026-07-27, post-`5qah` merge): the issue's filed premise is partially outdated. Both formatters already localize — `localTimestampDateValue` (`frontend/src/utils/date.ts:25`) derives day values from local getters, and `formatTimestamp` (`frontend/src/features/ledger/transaction-detail-panel.tsx:83`) uses `Intl.DateTimeFormat` defaults. The surviving user-visible defect is the one the issue's symptom describes: the backend stamps *day-precision* lifecycle defaults at the initiated civil date's midnight UTC (per `5qah`, `internal/services/transactions/PACKAGE.md`; e.g. a direct post initiated 2026-07-27 gets `posted_date: 2026-07-27T00:00:00Z`), and converting that day-marker to a negative-UTC-offset local time renders the *previous* day — observed live: strip "Initiated Jul 27 · Pending — · Posted Jul 26". Tooltips/disclosures compound it by rendering fabricated midnight precision ("Jul 26, 5:00 PM") for what is semantically a date, not an instant.
- Decided display rule (operator decision; implement, do not relitigate):
  1. A lifecycle timestamp at exactly `00:00:00Z` is a day-precision marker: day-level displays show its UTC calendar date (which by construction equals the intended civil day), and exact-timestamp contexts (stage tooltips, per-record disclosures, status-cell deviations) render it as a date only — no fabricated midnight time.
  2. Any other lifecycle timestamp is a genuine instant: exact contexts render it in browser local time (existing behavior), and day-level values derive from its local calendar date. Near local day boundaries this may legitimately show a local day before the civil initiated date; that is truthful and stays.
  3. Initiated/Expected remain stored civil dates, never reinterpreted through timezones (existing `formatFullCivilDate`/`localCivilDate` behavior).
  4. The rule applies uniformly everywhere lifecycle timestamps render: detail-panel lifecycle strip, stage tooltips, record status cells and deviation text, per-record disclosures, the account-register peek, and register/date columns that render lifecycle values. Transaction metadata `created_at` is a genuine instant — always local, unchanged.
- Implementation shape: put the day-marker/instant distinction in one shared helper set in `frontend/src/utils/date.ts` (pure functions) and consume it from the lifecycle surfaces; do not scatter midnight checks per call site. This is display formatting, not accounting derivation — the hard rule "the UI never re-derives accounting truths" is untouched.
- Ground-truth doc: `docs/webui-design.md` "Dates and statuses" states "All dates and times display in the browser's local timezone." The day-marker rule is a genuine, narrow divergence — add one targeted sentence there (day-precision lifecycle markers, stored as midnight-UTC timestamps, display as their calendar date and are exempt from local conversion). Keep it to one sentence; the operator reviews the doc diff.
- Read before implementing: `docs/webui-design.md` (Screen 2 lifecycle strip spec, Dates and statuses), `docs/frontend-architecture.md`, `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Reverify surfaces and implement the shared day-marker/instant formatting rule

End state: every lifecycle rendering surface follows the decided rule; the live repro (direct post initiated today shows "Posted <previous day>") is gone; genuine instants still render local.

- [x] Enumerate the lifecycle rendering call sites (strip summary, stage tooltips, status cells/deviations, disclosures, register peek, register date usages), verify each against the decided rule with the live demo app, and implement the shared helpers plus call-site adoption. Record the per-surface before/after in the commit message.
- [x] Manually verify with `just dev --demo` in a negative-UTC-offset environment: a directly posted transaction initiated today shows Posted as today; a genuinely pending record stamped at a real instant shows its local day and localized tooltip; expected records still dash.
- [x] Add the one-sentence day-marker rule to `docs/webui-design.md` "Dates and statuses".
- [x] Commit the task as `fix(frontend): render day-marker lifecycle stamps as dates and instants as local time`.

### Task 2: Day-boundary end-to-end coverage

End state: Playwright coverage pins both halves of the rule across a local day boundary.

- [x] Add e2e coverage with a fixed non-UTC timezone (Playwright `timezoneId`, e.g. `America/Los_Angeles`) and REST-created fixtures: (a) a direct post (day-marker `00:00:00Z` stamps) renders its stage day equal to the civil initiated date, with a date-only tooltip/disclosure; (b) a record with an explicit real instant near the UTC day boundary (e.g. `T01:00:00Z`) renders the previous local day and a localized exact timestamp; (c) no "Invalid Date" and initiated stays civil. Follow `docs/TESTING.md`.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `test(frontend-e2e): pin lifecycle rendering across local day boundaries`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-27-e222-lifecycle-local-time.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `e222` with `kata close e222 --done --message "<summary incl. the day-marker display rule and what was already localized>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
