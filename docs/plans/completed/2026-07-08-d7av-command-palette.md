# Plan: Command palette — navigation, entry, app actions — Kata issue `d7av`

Build the launcher-style command palette per `docs/webui-design.md` §Command Palette: global shortcut from any screen, keyboard-driven results, page and entity navigation, entry commands that open the entry panel on the right tab, and the app actions whose backing capabilities exist. Transaction free-text search is explicitly out of scope (separate issue `d608`).

## Plan Context

- Ground truth (read before starting): `docs/webui-design.md` §Command Palette, §Layout & Structure, Interaction Rules (keyboard, overlays: centered dialogs are modal and trap focus), Hierarchical names (typing searches across the full path); `docs/webui-theme-arcade-cabinet.md` (`CommandPalette` gets the landmark treatment: white surface, ink outline, pixel shadow, mono bold uppercase title, internal scrolling with title always visible; focus ring; steps() motion); `docs/frontend-architecture.md` (boundaries, stores, no new query libs).
- Frontend-only (FE). Backing APIs already exist in the generated client.
- Current state (line numbers as of this plan's commit):
  - No global shortcut infrastructure. The only page-level shortcut is `n` on the transactions page (`frontend/src/pages/transactions-page.tsx:203-235`) with an input-focus guard (`:215-217`). Esc/Tab traps are hand-rolled per overlay (best references: `transaction-detail-panel.tsx:482-552`, `restructure-dialog.tsx:59-74` capture-phase Escape).
  - No `cmdk`, no `components/ui/command.tsx`, no `dialog.tsx`. Overlays are hand-rolled fixed `role="dialog"` asides (`restructure-dialog.tsx:104-111` is the landmark-styled reference). Do NOT add a new runtime dependency — build the palette on the existing hand-rolled dialog + combobox/listbox patterns (`features/ledger/entity-picker.tsx:121-156` has the arrow-key/active-descendant pattern).
  - Entry panel open state is local to the transactions page (`transactions-page.tsx:84-85`, `openEntryPanel` `:129-133`); `EntryPanel` has no `initialTab` prop (tabs internal, `entry-panel.tsx:80-92,157`; active tab persists to the IndexedDB draft). The sidebar "New transaction" button is disabled (`app-shell.tsx:134-158`) — leave it as is (separate concern).
  - Ledger lookups (`LedgerLookupsSnapshot`: accounts, groups, categories, tags, members — `store/transactions.ts:37-43`) load only on the transactions/register pages (`use-transactions-resource.ts:153`); nothing loads them app-wide.
  - Routes today (`pages/router.tsx:15-31`): `/overview`, `/transactions`, `/accounts`, `/accounts/group?prefix=`, `/accounts/:accountId`, `/categories`, `/tags`, `/members`, `/status`. Templates and Settings pages do NOT exist (nav disabled).
  - Status page has no manual trigger buttons, but the SDK exposes `startDatabaseBackupRun` (`api/generated/sdk.gen.ts:59`) and `startExchangeRateLoadingRun` (`:44`).
- Scope decisions (per the acceptance's "as those pages exist / do not stub dead commands"):
  - Navigation commands: the routed pages (Overview, Transactions, Accounts, Categories, Tags, Members, Status) plus entity targets that have pages — accounts (`/accounts/:accountId`) and account groups (`/accounts/group?prefix=`), searched by full FQN path. Categories/tags/members/templates have no entity pages — omit their entity targets entirely. No Settings, no Templates commands.
  - Entry commands: "New spend / income / refund / transfer" — work from ANY page by opening the entry panel on that tab (navigating to `/transactions` first when needed). Template-name prefill does not exist — omit.
  - App actions: "Run database backup" and "Reload exchange rates" wired to the existing start-run operations with a result toast (success naming the started run; failure surfacing the API error). Density toggle (no such preference exists) and Open settings (no page) — omit.
- Design decisions:
  - Palette surface: modal, centered/top-centered launcher dialog (landmark treatment), one text input + grouped result list (Navigation / New transaction / Actions). Modal semantics per the design doc: focus trapped, Esc closes, focus restored to the previously focused element (use `focusWithoutTooltip` when restoring). Opening is idempotent; the shortcut toggles.
  - Global shortcut: `Cmd+K` (mac) / `Ctrl+K` — registered once at the app-shell level; works even when focus is in an input (modifier chord is unambiguous); does not fire while the palette itself is open (toggle-close instead). Esc inside the palette must not leak to underlying panels (capture + stopPropagation per the restructure-dialog pattern).
  - Keyboard: ArrowUp/Down move the active result (roving `aria-activedescendant` listbox per the entity-picker pattern), Enter activates, typing filters; empty query shows the grouped defaults (pages, entry commands, actions); matching is case-insensitive across command titles and full FQN paths.
  - Entity data: load the ledger lookups lazily when the palette opens (reuse the existing lookups loader/snapshot; render pages/entry/actions immediately and entity results when loaded — skeleton or "loading" row per theme, no spinners).
  - Entry-panel lifting: move the open/closed(+revision) state and a requested initial tab into a store module (action helpers usable outside React per store rules); the transactions page consumes it (replacing its local state) and `EntryPanel` gains an optional initial-tab input that overrides the draft's remembered tab only when a specific tab was requested. The `n` shortcut and the page's "New transaction" button keep working exactly as today.
  - Package placement: `frontend/src/features/command-palette/` (Mina-specific workflow); the app shell mounts it; generic bits (if any) may go to `components/` only if they carry no Mina meaning.
- Protect — do not regress: existing Esc ordering on every overlay (detail panel, peek panel, side panels, dialogs, popovers) — the palette must not break their traps; the transactions `n` shortcut and entry-panel draft persistence (sticky fields, remembered tab when no explicit tab requested); nav behavior incl. `lastTransactionsPageSearch`; `just test-frontend-e2e` green.
- Scope exclusions: no transaction free-text search in the palette (kata `d608`); no template prefill; no density preference; no Settings/Templates pages; no enabling of the sidebar New-transaction button; no status-page trigger buttons; no new runtime dependencies; no backend changes; no ground-truth doc edits.

## Tasks

### Task/Commit 1: Palette shell — global shortcut, dialog, page navigation

After this commit `Cmd/Ctrl+K` opens the palette on every screen; typing filters the routed-page commands; arrows + Enter navigate; Esc closes and restores focus.

- [x] Global shortcut wiring at the app-shell level (once, window-level, mac/win modifier handling, toggle behavior) and the palette store/state (open/closed; action helpers usable outside React).
- [x] `CommandPalette` component per the design decisions: landmark-styled modal dialog, search input autofocused on open, grouped listbox results with `aria-activedescendant` roving, Enter activates, Esc (capture) closes without leaking, focus restored via `focusWithoutTooltip`, internal scrolling with the title/input pinned.
- [x] Page navigation commands for all routed pages (Transactions uses the remembered `lastTransactionsPageSearch` like the sidebar link).
- [x] New e2e `frontend/tests/e2e/command-palette.spec.ts`: shortcut opens on Overview and on Transactions; typing filters; ArrowDown+Enter navigates to Accounts; Esc closes and restores focus to the previously focused element; palette does not open twice.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Entity navigation — accounts and groups by typed name

After this commit typing an account or group name jumps to its page from anywhere.

- [x] Lazy lookups load on palette open (existing loader/snapshot; no app-boot fetch); account results (leaf name emphasized, full FQN searched and shown per the hierarchical-names rules) navigate to `/accounts/:accountId`; group results navigate to `/accounts/group?prefix=`; loading state per theme; entity results capped sensibly with best-matches-first ordering (simple contains/rank is fine — no fuzzy library).
- [x] e2e: from Overview, open palette, type a demo account leaf name → its account page; type a group prefix → the group page; hidden accounts respect the lookups' existing inclusion semantics.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Entry commands and app actions

After this commit the palette launches shorthand entry on the right tab from any page, and can trigger backup / exchange-rate runs; PROJECT_STATE reflects the palette.

- [x] Lift entry-panel open state + requested tab into the store per Plan Context; transactions page consumes it; `EntryPanel` honors a requested initial tab (draft-remembered tab otherwise); `n` shortcut and page button behavior unchanged.
- [x] Palette entry commands (New spend / income / refund / transfer): on `/transactions` they open the panel on that tab directly; elsewhere they navigate to `/transactions` and the panel opens on arrival with the requested tab.
- [x] App actions: "Run database backup" (`startDatabaseBackupRun`) and "Reload exchange rates" (`startExchangeRateLoadingRun`) — palette closes, result toast on success/failure (reuse the existing toast pattern).
- [x] Update `PROJECT_STATE.md`: command palette shipped (navigation, entry launch, backup/exchange-rate actions).
- [x] e2e: from Overview run "New transfer" → lands on `/transactions` with the entry panel open on Transfer; on `/transactions` "New income" opens the panel directly on Income and the draft-remembered tab is not clobbered on the next plain open; "Reload exchange rates" fires the POST (assert request) and shows a toast.
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
- [x] Run `just review-loop "Command palette (kata d7av) per webui-design: Cmd/Ctrl+K global shortcut from every screen; landmark modal launcher with keyboard-driven grouped results; navigation to routed pages plus account/group entity pages by full-path search (lazy lookups load); entry commands opening the entry panel on the requested tab from any page (entry-panel open state + initial tab lifted to a store, draft tab preserved otherwise); app actions run-backup and reload-exchange-rates with toasts. Constraints: frontend-only; no new runtime dependencies (hand-rolled dialog + listbox per existing patterns); no transaction search (d608); no template prefill, density, or settings commands (capabilities absent); sidebar New-transaction button untouched; existing overlay Esc semantics preserved."`
- [x] Move this plan to `docs/plans/completed/`
