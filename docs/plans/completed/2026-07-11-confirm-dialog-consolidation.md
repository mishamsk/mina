# Plan: Shared ConfirmDialog consolidation + close-editor-on-delete parity (Kata xds2, pgc2)

Consolidate every hand-rolled confirmation dialog onto the existing shared `ConfirmationDialog`, unify dialog/toast stacking, fix the disabled-Delete affordance gap in side panels, fold duplicated delete-sentence copy, mirror the members close-editor-on-row-delete pattern to categories/tags, and close the review-flagged e2e gaps. Behavior-preserving except where the issues explicitly change it (z-layers, disabled hover/press styling, editor auto-close).

## Plan Context

- Kata issues: `xds2` (dialog consolidation + z-layers + affordance + copy + e2e gaps) and `pgc2` (categories/tags close-on-delete mirror). One sub-branch.
- MANDATORY pre-reads: `docs/frontend-architecture.md`, `docs/webui-design.md` (confirmation doctrine `:192`, reference delete `:253`, focus rules `:308` — do NOT edit the doc; it already names `ConfirmDialog` in the component inventory), `docs/TESTING.md`.
- Shared component (the sink): `frontend/src/components/confirmation-dialog.tsx:1-81` — Radix AlertDialog, overlay+content `z-[80]`, props `title/children/errorMessage/pending/pendingLabel/confirmLabel/confirmIcon/cancelLabel/open/onOpenChange/onConfirm`, Radix-owned focus trap, `onEscapeKeyDown` stopPropagation. Already used by `transaction-browser.tsx:956-989`, `tags-page-content.tsx:276`, `categories-page-content.tsx:282-310`, `entry-panel.tsx:2970`, `recurring-page-content.tsx:457`.
- Hand-rolled dialogs to migrate (each is a `fixed inset-0` div + `role="alertdialog"` section + its own ~60-line focus-trap effect; delete the trap with the migration):
  - `members-page-content.tsx:367-434` (row delete; trap `:137-195`; z-[80])
  - `members-side-panel.tsx:418-484` (editor delete; trap `:146-208`; z-[60])
  - `accounts-tree.tsx:820-888` (row delete; z-[60])
  - `accounts-side-panel.tsx:970` (credit-limit delete) and `:1044` (account delete) — both z-[60]
  - `categories-side-panel.tsx:501-569` (editor delete; z-[60]; Esc-defer `:197`)
  - `tags-side-panel.tsx:416-484` (editor delete; z-[60]; Esc-defer `:161`)
  - `transaction-detail-panel.tsx:690-…` (transaction delete; z-[60])
- Copy consolidation:
  - Transaction delete sentence ("Delete {title} from {date} for {amount}? … tombstones the transaction …") duplicated between `transaction-browser.tsx:975-986` and `transaction-detail-panel.tsx:714-718` → one shared ledger helper/component used by both.
  - Reference-entity delete sentence ("This tombstones the X and removes it from default X lists and pickers.") duplicated across members/accounts/categories/tags dialogs → extract an app-specific wrapper next to the shared dialog in `src/components` (sanctioned: "app-specific wrappers stay in components") taking the entity noun/name, or a copy-builder helper — pick ONE mechanism and use it in all four.
- Z-layer unification (decided):
  - All confirmation dialogs land on the shared component's `z-[80]` (above toasts) — automatic via migration.
  - Toasts: make `z-[70]` the Toast component's default container layer (`toast.tsx:52` currently `z-40` with per-page `containerClassName="z-[70]"` overrides in `members-page.tsx:131`, `accounts-page.tsx:211`, `recurring-page.tsx:54`, `tags-page.tsx:207`, `categories-page.tsx:217`, and an inconsistent `z-[60]` in `command-palette.tsx:1360`); drop the per-page overrides. No other layer changes (panels z-50, tooltip z-100, popover as-is).
