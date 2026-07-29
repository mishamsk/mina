# Plan: Entry modal initialization must never clobber typed input (fleet final-verification fix)

A user who opens the transaction entry modal and starts typing immediately never loses input to a late-settling initialization; the flaky refund e2e failure this causes is gone under stress.

## Plan Context

- Do not run review-loop.
- Found at fleet final verification on the `ui-papercuts` integration branch: `accounting-semantics.spec.ts:126` ("Refund is money coming back…") fails ~half of isolated Chromium runs (90s timeout). Failure snapshot: the Amount field carries "Enter a positive amount with up to 8 decimals." after the test filled `34.99` — the typed value was wiped, save is validation-blocked, the `/api/transactions/refund` POST never fires. Passing runs complete in ~5s. Failure-biased under machine load.
- Mechanism to root-cause and fix: the entry panel's asynchronous initialization (IndexedDB draft read and/or lookup settle introduced/reworked by the eager-draft, picker-lifecycle, and inline-save tasks) can complete after the user has already typed into the form and re-initialize state over the user's input. The `openEntry` e2e helper already waits for template-field focus, so the late clobber happens after that gate. Fix at the root: once the panel accepts user input, no initialization/hydration path may replace typed field values — the Brief A principle ("initialization is not input, and must never override input") applied to the init/typing race. Do not fix by adding waits to tests first; the app guarantee comes first, then tests may rely on it.
- Reproduce before fixing: `just test-frontend-e2e --project=chromium -g "Refund is money coming back" --repeat-each=5` (or drive it manually with a throttled IndexedDB/lookup). Record the precise racing writer in the commit message.
- Protect — do not regress: all merged fleet behavior, especially the pristine-draft lifecycle (no eager persist, no phantom discard prompt), picker remount fixes (2q6j), inline-save focus/staleness (r2ae), status-first lifecycle presentation (Brief C), and the 383 currently green e2e.
- Ground truth: `docs/webui-design.md` (Screen 3), `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md`.
- Close every agent-browser session you open before finishing.

## Tasks

### Task 1: Root-cause and fix the init/typing race

- [x] Reproduce, identify the racing writer, fix so initialization never replaces typed values; record the mechanism in the commit message.
- [x] Stress-verify: the refund test passes `--repeat-each=10` on Chromium; the full `just test-frontend-e2e` passes.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` if the initialization contract wording changes.
- [x] Commit as `fix(frontend): never clobber typed entry input with late initialization`.

## Success Criteria

- [x] Task outcome complete; `just pre-commit` and `just test-frontend-e2e` pass.
- [x] Planned commit present; worktree clean.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
