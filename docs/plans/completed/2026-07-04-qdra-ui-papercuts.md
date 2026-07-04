# Plan: Fix web UI transaction and navigation papercuts — Kata issue `qdra`

Fix five visual/behavioral papercuts in the Phase 2 web UI: missing memo in the transaction detail panel, vertical misalignment of memo-less transaction list titles, clipped tag chip shadows, horizontally misaligned collapsed nav icons, and the Settings nav item rendering a blank square instead of its icon.

## Plan Context

- Ground truth: `docs/webui-design.md` (row composition, detail panel contents, tag chip rules) and `docs/webui-theme-arcade-cabinet.md` (chip shadows `--shadow-chip`, nav treatment, pixelarticons iconography). Read both before starting.
- All changes are frontend-only, inside `frontend/src/features/ledger` and `frontend/src/features/app-shell`. No API or backend changes.
- Evidence gathered up front (line numbers as of this plan's commit):
  1. **Detail panel memo**: `frontend/src/features/ledger/transaction-detail-panel.tsx` renders title, class badge, initiated date, amounts, records table, and metadata (Class/Source/Created) — but never the transaction's summary memo. The list row derives it via `lineMemo()` (`frontend/src/features/ledger/format.ts:146`), which collapses uniform active-record memos. Per `docs/webui-design.md` §Transactions detail: "The detail view shows everything the summary line truncates or hides: complete tag sets, full memos".
  2. **Memo-less row title misalignment**: `frontend/src/features/ledger/transaction-browser.tsx` — description cell `<td>` at `:481`, text block grid at `:499` with the memo line conditionally rendered at `:506`. Every row is two text lines tall (the date cell always renders day + de-emphasized year second line), and the description content is top-aligned, so a memo-less row's single-line title sits at the top edge instead of vertically centering against the date cell.
  3. **Tag chip shadow clipping**: `frontend/src/features/ledger/tag-chip.tsx:20` applies `shadow-[var(--shadow-chip)]` (2px down/right hard shadow) with fixed heights `h-5`/`h-4`; in list rows chips render inside `TagChipsLine` (`transaction-browser.tsx:94-100`) whose wrappers use `overflow-hidden` sized exactly to the chip height, so the bottom (and trailing) 2px of the shadow is cut off. The same chip-shadow pattern appears on the overflow "…" chip (`:108`), `MemberChip` (`:120`), and `MixedSentinel` (`:127`) — check those containers for the same clipping.
  4. **Collapsed nav icon misalignment**: `frontend/src/features/app-shell/app-shell.tsx` — `DisabledNavItem` (`:71-98`) button is not `w-full`; when collapsed it is wrapped in a non-`asChild` `Tooltip` whose wrapper span is full-width `inline-flex` (default start-justified), so disabled item icons sit left of the centered enabled-item (`NavLink`, `:131-134`) icons. `NewTransactionButton` (`:151`) shows the working pattern: `w-full` on the inner control.
  5. **Settings blank square**: `app-shell.tsx:12` imports `SettingsCog` from `pixelarticons/react`. That icon's SVG uses a `clipPath` whose full-viewBox rect the pixelarticons react build emits as a rendered path, painting an opaque 24×24 square over the glyph. `SettingsCog2` (and `Settings2`) are clean single-path glyphs — verified in `node_modules/pixelarticons/svg/`. Swap to `SettingsCog2`.
- Preserve, do not regress: single-height transaction lines (tags never increase row height), single-line ellipsis-truncated tag chip line, rows with memos keep the two-line title+memo layout, enabled nav items and the New Transaction button remain centered in the collapsed rail, tooltips still work on collapsed nav items.
- This is a polish fix; do not update `PROJECT_STATE.md` and do not touch ground-truth docs.

## Tasks

### Task/Commit 1: Ledger papercuts — detail memo, row title alignment, chip shadow clipping

Fixes the three transaction-list/detail defects in `frontend/src/features/ledger`. After this commit the detail panel shows the summary memo, memo-less rows center their title, and chip shadows render fully.

- [x] Transaction detail panel: render the derived summary memo (`lineMemo(transaction)`) in the header area under the title (de-emphasized, full text, no truncation) when it is non-empty. Per-record memos stay in the records table.
- [x] Transaction list description cell: make a memo-less row's title vertically center within the row (matching the date cell's vertical rhythm) while rows with memos keep the current two-line layout. Keep the expand chevron aligned with the title line in both cases.
- [x] Tag chip line: stop clipping the hard chip shadow — give the chip containers room for the 2px down/right `--shadow-chip` offset (or otherwise stop `overflow-hidden` from cutting it) while keeping the single-line, ellipsis-truncated, no-extra-row-height behavior. Apply the same fix wherever the list clips chip shadows (tags line, overflow "…" chip, member chip, mixed sentinel) — verify visually.
- [x] Extend `frontend/tests/e2e/transactions-page.spec.ts`: assert the detail panel shows the memo for a demo transaction that has one, and (if not already covered) that a memo-less transaction row renders no memo line.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: App shell nav papercuts — collapsed icon alignment, Settings icon

Fixes the two navigation defects in `frontend/src/features/app-shell/app-shell.tsx`. After this commit all collapsed-rail icons share one horizontal axis and Settings shows a real gear glyph.

- [x] `DisabledNavItem`: make the button fill the tooltip wrapper (`w-full`, matching the `NewTransactionButton` pattern) so its icon centers in the collapsed rail exactly like enabled `NavLink` items. Verify expanded-state layout is unchanged.
- [x] Replace the `SettingsCog` import/usage with `SettingsCog2` so the Settings nav item renders the gear glyph instead of an opaque square.
- [x] Extend an e2e spec (e.g. `frontend/tests/e2e/status-page.spec.ts` or a small app-shell assertion in an existing spec) to cover the Settings nav item rendering the icon (svg present, not the broken glyph) — keep it cheap; skip if a meaningful assertion is not practical and say so in the commit message.
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
- [x] Run `just review-loop "Fix five web UI papercuts (kata qdra): detail panel shows summary memo; memo-less list titles vertically centered; tag/member chip shadows unclipped; collapsed nav icons aligned via w-full disabled items; Settings icon swapped to SettingsCog2. Constraints: frontend-only; single-height transaction lines preserved; no ground-truth doc edits."`
- [x] Move this plan to `docs/plans/completed/`
