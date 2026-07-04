# Plan: Supporting APIs — category intent filter and month spend/income totals (Kata f9yj, qfbz)

Extend the REST surface with two capabilities upcoming UI work needs: filtering the categories list by economic intent (entry-form pickers) and server-computed month spend/income totals (Overview month pulse).

## Plan Context

- Mandatory reading before any change: `docs/architecture.md`, `docs/accounting-semantics.md` (classification and display-amount rules), `docs/business-requirements.md` (Overview scope), `docs/TESTING.md`.
- This branch is backend + codegen only. Regenerating `internal/httpclient` and `frontend/src/api/generated` via the Justfile codegen recipes is required; changing frontend feature/component/page code is out of scope — pickers and the Overview screen adopt these APIs in later branches.
- The UI must never derive accounting aggregates client-side; month totals are server-computed per `docs/webui-design.md` Overview spec ("Month pulse: current-month spend and income totals as plain numbers").
- Aggregation across currencies follows the design's amounts rule: totals are USD equivalents, and records lacking `amount_usd` must be surfaced as unconverted (a count is sufficient) rather than silently dropped.
- Do not edit `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, or `docs/architecture.md`.
- Kata issues: f9yj (comment progress only, do not close — picker adoption is a later branch), qfbz (comment progress only, do not close — the operator closes it at merge).

## Tasks

### Task/Commit 1: Filter categories list by economic intent (Kata f9yj)

Entry forms need intent-appropriate categories (spend → expense/fee, income → income, refund → refund, transfer → transfer); today the UI filters a full bounded lookup client-side.

- [x] Extend `GET /api/categories` in `api/openapi.yaml` with an optional repeatable/multi-value `economic_intent` filter validated against the typed allowlist of intent values (per the architecture rule that dynamic filters come from typed allowlists); invalid values get the standard JSON error envelope
- [x] Implement the filter through the existing service → store list path (services own parameter validation; store owns SQL with parameter binding); combining with existing list parameters (pagination, include_hidden) must work
- [x] Regenerate contracts and clients through the Justfile codegen recipes (`just openapi`, `just frontend-openapi`) and keep freshness checks green
- [x] Add integration coverage: single intent, multiple intents, combination with include_hidden, invalid intent rejection with the error envelope
- [x] Update `PROJECT_STATE.md` category list capability bullet to mention economic-intent filtering
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue f9yj (comment only — do not close)
  - [x] Commit changes

### Task/Commit 2: Month spend and income totals API (Kata qfbz)

The Overview month pulse needs server-computed spend and income totals for a month; the UI renders them as plain numbers and must not aggregate client-side.

- [x] Add an endpoint to `api/openapi.yaml` returning, for a given civil month (`YYYY-MM`, defaulting is not required — the caller passes the month), the month's spend total and income total classified per `docs/accounting-semantics.md` (transaction classes/economic intents decide what counts as spend vs income; refunds affect the spend side per the semantics doc — follow it, do not invent rules), aggregated as USD equivalents with an unconverted-record count per total; month boundaries use `initiated_date` civil dates
- [x] Implement the aggregation in the service/store layers per the architecture boundaries (store owns SQL over the selected accounting schema with parameter binding; services own validation of the month parameter and the classification decisions it delegates to stored/derived values)
- [x] Regenerate contracts and clients through the Justfile codegen recipes
- [x] Add integration coverage against seeded data: a month with mixed spend/income/refund/transfer activity (transfers and exchanges must not leak into totals), a month with no activity, non-USD records with and without `amount_usd` (unconverted count), invalid month parameter rejection with the error envelope
- [x] Update `PROJECT_STATE.md` API capability list with the month-totals endpoint
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue qfbz (comment only — do not close)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Supporting APIs: economic_intent multi-value filter on GET /api/categories via typed allowlist; month spend/income totals endpoint per accounting-semantics classification with USD-equivalent aggregation and unconverted counts. Backend + codegen only; no frontend feature changes; docs/webui-design.md and docs/architecture.md are ground truth and must not be edited."`
- [x] Move this plan to `docs/plans/completed/`