- Disabled-Delete affordance (from xds2 comment): `members-side-panel.tsx:391-407` neutralizes bg/text/border/cursor/shadow but NOT `hover:bg-destructive/90` nor the active press-in translate. Fix to match the complete form at `accounts-side-panel.tsx:846` (`aria-disabled:hover:bg-card aria-disabled:hover:shadow-none aria-disabled:active:translate-x-0 aria-disabled:active:translate-y-0` in addition to the existing classes). Audit categories/tags side-panel delete buttons for the same gap and fix identically.
- pgc2 mirror (decided): members reference implementation is `members-page.tsx:74-78` (`closeDeletedMemberEditor`) wired via `onMemberDeleted` (`:123`) and called from `members-page-content.tsx:206` on delete success. Categories/tags lack it: `categories-page.tsx:53-55` / `tags-page.tsx` derive the selected entity from the snapshot, so row-deleting the edited entity leaves a stale edit panel. Add `closeDeletedCategoryEditor`/`closeDeletedTagEditor` + `onCategoryDeleted`/`onTagDeleted` props through `CategoriesPageContent`/`TagsPageContent`, called in each `confirmDelete` success branch — exact analog of members.
- Escape semantics must be preserved through migration: when a side panel and a row/editor dialog are both open, Escape closes the dialog first and the panel stays (the hand-rolled traps defer via `[role='alertdialog']` checks at `members-side-panel.tsx:152-157`, `categories-side-panel.tsx:197`, `tags-side-panel.tsx:161`; the shared component stops Escape propagation — verify the panel-level handlers behave with Radix dialogs).
- e2e additions (all in existing spec files, following their patterns):
  - Members keyboard-reveal restore: `members-page.spec.ts:280-286` only hovers; restore a row-focus reveal assertion with `toHaveCSS("opacity", "1")` mirroring `reference-row-actions.spec.ts:130-216`.
  - Editor-open + row-delete auto-close: members, categories, and tags — open the edit panel, row-delete the same entity, assert the panel closes (covers pgc2 and the xds2 `closeDeletedMemberEditor` path).
  - Escape priority: open a side panel AND its row/editor delete dialog, assert Escape closes the dialog first and the panel survives (at least members + one of categories/tags).
  - Transaction row-delete post-success focus restore (pj89 gap): after confirming a row quick-delete on the transactions page, assert focus lands per the current implementation's restore behavior.
- Existing e2e must stay green; only strengthen/add specs — do not weaken any assertion. `reference-row-actions.spec.ts`, `accounts-page.spec.ts` Escape tests (`:1516-1531`) are regression guards for the migration.
- Docs: no ground-truth doc edits. Update `frontend/src/components` or feature package docs only if one exists and documents dialog contracts. No PROJECT_STATE.md change (refactor/parity fix).

## Tasks

### Task/Commit 1: xds2 — migrate all hand-rolled dialogs onto ConfirmationDialog; unify z-layers; fix disabled affordance

- [x] Migrate the eight hand-rolled dialogs listed in Plan Context onto `ConfirmationDialog`, deleting their local focus-trap effects and manual overlays; preserve each dialog's title, copy, pending label, error surfacing, and confirm/cancel semantics; fold the duplicated transaction and reference-entity delete copy per the Plan Context mechanism.
- [x] Unify toast layering: `z-[70]` default in `toast.tsx`, remove the five per-page overrides and align the command-palette toast.
- [x] Fix the disabled-Delete neutralization in `members-side-panel.tsx` (match `accounts-side-panel.tsx:846`); audit and fix categories/tags side panels likewise.
- [x] Verify Escape-priority behavior survives (panel + dialog open → Escape closes dialog only), adjusting panel-level Escape handlers if the Radix migration changed event flow.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes (existing specs unchanged)
  - [x] Update progress in Kata issue `xds2` (`kata comment xds2 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: pgc2 — categories/tags close-editor-on-row-delete mirror

- [x] Add `closeDeletedCategoryEditor`/`closeDeletedTagEditor` and the `onCategoryDeleted`/`onTagDeleted` plumbing per Plan Context; call on row-delete success.
- [x] e2e: categories and tags editor-open + row-delete auto-close specs.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `pgc2` (`kata comment pgc2 --agent ...`)
  - [x] Commit changes

### Task/Commit 3: xds2 — e2e hardening

- [x] Members keyboard-reveal restore (row focus → actions `opacity: 1`).
- [x] Members editor-open + row-delete auto-close spec.
- [x] Escape-priority specs (panel + dialog both open) for members and one of categories/tags.
- [x] Transaction row-delete post-success focus-restore assertion.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `xds2` (`kata comment xds2 --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "ConfirmDialog consolidation + close-on-delete parity (kata xds2, pgc2): eight hand-rolled alertdialogs migrated onto the shared Radix ConfirmationDialog (focus traps deleted, dialogs uniformly z-[80] above toasts), toast layer unified to z-[70] default, duplicated delete copy folded, side-panel disabled-Delete neutralization completed to the accounts-side-panel form, categories/tags gain the members close-editor-on-row-delete mirror, e2e hardened (keyboard reveal, editor-open row-delete auto-close, Escape priority, post-delete focus restore); no ground-truth doc changes"`
- [x] Move this plan to `docs/plans/completed/`
