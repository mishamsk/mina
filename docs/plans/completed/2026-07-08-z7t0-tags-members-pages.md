# Plan: Tags and Members reference pages — Kata issue `z7t0`

Instantiate the shared reference-data pattern (established by the Categories page, kata `s5nw`) for Tags (hierarchical) and Members (flat), enabling both sidebar nav items.

## Plan Context

- Ground truth (read before starting): `docs/webui-design.md` §6 Reference data ("One shared pattern: searchable tree list (flat list for Members) + side-panel editor; include-hidden toggle where applicable; tombstone delete with confirmation; rename/move with subtree rewrite"), affordance-class and hidden-entities rules; `docs/webui-theme-arcade-cabinet.md`; `docs/frontend-architecture.md`.
- Frontend-only (FE). Uses existing tag and member CRUD APIs — no backend changes.
- Pattern source (read first): the Categories instantiation — `frontend/src/features/reference/` (generic tree rows/toolbar/table shell + PACKAGE.md boundary), `frontend/src/features/categories/*` (page content, side panel, resource with `refreshCategoriesAfterMutation`), `frontend/src/store/categories.ts`, `frontend/src/pages/categories-page.tsx`, `frontend/tests/e2e/categories-page.spec.ts`. Follow them closely — this task is deliberately copy-adapt, per-entity stores/panels/resources are intentional instantiation, not duplication to abstract away.
- API surface (generated client via `@/api`):
  - Tags mirror categories minus intent: `Tag` (`tag_id`, `fqn`, `is_hidden`, `parent_fqn`, `name`, `level`), `listTags` (include_hidden, sort=fqn, limit ≤500 — reuse the >500-safe paging loop pattern from the categories management fetch), `createTag` (`{fqn, is_hidden?}`), `updateTag` (PATCH body only `is_hidden`), `deleteTag` (tombstone, 409), `listTagGroups` (shared `GroupState`), `setTagHiddenByPath`, `restructureTags` (`{from_fqn, to_fqn}` → `moved_count`).
  - Members are flat with NO hidden state: `Member` (`member_id`, `name`), `listMembers` (sort=name; no include_hidden, no q — bounded list, filter client-side per the bounded-lookup-list rule), `createMember` (`{name}`), `updateMember` (`{name}` — rename IS supported), `deleteMember` (tombstone, 409).
- Known parameterization gaps in `features/reference` to close (from the s5nw operator review) — smallest changes that keep the categories page pixel-identical:
  - The badge column: `badgeHeader` is required and the grid always renders a badge column — make it optional (Tags and Members rows carry no badge).
  - `ReferenceToolbar` unconditionally renders the include-hidden toggle — add an opt-out for Members.
  - Members are flat `name` entities (no `fqn`, no groups, depth 0) — the adapter must accept that shape without faking hierarchy.
- Design decisions:
  - Tags page (`/tags`): searchable FQN tree with groups, include-hidden eye toggle (URL `q`/`hidden`), hidden eye-off indicators; row actions — leaf hide/unhide flat toggle (`updateTag`), group hide/unhide (`setTagHiddenByPath`), move/rename hover-revealed button on leaf and group rows → shared `RestructureDialog` (`entityLabel="Tag path"`) → `restructureTags`, success toast with `moved_count`; NO delete row action (no deleteability API); side panel — create (FQN + hidden), edit (FQN read-only, hidden toggle), Delete with confirm naming the FQN, 409 surfaced.
  - Members page (`/members`): flat searchable list (client-side name filter, URL `q`), no hidden toggle, no groups, no restructure; row action — rename could live in the editor only (member rename is a simple name PATCH — put it in the side panel edit form, not a row action); side panel — create (name), edit (rename name), Delete with confirm naming the member, 409 surfaced (member attributed to records). Member rows show the standard member initials treatment only if trivially reusable — otherwise plain name; members are not hierarchical, do not render FqnPath ancestors.
  - New store modules `store/tags.ts`, `store/members.ts` + per-entity resources with refresh helpers: tag mutations → refresh page snapshot + `refreshLedgerLookups()`; tag restructure → additionally invalidate transaction pages (tag chips on rows change); member mutations → refresh page snapshot + `refreshLedgerLookups()` (member chips/filters); member rename → also invalidate transaction pages (member names display on rows/detail).
  - Nav: enable Tags and Members items in `app-shell.tsx`; routes `/tags`, `/members` in `pages/router.tsx`. Templates stays disabled.
- Demo data: tags (`Family`, `Cash`, `Income`, `Jordan`, …) and members (e.g. `Morgan`, `Avery`) exist in the demo seeder; e2e can create extras via raw API per the categories spec conventions.
- Protect — do not regress: the Categories page and its e2e (you are touching the shared `features/reference` code — categories must stay visually and behaviorally identical); transactions filter/picker behavior (lookups invalidation shared); accounts pages; `just test-frontend-e2e` green.
- Scope exclusions: no Templates page; no tag/member drill-down pages; no delete row actions; no backend/API changes; no ground-truth doc edits; no reworking the categories page beyond the minimal reference-structure parameterization.

## Tasks

### Task/Commit 1: Tags reference page

After this commit `/tags` is live with the full tree pattern and the Tags nav item is enabled.

- [x] Minimal `features/reference` parameterization: optional badge column (categories unchanged), keep everything else as-is for this commit.
- [x] `store/tags.ts` + `features/tags/` (resource with `refreshTagsAfterMutation` per Plan Context, page content, side panel) instantiating the reference structure; `/tags` route; Tags nav enabled.
- [x] Row actions and restructure per Plan Context design decisions (hide toggles leaf/group, move/rename via shared dialog wired to `restructureTags` with bulk invalidation).
- [x] New e2e `frontend/tests/e2e/tags-page.spec.ts` covering: tree render + search + URL params; include-hidden with a hidden tag (raw-API fixture) and eye-off indicator; leaf and group hide toggles; restructure via dialog (POST asserted + tree re-render + renamed tag visible in the transactions tag filter options); side-panel create/edit/delete incl. a 409 delete attempt on a demo tag in use.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Members reference page

After this commit `/members` is live with the flat-list pattern, the Members nav item is enabled, and PROJECT_STATE reflects both pages.

- [x] `features/reference` opt-outs needed for flat entities (toolbar without include-hidden; flat name rows without groups/hierarchy), keeping Categories and Tags unchanged.
- [x] `store/members.ts` + `features/members/` (resource with refresh per Plan Context, page content, side panel with create/rename/delete) instantiating the structure; `/members` route; Members nav enabled.
- [x] New e2e `frontend/tests/e2e/members-page.spec.ts`: list renders demo members sorted by name; search filters with URL `q`; create; rename (and verify the renamed member appears in the transactions member filter options); delete with confirm; 409 delete attempt on a member attributed to demo records.
- [x] Update `PROJECT_STATE.md`: Tags and Members reference pages shipped (fold into the web UI bullet).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Tags and Members reference pages (kata z7t0) instantiating the s5nw reference pattern: Tags FQN tree with include-hidden, hide toggles (updateTag/setTagHiddenByPath), move/rename via shared RestructureDialog + restructureTags, side-panel create/edit/delete with 409 surfacing; Members flat searchable list with side-panel create/rename/delete; both nav items enabled; lookups invalidated on mutations, transaction pages invalidated on tag restructure and member rename. Constraints: frontend-only; no ground-truth doc edits; categories page stays identical (shared reference structure only minimally parameterized: optional badge column, include-hidden opt-out, flat name entities); no delete row actions; no Templates page."`
- [x] Move this plan to `docs/plans/completed/`
