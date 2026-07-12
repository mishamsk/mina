# Plan: Inline recurring occurrences in Transactions (Kata b1m2)

Direction change per Misha's directive: recurring occurrences — confirmed, overdue, and upcoming EXPECTED — show inline in the Transactions page (and register embeddings) by default, with confirm/dismiss as row actions; the filter direction inverts to hide-based. The operator has amended the ground-truth docs on this branch — `docs/recurring-transactions-semantics.md` (aggregate exclusion is semantic; visibility is presentation) and `docs/webui-design.md` section 8 ("Recurring occurrences — Phase 2") — READ BOTH FIRST; they are the spec for this task; do not edit them.

## Plan Context

- Kata issue: `b1m2` (blocks `bnvy`). Demo seeds real definitions/occurrences (merged `45vz`); the redesigned toolbar (merged `d8z6`) hosts standing controls.
- MANDATORY pre-reads: amended `docs/recurring-transactions-semantics.md` and `docs/webui-design.md` section 8 + section 2 (Transactions) + tables/filtering rules; `docs/frontend-architecture.md`; `docs/TESTING.md`; `api/openapi.yaml` (transactions list posting-status filtering, recurring occurrences endpoints).
- Scope boundaries:
  - The `/recurring` review page stays UNTOUCHED in this task — `bnvy` (next task) replaces it with definitions management. Do not remove or break it; its e2e stays green.
  - Semantics unchanged: expected occurrences never count toward balances, aggregates, month totals, or running balances (backend already guarantees this — do not add frontend defensive layers).
- Implementation design:
  1. Default inclusion: the transactions page (and drill-down/register embeddings) request expected transactions by default. Use the existing list API capability (posting-status filtering that can include expected — check how the current opt-in Expected filter requests them). No new backend behavior expected; if the list API genuinely cannot express "include expected" without the old filter dimension, extend the frontend request params only.
  2. Catch-up materialization on load: loading a transactions view triggers the occurrence API's lazy catch-up (e.g. fire the occurrences list request before/alongside the transaction list fetch) so occurrences through today are always materialized. Keep it one cheap request per page load, not per pagination click, unless staleness demands otherwise.
  3. Visual treatment: expected rows use the existing expected status indicator/de-emphasis (design `:140`); OVERDUE expected rows (scheduled date before today) additionally carry the warning missed marker per the theme (reuse the marker built for the recurring review page).
  4. Hide-based standing filter: a URL-backed standing toolbar control (place it consistently with the d8z6 toolbar row; a compact toggle beside the class dropdown is acceptable) hides expected/recurring rows. REMOVE the old Expected posting-status opt-in from the Add-filter dimensions. Default = shown.
  5. Confirm/Dismiss row actions on expected rows in the shared transaction browser: reuse the recurring page's existing flows/endpoints (confirm occurrence; dismiss with named confirmation via the shared ConfirmationDialog). Mapping row → occurrence: use whatever linkage the APIs already expose (occurrences list carries generated transaction ids; transactions carry recurring provenance) — prefer NO OpenAPI change; if the transaction list response genuinely lacks any linkage and reverse-mapping via the occurrences list is unreasonable, extending the transaction list response is allowed (then `just openapi`/`just frontend-openapi` + `just test-integration` + app-test coverage per docs/TESTING.md).
  6. After confirm/dismiss: refresh affected snapshots per the established refresh rules (the transaction list, occurrence state, and the 9985 reference invalidation choke point if touched).
  7. Non-expected rows keep their existing row actions untouched.
- e2e (demo data has 4 definitions with overdue + upcoming occurrences):
  - Transactions page shows expected rows by default with expected treatment; overdue rows carry the missed marker.
  - The standing hide control removes them (URL round-trip); re-enabling restores.
  - Confirm from the row: row becomes a normal transaction (toast, treatment gone, occurrence consumed); balances/featured strip unchanged BEFORE confirm and updated AFTER (asserts aggregate exclusion then inclusion).
  - Dismiss from the row: named confirmation, row leaves the list, durable (still gone after reload).
  - Register embedding shows the same treatment for an account with an expected occurrence (checking:Chase:Joint has several).
  - Existing recurring-page specs remain green (page untouched).
- PROJECT_STATE.md: update the recurring/UI capability line (user-visible change: occurrences reviewed inline in Transactions).
- Package docs: ledger feature PACKAGE.md if contracts change. No further ground-truth edits.

## Tasks

### Task/Commit 1: Inline display default, treatment, markers, hide filter

- [x] Implement items 1–4 per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `b1m2` (`kata comment b1m2 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Confirm/Dismiss row actions

- [x] Implement items 5–7 per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] <if OpenAPI changed: `just test-integration` passes>
  - [x] Update progress in Kata issue `b1m2`
  - [x] Commit changes

### Task/Commit 3: e2e coverage + PROJECT_STATE

- [x] e2e per Plan Context; PROJECT_STATE.md line updated.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `b1m2`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Inline recurring occurrences (kata b1m2): transactions page and register embeddings show expected/overdue occurrences by default per operator-amended semantics + webui-design section 8 (aggregate exclusion unchanged, catch-up materialization on load, hide-based standing filter replaces the Expected opt-in, overdue missed marker); confirm/dismiss move to row actions reusing recurring endpoints and the shared ConfirmationDialog; /recurring page deliberately untouched (bnvy owns its replacement); PROJECT_STATE updated; ground-truth doc amendments operator-owned and already committed"`
- [x] Move this plan to `docs/plans/completed/`
