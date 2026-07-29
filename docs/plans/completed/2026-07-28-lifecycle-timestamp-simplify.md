# Plan: Lifecycle timestamps — status-first display, symmetric end-of-day derived stamps (fleet Brief C)

Lifecycle display becomes status-first with no timestamp magic, and every lifecycle timestamp derived from the initiated civil date is stamped at end of day UTC — pending and posted alike.

## Plan Context

- Ground truth: Brief C in `docs/plans/2026-07-26-ui-papercuts-fleet.md` (user-directed; revises parts of the merged `5qah`/`e222` outcomes). Directives:
  1. Remove the midnight-UTC day-marker display heuristic entirely (`frontend/src/utils/date.ts` lifecycle helpers and consumers). Displayed timestamps render plainly in browser local time. Drop the day-marker sentence from `docs/webui-design.md`.
  2. Detail lifecycle breadcrumbs show only the civil `initiated_date` plus a status word when not simply posted (`expected`, `cancelled`, `pending`; posted shows nothing). No pending/posted timestamps, stage segments, dashes, ranges, or qualifiers there. Exact timestamps stay in the per-record disclosures, plain local. Rewrite the strip specs in `docs/webui-design.md` and `docs/webui-theme-arcade-cabinet.md` accordingly (short).
  3. Transaction list: the description cell's trailing icon slot (today: expected-recurring calendar) also indicates `pending`; add `cancelled` only if cancelled transactions can actually appear in list rows (verify; if always hard-filtered, omit). Indicator rules apply (distinct glyph, tooltip, accessible name, no row-height change). Minimal row-composition doc update.
  4. Retain the `5qah` semantics: manual posting edits stamp posted, direct posts have null pending. No regressions to nullable-pending behavior.
  5. The API keeps accepting non-`manual` source records with explicit lifecycle timestamps (external loads); verify and add backend coverage for a round-trip.
  6. **Symmetric derivation rule:** any lifecycle timestamp derived from the initiated civil date — pending and posted, in every path (`fillMissingLifecycleDates`, recurring materialize-as-of) — is `<initiated_date>T23:59:59Z`. Never midnight, no exceptions. Update OpenAPI descriptions and regenerate all surfaces.
- Refit tests that pin midnight stamps or the old strip/day-marker display (apptest, testscript, `lifecycle-timezone.spec.ts`, strip e2e). Update `internal/services/transactions/PACKAGE.md` and `frontend/src/features/ledger/PACKAGE.md` stamping/lifecycle lines with the changes.
- Read first: `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, `docs/TESTING.md`.
- Close every agent-browser session you open before finishing.

## Tasks

### Task 1: Backend — symmetric end-of-day derived stamps, non-manual coverage

- [x] Directives 4–6: implement, regenerate, refit backend/testscript assertions; `just test` and `just test-integration` pass.
- [x] Commit as `fix(transactions): stamp derived lifecycle timestamps at end of initiated day`.

### Task 2: Frontend — status-first strip, in-description status icons, no magic

- [x] Directives 1–3 with their doc updates; verify live with `just dev --demo` (direct post: "Initiated <today>", no status word, plain disclosure timestamps; pending: strip word + list icon; expected unchanged).
- [x] Commit as `fix(frontend): status-first lifecycle presentation without timestamp magic`.

### Task 3: End-to-end refit

- [x] Refit affected e2e and cover: end-of-day stamps render as the initiated calendar day in a negative-UTC-offset timezone; strip civil-date+status form; in-description pending icon. `just test-frontend-e2e` passes.
- [x] Commit as `test(frontend-e2e): pin status-first lifecycle presentation`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit`, `just test`, `just test-integration`, `just test-frontend-e2e` pass.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-28-lifecycle-timestamp-simplify.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain go into the completion report.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
