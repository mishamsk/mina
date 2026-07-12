# Plan: Account type change in the account edit UI (Kata 5z54)

Small frontend form change: the account edit side panel currently renders the type as a static `AccountTypeBadge` (edit mode) while only create mode offers the themed type Select. Let edit mode change the type through the merged `dgkf` API (`UpdateAccountRequest.account_type`), with API rejections surfacing as an inline field error and no data loss.

## Plan Context

- Kata issue: `5z54` (blocked-by `dgkf`, merged).
- MANDATORY pre-reads: `docs/webui-design.md` forms/error rules, `docs/frontend-architecture.md`, `docs/TESTING.md`.
- Code focus: `frontend/src/features/accounts/accounts-side-panel.tsx` — edit mode currently renders `AccountTypeBadge` where create mode renders the themed Select (`components/ui/select.tsx`). Reuse the SAME themed Select in edit mode, initialized to the current type.
- Behavior:
  - Saving submits `account_type` only when changed (the update API treats same-type as no-op anyway; avoid sending unchanged fields if the panel's existing field-diff pattern does so — match it).
  - The backend rejects invalidating changes with 409 `conflict` ("account type change would invalidate existing transaction records") — map that to an INLINE FIELD ERROR on the Type field per the forms rules; the panel stays open, all entered values (name/hidden/featured/external ids/type selection) preserved.
  - Other errors keep the panel's existing general-error handling.
- e2e (`accounts-page.spec.ts` patterns, themed-Select interaction pattern from d9hq): change a no-record account's type via the edit panel → saved, badge/row/register reflect it; attempt an invalidating change (flow account with expense records, demo data has plenty) → inline field error on Type, panel open, values retained; cancel/reopen shows the true type.
- Docs: no ground-truth edits. No PROJECT_STATE.md change (dgkf covered the capability; this is UI exposure — if the reference-data capability line in PROJECT_STATE.md mentions the edit UI explicitly, extend it, else skip).

## Tasks

### Task/Commit 1: Editable type in the account edit panel

- [x] Implement per Plan Context (themed Select in edit mode, changed-field submission, 409 → inline Type field error with state preserved).
- [x] e2e per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `5z54` (`kata comment 5z54 --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Account type editing in the account edit panel (kata 5z54): edit mode reuses the themed type Select, submits account_type when changed via the dgkf update API, maps the 409 invalidating-change conflict onto an inline Type field error with all entered data preserved; e2e covers successful change and rejected change; frontend-only, no doc changes"`
- [x] Move this plan to `docs/plans/completed/`
