# Plan: Show settlement dates in account registers (Kata b2p2)

## Goal

Account and group register rows show the displayed record's settlement date instead of the containing transaction's initiated civil date: a posted record shows its posted date, a pending record shows its pending date, both rendered as browser-local calendar days from the UTC timestamps. Records with no settlement timestamps keep an explicit fallback to the transaction's initiated date.

- Display-only change; ordering, pagination, running balance, and the Status column are untouched.
- Frontend coverage proves pending, posted, and date-free rows.

## Constraints

- Kata issue: `b2p2`.
- Data already exists on `JournalRecord` (`api/openapi.yaml`): `posted_date` and `pending_date` are nullable UTC timestamps; `initiated_date` is the transaction's civil date. Do not change the API, the store, or services.
- Display rule: posted date wins, then pending date, else the initiated date. Branch only on the presence of the two timestamps; never read `record.settlement`, account type, or lifecycle to decide the date (no client-side settlement derivation). Convert timestamps with the existing `timestampDateValue` helper in `frontend/src/utils/date.ts` (UTC instant to browser-local `YYYY-MM-DD`) and render with the existing `formatLocalCivilDateParts` day/year geometry.
- Date-free policy (explicit and tested): flow and system records, which carry neither timestamp, render the initiated date with the same glyphs and no extra marker. This keeps group-register flow rows aligned with their sibling balance rows.
- Place the record-date helper in `frontend/src/features/ledger/format.ts` beside the existing initiated-date formatter and export it through the ledger index; `frontend/src/features/accounts/account-register-table.tsx` calls it. Add a `data-testid` on the register date cell for coverage.
- Ordering stays server-side `initiated_date desc`; rows may legitimately show a settlement day that differs from their sort position. Do not touch sort, Balance, pagination, or the compact restacked grid geometry in `frontend/src/styles.css`.
- Timezone: manual creates derive settlement stamps as end-of-day UTC (`initiated_date` at 23:59:59Z), so the browser-local day equals the initiated day at non-positive UTC offsets and the next day at positive offsets. The e2e test must pin `timezoneId` (pattern: `frontend/tests/e2e/lifecycle-timezone.spec.ts`) or compute expectations in-page, and must use records whose explicit settlement timestamps differ from their initiated dates so the assertion is unambiguous.
- Browser coverage per `docs/FRONTEND-TESTING.md`: one test in `frontend/tests/e2e/accounts-page.spec.ts` (12 tests today, cap 25) that creates one posted record with an explicit `posted_date` and one pending record with an explicit `pending_date` through `POST /api/transactions` (payload shape in `lifecycle-timezone.spec.ts`), asserts each register row's date cell shows the settlement day and not the initiated day, and asserts a flow row in the group register (existing group-register journey or the same test) still shows the initiated date. Reuse the spec-local fixture helpers.
- Docs: amend the register bullet in `docs/webui-design.md` (Accounts section: "the account's records with date, ...") to define the date as the record's settlement day with the initiated-date fallback, and add one implicit-contract bullet to `frontend/src/features/accounts/PACKAGE.md` (and `frontend/src/features/ledger/PACKAGE.md` if the helper contract warrants it) via the `write-package-docs` skill. Update `PROJECT_STATE.md` with one phrase if registers are described there. Do not change `docs/architecture.md`, `docs/frontend-architecture.md`, `docs/accounting-semantics.md`, `VISION.md`, or `SCOPE.md`.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo`: a pending register row shows its pending day, a posted row its posted day, and a group-register flow row its initiated day; the Status column, Balance, ordering, and compact layout are unchanged.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/accounts-page.spec.ts tests/e2e/lifecycle-timezone.spec.ts` passes on chromium and webkit.
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-register-settlement-dates.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report.
- [x] Close Kata `b2p2` with the commits and validation evidence (`kata close b2p2 --done --message "..." --commit <sha> --test "<suites>" --agent`).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Settlement-first register date

Add the record-date helper in the ledger format module and use it in the register table with the date-cell test id.

- [x] Register rows render settlement days with the initiated-date fallback, verified manually on an account register and a group register.
- [x] Commit as `feat(accounts): show record settlement dates in registers`.

### Task 2: Browser coverage

Add the register date test described in Constraints.

- [x] Targeted e2e passes on chromium and webkit; the spec stays within its cap.
- [x] Commit as `test(frontend): cover register settlement dates`.

### Task 3: Docs

Apply the doc updates listed in Constraints and run `just prose-fmt`.

- [x] Design doc bullet, package docs, and PROJECT_STATE.md (if applicable) updated.
- [x] Commit as `docs: define register dates as record settlement days`.
