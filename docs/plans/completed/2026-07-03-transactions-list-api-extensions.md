# Plan: Transactions list API extensions — server titles and date-anchored pagination (Kata jv19, 4tf4)

Extend the transactions REST surface with two capabilities the web UI needs next: server-derived transaction summary titles (so the frontend can drop its client-side derivation) and date-anchored pagination (so the UI can offer a jump-to-date control).

## Plan Context

- Mandatory reading before any change: `docs/architecture.md`, `docs/accounting-semantics.md` (display/classification rules), `docs/webui-design.md` "Transaction summary line" section, `docs/TESTING.md`.
- This branch is backend + codegen only. Regenerating `internal/httpclient` and `frontend/src/api/generated` via the Justfile codegen recipes is required; changing frontend feature/component/page code is out of scope — a later branch adopts the new fields.
- Title derivation is a server-side display convention per `docs/webui-design.md`; the UI must never re-derive it. Derive it where transaction class and display amounts are already derived (app-owned service layer), and map it in `internal/httpapi` like the other derived display values.
- Do not edit `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, or `docs/architecture.md`.
- Kata issues: jv19 (titles — comment progress, do not close; frontend adoption lands in a later branch), 4tf4 (anchored pagination — comment progress, do not close; the operator closes it at merge).

## Tasks

### Task/Commit 1: Server-derived transaction summary titles (Kata jv19)

Add a server-derived display title to transaction REST responses, following the summary-line rules in `docs/webui-design.md`: simple two-sided transactions title as `From → To` using account leaf names (spend: funding → merchant; income: source → destination; refund: merchant → destination; transfer: from → to; exchange: `USD → EUR` currency pair; adjustment: affected account leaf); complex/mixed transactions fall back to the uniform memo or the dominant counterparty leaf.

- [x] Derive the title in the transactions service alongside the existing derived class/component/display-amount values, resolving account leaf names through the service's existing account access (validation/reference paths already resolve account ids)
- [x] Expose the title on every REST response shape that returns a transaction (list, read, create, replace, shorthand creates) as a required field (e.g. `display_title`) in `api/openapi.yaml`; map it in `internal/httpapi` transaction response mapping (`strict_transactions.go`)
- [x] Regenerate contracts and clients through the Justfile codegen recipes (`just openapi`, `just frontend-openapi`) and keep freshness checks green
- [x] Add service-level tests covering each class's title rule plus the mixed/memo fallback, and integration coverage asserting titles on list and read responses
- [x] Update `PROJECT_STATE.md` API capability bullet for server-derived display values to mention summary titles
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue jv19 (comment only — do not close)
  - [x] Commit changes

### Task/Commit 2: Date-anchored transaction pagination (Kata 4tf4)

Offset pagination cannot seek to a date; the Transactions page needs to jump to any point in history. Add an anchor parameter that lands the caller on the page containing the first transaction at or before a given initiated date under the default newest-first ordering.

- [x] Add an optional anchor parameter (e.g. `anchor_date`, date-only) to `GET /api/transactions` in `api/openapi.yaml`; valid only with the `initiated_date` descending ordering — reject other sort/dir combinations with the standard JSON error envelope
- [x] Implement anchoring so the response is the page (aligned to the requested `limit`) containing the first transaction with `initiated_date` at or before the anchor, and the response pagination metadata carries the effective offset so a pager can synchronize; anchors newer than all data land on the first page, anchors older than all data land on the last page
- [x] Keep the seek computation in `internal/store` behind the existing repository/list interfaces; services own parameter validation per the architecture rules
- [x] Regenerate contracts and clients through the Justfile codegen recipes; add integration tests covering anchor mid-history, anchor newer than all rows, anchor older than all rows, and anchor combined with `limit`
- [x] Update `PROJECT_STATE.md` transaction list capability bullet to mention date-anchored pagination
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue 4tf4 (comment only — do not close)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Transactions list API extensions: server-derived summary titles per webui-design.md summary-line rules exposed on all transaction responses; date-anchored pagination (anchor_date) on GET /api/transactions valid only for initiated_date desc with effective offset in pagination metadata. Backend + codegen only; no frontend feature changes; docs/webui-design.md is ground truth and must not be edited."`
- [x] Move this plan to `docs/plans/completed/`
