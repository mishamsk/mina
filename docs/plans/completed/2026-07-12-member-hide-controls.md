# Plan: Member hide and unhide controls (Kata dcjx)

Give Members the same hide/unhide UX categories and tags already have, on top of the merged member hidden-state API (`t828`: `Member.is_hidden`, `listMembers?include_hidden=`, `PUT /api/members/{member_id}/hidden`). Frontend-only; mirror the shared reference-entity pattern — do not invent new UX.

## Plan Context

- Kata issue: `dcjx` (blocked-by `t828`, merged).
- MANDATORY pre-reads: `docs/webui-design.md` (hidden semantics `:145` — hidden excluded from pickers/default lists, explicit include-hidden toggle, eye-off rendering; reference-data shared pattern; row-actions and toggle-slot rules), `docs/webui-theme-arcade-cabinet.md` (flat toggle icons), `docs/frontend-architecture.md`, `docs/TESTING.md`.
- Mirror the categories/tags implementation exactly (files to crib from: `frontend/src/features/tags/tags-page-content.tsx` + `tags-side-panel.tsx`; members targets: `frontend/src/features/members/members-page-content.tsx` + `members-side-panel.tsx`, `pages/members-page.tsx`):
  1. RowActions hide/unhide flat eye toggle on member rows (compact layout from `qkss`; fixed toggle slots from `f9c5` — members have no featured flag, so the star slot stays reserved/empty), calling the generated `updateMemberHidden` operation; optimistic-free (refetch-after-mutation per frontend-architecture).
  2. "Include hidden" toolbar toggle beside the member search (mirroring categories/tags), driving `include_hidden` on the list; hidden rows render with the eye-off indicator and hidden styling exactly like tags rows.
  3. Side-panel editor gains a Hidden checkbox (edit mode; mirroring categories/tags editors) — on save, name changes go through the existing update and hidden changes through the hidden setter; no-op when unchanged.
  4. Hidden members must be excluded from member pickers by default (entry panel member picker consumes the default list — verify the picker already excludes them via the API default and assert it; do not add frontend filtering).
  5. Hidden state comes ONLY from the API (`is_hidden` in responses); no local inference/persistence.
- URL state: if categories/tags persist their include-hidden toggle in the URL, mirror that for members; otherwise match whatever they do.
- e2e (mirror `tags-page.spec.ts` hidden coverage in `members-page.spec.ts`): hide via row toggle → member leaves the default list; include-hidden shows it with eye-off + unhide toggle; unhide restores; editor Hidden checkbox round-trips; entry-panel member picker excludes the hidden member and includes it after unhide (or per the picker's include-hidden affordance if one exists for members elsewhere — match categories/tags behavior); keyboard operability of the toggle.
- Docs: no ground-truth edits (the design doc's hidden semantics already cover members generically). No PROJECT_STATE.md change (the API capability line was updated in t828; if the reference-data line enumerates hide/unhide UX per entity, extend it — otherwise skip).

## Tasks

### Task/Commit 1: Member hide/unhide controls end to end

- [x] Implement items 1–5 per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `dcjx` (`kata comment dcjx --agent ...`)
  - [x] Commit changes

### Task/Commit 2: e2e coverage

- [x] Add the member hidden e2e coverage per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `dcjx`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Member hide/unhide controls (kata dcjx): members join the shared reference-entity hidden pattern mirroring categories/tags — RowActions eye toggle via PUT /api/members/{id}/hidden, include-hidden toolbar toggle, editor Hidden checkbox, eye-off rendering in reserved f9c5 slots, picker exclusion via API defaults with no frontend filtering, hidden state API-sourced only; e2e mirrors tags hidden coverage; no ground-truth doc changes"`
- [x] Move this plan to `docs/plans/completed/`
