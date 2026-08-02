# Mina Web UI Design

This document is the ground truth for the Mina web UI user experience: product stance, page content, structure, interaction rules, domain display rules, and the screen inventory. Implementation plans for individual screens must follow this document.

Ownership boundaries:

- `docs/frontend-architecture.md` owns technical architecture, package boundaries, and data-access rules.
- `docs/accounting-semantics.md` owns transaction classification and display-amount derivation.
- `docs/hierarchy-semantics.md` owns group/leaf hierarchy semantics, invariants, and restructuring rules.
- `SCOPE.md` owns durable product boundaries; Kata owns planned work and sequencing.
- `api/openapi.yaml` owns API contracts.
- Visual styling — themes, color palettes, typography, spacing values, radii, motion aesthetics, iconography — is out of scope and owned by theme specifications; the base theme is `docs/webui-theme-arcade-cabinet.md`. This document stays theme-agnostic; multiple themes are planned, so structure and behavior must not depend on any one visual style.

## Product Stance

- Mina is a professional tool for a technical household operator, not a consumer budgeting app. The quality benchmark is Stripe Dashboard / Linear / Mercury: calm, fast, information-dense.
- Truth-first: the double-entry model is never hidden or falsified. Screens default to a simplified classified view and always allow drilling into the raw journal records.
- The backend is local, so the UI must feel instant: no artificial spinners, no blocking full-page loads after first paint.

Primary usage patterns, most to least frequent; every design decision favors the top of this list:

- Glance: check main-account balances and recent activity in seconds, from anywhere in the app.
- Batched entry: sittings that enter many transactions in a row, constantly cross-referencing what is already entered.
- Review and slicing: walk recent activity, fix categories/tags, answer "how much on X", "what does Jordan owe", verify an account's register.
- Gardening: occasional maintenance of accounts, categories, tags, members, templates, backups.

## Core UX Doctrine

### Progressive disclosure

Every transaction surface presents exactly two layers. This doctrine applies to all current and future screens.

- Transaction line: one row per transaction showing the server-derived transaction class and display amount per `docs/accounting-semantics.md`. This is the default everywhere. Multi-part transactions stay single-height (transfer: the moved amount; exchange: the sold-side amount only, with the bought side and the effective rate one expansion away; more than one shape: one identifiable primary amount or none plus a bare `+` more-parts indicator, with complete amounts in detail and never a synthetic total) — there is no separate shape-summary view between the line and the records.
- Journal records: the full balanced record table with accounts, signed amounts, categories, tags, members, statuses, and dates. One expansion away, always editable.

Entry mirrors display:

- Shorthand forms (spend, income, refund, transfer, exchange) are the default entry path, backed by the shorthand REST endpoints.
- The full journal editor is always one action away ("Edit as journal"). Escalation preserves everything already entered.
- Editing an existing transaction reopens the shorthand shape when its records still fit that shape; otherwise it opens the full editor.

Hard rule: the UI never re-derives accounting truths client-side. Transaction class, transaction shapes, record roles, display amounts, and balances are server-derived values; the UI renders them.

### One shared browser

There is exactly one transactions/records browsing system, built once and embedded everywhere:

- On the Transactions page it lists classified transaction lines that expand inline to journal records.
- On account, group, category, tag, and member pages it appears pre-filtered to that entity. Account and group registers are the one-sided records view — the only true records-only presentation.
- Record rows in registers use a side peek panel to preview the full containing transaction without leaving the list.
- Filtering, sorting, selection, inline editing, keyboard driving, and the peek panel behave identically in every embedding.

There are no separate "transaction mode" and "record mode" screens; context determines which shape the shared browser renders.

## Layout & Structure

Structure and navigation only; how any of it looks is owned by the theme specification.

- Fixed left sidebar navigation, collapsible to an icon rail. Sections: Overview, Transactions, Recurring, Accounts, then a Reference group (Categories, Tags, Members, Templates), then Status/Settings pinned at the bottom.
- A compact balance strip of featured accounts is visible from every screen (in or adjacent to the sidebar). Featured is a backend account metadata flag in portable state; strip entries link to account pages.
- A prominent "New transaction" action is available from every screen, alongside the command palette.
- Content area is fluid; data tables may use the full content width.
- Every page uses one header pattern: title (with optional breadcrumb for detail pages) on the left, primary actions on the right, filter/toolbar row beneath when applicable.
- Pages carry no standing description text. Each page header includes a small help icon button that reveals a short explanatory paragraph on demand (popover or collapsible); the explanation is hidden by default.
- Overlays: side peek panels for previews, the transaction editor modal for all transaction create/edit/split/duplicate, centered dialogs only for confirmations.
- Side peek/detail panels are non-modal: no backdrop, no focus trap, no modal semantics; the underlying list stays interactive so row navigation can drive the panel. `Esc` closes the panel and returns focus to the originating row. Clicking outside the panel also closes it — the click still performs its normal action on the underlying content (a click that opens another record simply moves the panel). The transaction editor modal is a true modal: focus trap, restores focus to its invoker on close, and never closes on outside interaction — backdrop clicks are absorbed (with a one-step outline flash) and never activate underlying content. Centered dialogs remain modal and trap focus.
- Table density (comfortable/compact) is a persisted UI preference.

## Authentication

- Browser startup checks public authentication status before rendering the app shell. When authentication is disabled, the shell opens unchanged.
- When authentication is enabled without a valid session, a focused login screen requests email and password; failures stay inline and clear the password field.
- A successful login opens the normal shell and survives reload through the server-owned session cookie.
- Authenticated shells expose a global Log out action at the bottom of the sidebar. Logout replaces the shell with login when authentication remains enabled; if authentication becomes disabled, the shell stays visible without the logout action. Any protected-request `401` replaces the shell with login.

## Command Palette

A launcher-style command palette (VS Code / Spotlight pattern) is a core Phase 2 surface, available everywhere via a global shortcut. It serves:

- Navigation: jump to any page and any entity page by typed name — accounts, groups, categories, tags, members, templates.
- Entry: "new spend / income / refund / transfer / exchange" commands; typing a template name starts a prefilled entry. Both open the transaction editor modal in place — no navigation.
- Transaction search: free-text search across transactions/records following the `GET /api/transactions?search=` semantics owned by `api/openapi.yaml`; entered by typing a leading ASCII apostrophe (Space on an empty input inserts the apostrophe; later spaces stay part of the query); result rows show date, class, title/memo, and amount; selecting a result navigates to the URL-addressable transaction detail.
- App actions: trigger backup, reload exchange rates, toggle density, open settings.

## Theme-Agnostic Presentation Rules

Rules every theme must satisfy:

- Meaning is never carried by color alone; signs, labels, and badges always accompany it.
- Money semantics stay visually distinct: money entering the household (income, refund) reads differently from spend; ordinary spend never reads as an error or alarm; error/destructive treatment is reserved for errors and destructive actions, not for negative amounts.
- Each transaction class has a distinguishable badge treatment.
- Monetary amounts use tabular numerals and right-align in tables.
- Loading uses skeletons shaped like the final content, never centered spinners; previous data stays visible while refetching; loading causes no layout shift.
- Motion is functional, not decorative; `prefers-reduced-motion` is respected.
- Icons accompany labels; controls are never icon-only except in the collapsed rail, table row actions with tooltips, and toolbar state toggles with accessible labels, tooltips, and icon-visible state.
- Three affordance classes stay visually distinct in every theme, so a glance separates "describes", "filters", and "acts":
  - Indicators: descriptive marks — class icons, status markers, hidden markers, type/intent badges. Read-only; never interactive beyond a tooltip.
  - Entity chips: reference values (category, tags, member) rendered as chips; activating a chip adds that entity to the current view's filters.
  - Actions: controls that change state or open another surface. Surface-opening actions render as buttons — labeled buttons in page headers, panels, and dialogs; compact icon buttons with tooltips in table rows. In-place state toggles (hide, feature) render as flat toggle icons whose current state is visible in the icon itself.

## Domain Display Rules

Canonical rendering rules; every screen uses these so the product reads as one system.

### Amounts and currency

- Format: locale-grouped number with explicit sign for signed contexts, e.g. `−1,234.56`, followed by a de-emphasized currency marker: the conventional currency symbol when the currency has one (e.g. `−1,234.56 $`, `−1,234.56 €`), otherwise the ISO code. Crypto currencies always use their code. Contexts locked to one known currency (an account register header, a single-currency form) may drop the marker.
- Fiat renders with 2 decimals; crypto (`C::` prefix) renders up to 8 decimals with trailing zeros trimmed.
- Never sum mixed currencies natively. Aggregations across currencies display the USD equivalent, visibly marked as approximate: `≈ 1,234.56 USD`. Records with no `amount_usd` are surfaced as "unconverted" in any aggregate that needs them.
- Display amounts per transaction class follow the class table in `docs/accounting-semantics.md`: spend/clawback negative, income/refund positive, transfer/exchange neutral with movement amounts shown separately. A compact transaction line with more than one shape shows one identifiable primary amount or none plus a bare, non-focusable `+` more-parts indicator; complete amounts stay in detail and delete confirmation, and no synthetic total is shown. Exchanges also show the server-derived effective rate wherever both sides are visible — transaction detail, the account register peek, and the entry form — formatted as a rate with its currency pair and never recomputed in the browser.

### Balances

- A displayed account balance includes posted and pending records; expected and cancelled records are excluded. Account pages additionally show a posted-only figure.
- Balance semantics follow account type per `docs/accounting-semantics.md`: `owned` and `party` accounts surface balances as household state, presented as separate groupings; `flow` and `system` accounts never appear in balance views.

### Hierarchical names (accounts, categories, tags, templates)

- FQNs render as a segmented path: ancestor segments de-emphasized, leaf segment emphasized, e.g. `banks:Chase:` (de-emphasized) `Joint` (emphasized).
- Dense table cells (transaction lines) show only the leaf name, with the full FQN path on hover/tooltip. Registers, page headers, trees, and pickers use the segmented-path rendering.
- On overflow, truncate middle segments (`banks:…:Joint`); the full path is always available in a tooltip.
- Pickers and trees indent by level and group by parent; typing searches across the full path, not just the leaf.
- In the transaction detail panel and account-register peek, the record table's account path is a single link — the whole segmented path — opening that account's register page. Account-name links navigate: they never filter and never start editing (the mirror of "chips never navigate"); activation never toggles the row's record disclosure. Ancestor segments are never separately interactive; records reference concrete accounts, so the destination is always an account page, never a group page. An unresolvable account renders as plain text.

### Transaction summary line

- Simple two-sided transactions title as `From → To` using the leaf names of both sides: spend → `Joint → TraderJoes` (funding → merchant); income → `Acme → Joint` (source → destination); refund → `Target → Joint`; transfer → `Joint → Emergency`; exchange → `USD → EUR`; adjustment → affected account leaf. Complex/mixed transactions fall back to memo or the dominant counterparty leaf. Titles are derived server-side or from records as a display convention.
- Row composition: class icon, initiated date, description (the `From → To` line) with the memo as a truncated second line (full memo in a tooltip) and trailing status indicators, category, tags, member, display amount, and the trailing actions column (open detail). The description column header reads "Description".
- Class is encoded as a distinct icon plus its class color in a narrow leftmost column, with the class name in a tooltip; that column's header is hidden except on very wide screens.
- The date cell is compact: the day (`May 31`) with the year as a de-emphasized second line on every row.
- Expected, pending, cancelled, and mixed-status indicators trail the description text with distinct glyphs, tooltips, and accessible names; posted rows show nothing and indicators never change row height.
- Lifted record values (category, tags, member, status) follow the uniformity display rule: identical across all active records → show the value; differing → show a "Mixed" sentinel indicator. Category lifts over categorized records only, so an uncategorized funding record never makes a single-category transaction read as "Mixed"; a transaction with no categorized record shows no category.
- Member uniformity ignores unattributed records (counterparty/flow records rarely carry attribution): exactly one distinct member among attributed records → show it; none attributed → blank (whole-household); multiple distinct → Mixed.
- The memo second line shows the memo when it is uniform across active records (ignoring empty memos); differing memos omit the second line — never a "Mixed" sentinel as prose. When a mixed-class title already falls back to the memo, the second line is omitted.
- Tag chips in lines render at the micro size, showing tag leaf names only, filling up to two chip rows within the standard row height; tags that still do not fit collapse into an overflow indicator chip. Tags never increase row height; the transaction detail view shows the complete set.

### Entity chips

- Category, tag, and member values render as entity chips wherever they appear in transaction lines and detail views, except in the transaction detail's per-record disclosure, where values render as plain undecorated text.
- Every entity chip is a filter affordance: activating it adds that entity to the embedding browser's active filters, appearing as a removable typed filter chip in the filter bar — slicing continues in place, preserving list context. In the detail/peek panel, chip activation filters the underlying list. In embeddings without a filter bar (e.g. Overview recent activity), chip activation opens Transactions with that filter applied.
- Chips never navigate to entity pages (those stay reachable by name via the command palette and entity lists) and never start inline editing — editing has its own affordance per the inline-editing rule.
- Entity chips read as one family and stay visually distinct from indicators and actions per the affordance-class rule; non-entity chip-shaped rendering (e.g. amounts) must not read as interactive.

### Dates and statuses

- Lists show `initiated_date` as absolute dates: `Jun 30` in the current year, `Jun 30, 2025` otherwise. No relative dates in tables.
- All dates and times display in the browser's local timezone. Civil-date logic — entry default "today", current-year formatting, date grouping and comparisons — uses local time, never UTC calendar dates. Civil dates stay date-only in storage; timestamp fields stay UTC.
- Expected and pending records/transactions carry visible status indicators and de-emphasized amounts; posted needs no marker; cancelled renders struck-through and de-emphasized. Transaction-line status indicators trail the description.
- Unreconciled records show a small status indicator (reserved for Phase 5 import workflows; hidden until relevant data exists).

### Hidden entities and members

- Hidden accounts, categories, and tags are excluded from pickers and default lists everywhere. Broader pickers and filter menus offer an explicit "Include hidden" toggle; inline transaction editors omit the toggle and keep hidden entities excluded. Hidden items render with an eye-off icon.
- No member attribution means whole-household and renders as nothing. Attributed records show a small member initials chip.

## Interaction Rules

### Keyboard

- Keyboard-complete tables: up/down moves row focus; in the transactions browser Space toggles inline expansion of the focused row and, outside bulk-edit mode, Enter opens the detail panel (in bulk-edit mode Space toggles selection per Bulk operations); open peek, start inline edit, and selection stay keyboard-driven — batch review sessions never need the mouse.
- Global shortcuts: open command palette, new transaction (opens the transaction editor modal in place on any screen), focus list search, `Esc` closes overlays, `Cmd+Enter` submits forms, `Cmd+Shift+Enter` saves and closes in the entry modal, arrows + `Enter` drive pickers; hierarchical pickers add segment completion per Pickers — Tab/ArrowRight commit a segment, ArrowLeft/Backspace back out.
- Toggling bulk-edit mode is available from the toolbar and the command palette; in-mode selection keys per Bulk operations.

### Tables and filtering

- Server-driven pagination/sort/filter, sticky header, right-aligned numeric columns, whole-row affordances for expand/peek — no per-row disclosure control and no reserved indicator column; the row itself is the affordance, and an expanded row carries a persistent theme-owned expanded-state treatment that visually joins it to its expanded content — leading checkbox column only in bulk-edit mode (see Bulk operations).
- Per-row actions live in one narrow trailing actions column — always the rightmost column, in every table — never mid-row. Button-class actions render as compact icon buttons with tooltips and are always visible: no hover- or focus-reveal semantics anywhere. State toggles stay persistently visible because they carry state. Fit decides presentation, never count: when the actions cell fits the full action cluster it shows all buttons; when it cannot, the cluster collapses into a single overflow (⋯) button that opens a floating panel with all actions — by the column-collapse priority in the transactions browser, and per row in reference tables.
- Tables render no Actions column header; the actions column is right-padded so its trailing margin matches the table's leading padding.
- Reference/dictionary row activation (click, Enter, or Space on a leaf row) opens the entity's read-only detail/register page: accounts open their register, account groups the group register, categories/tags/members their drill-down pages. Edit is a compact trailing row action with a tooltip; all action buttons stop row-activation propagation. The transactions browser is the explicit exception: row activation (click or Space) expands journal records, Enter opens the detail panel outside bulk-edit mode, and its detail action stays explicit.
- Stable column layout: fixed percentage-based column widths so columns never shift when paging or when row content changes.
- When horizontal space runs out, columns collapse by priority instead of showing a horizontal scrollbar: member first, then row actions fold into a single overflow (⋯) menu, then tags, then category.
- Pagination shows "Page X of Y" from server-provided total counts.
- Moving between pages keeps the current rows visible until the next page arrives — no skeleton flash or flicker for uncached pages (skeletons are for first load only).
- The browser fills the available viewport height: the table body flexes and the pagination footer sits at a small, consistent inset from the viewport bottom, matching the sidebar's bottom-control inset so the two bottom edges align.
- Shareable state: filters, search text, sort, and list position live in the URL (per `docs/frontend-architecture.md`). Detail pages are URL-addressable. Sidebar navigation returns to a page's last-used state.
- Shareable-state URL writes that fire while an overlay is open (`?entry=` or the detail panel's `transaction=`) preserve the overlay params — a delayed write (e.g. debounced search) never closes an open surface — and rewrite the overlay's one history entry so Back still closes the overlay onto the updated list state.
- Filter bar pattern: a Filter toggle in the toolbar row opens a dedicated full-width filter bar directly beneath it; the "Add filter" menu and the accumulated removable typed filter chips live in that bar and never inflate the toolbar row. Filter dimensions: account, category, tag, member, amount range, date range (initiated/pending/posted), posting status, reconciliation status, transaction class, transaction shape, and record role — the last three are derived values the server returns, including `refund` and `clawback` as their own filterable values.
- While the filter bar is open, the Filter toggle renders as an X (close) icon button; activating it dismisses the bar and clears every chip-backed filter dimension. Standing toolbar controls — search and the class dropdown — are unaffected by the X and clear only through their own affordances.
- The filter bar opens automatically when a view loads with, or gains, chip-backed filters (deep links, chip activation).
- Day-step controls are square icon buttons with chevrons only, flanking the go-to-day date input, plus a Today shortcut that returns the view to the current day.
- Jumping to a day lands the view on the page containing that day when possible; if the day has no transactions, it falls back to the first transaction at or before that day, clamping at list boundaries as needed, and brings the target row into view with a transient highlight. Day-stepping keeps working after any jump.
- Transaction class is a primary classification: it filters from a standing toolbar dropdown beside search and date jump, not from the Add-filter menu; the dropdown owns the URL-backed class state.

### Inline editing — the uniformity rule

Transaction-level values are editable in place only when the edit maps mechanically onto records:

- Category, tags, member: editable on the transaction row only when the value is identical across all active records; the edit applies to all of them.
- Amount: editable on the transaction row only for simple shapes (minimal two-sided single-currency spend/income/refund/transfer) where the change derives mechanically to both records.
- Everything else is edited per-record in the expanded records view, or through the full form.
- Inline editors are the shared pickers: category search popup, tag search with multi-select, member popup, account picker with context-aware type filtering.
- Inline editing has its own trigger, separate from chip activation: the keyboard edit action on the focused cell, or a hover-revealed edit control on editable cells. Activating an entity chip always filters, never edits.
- Inline editing exists only in transaction rows and the expanded records subtable. The Transactions screen's detail panel is read-only: no panel cell is an inline-edit target by any path; its values change only through the transaction editor modal via the panel's Edit or Split actions. The account-register peek is also read-only and exposes only "Open transaction".

### Bulk operations

- Bulk selection is gated behind an explicit bulk-edit mode; during normal browsing the shared browser renders no selection controls.
- A toolbar action enters the mode: entering swaps the toolbar row for a bulk-mode bar (mode indicator, live selection count, select-page/clear, Done) and reveals the leading checkbox column and a persistent bulk action surface, visible from 0 selected.
- Entering collapses expanded rows, closes detail/peek panels, and discards any inline-editor draft.
- Exiting (Done, the Esc ladder, or any route navigation) clears selection and all draft bulk state and restores the normal toolbar. Bulk-edit mode is transient UI state — never in the URL, never restored by deep links.
- While the mode is active, row expansion, detail opening, row actions, chip filter-activation, occurrence confirm/dismiss, and ordinary inline editing are unavailable; unavailable affordances are removed, not grayed. Only the bulk surface's own buttons use the disabled treatment, with tooltips naming the remedy.
- Filters, search, and sort are frozen while in mode; pagination stays live.
- Selection mechanics: the whole row is the selection target (click, Space, or Enter toggles); Shift+Click / Shift+Space / Shift+Up/Down range-select from the anchor; the header checkbox and Cmd/Ctrl+A select the page. Expected occurrences are never selectable.
- Selection is page-local: paging keeps the mode active, clears selection, and discards any open bulk-editor draft.
- Bulk field edits — category (replace), tags (add), member (set) — launch from the bulk action surface or from any selected row's editable cell (the standard inline-edit trigger, or `c`/`t`/`m`); both entry points open the same editor (the bulk-surface variant may offer Include hidden; row-launched variants never do, per the hidden-entities rule) and apply to the entire selection through the owning save boundary (record bulk endpoints where supported, atomic transaction replacement for member). Bulk category applies to the selection's categorizable records and reports how many rows it skipped.
- The uniformity rule applies: a bulk edit targets only transactions whose records are uniform for that field. Non-qualifying selected transactions are skipped and reported in the result toast ("12 updated, 2 skipped: mixed records"); an all-skipped result uses warning treatment. Complex transactions that cannot be mapped mechanically to a uniform record edit are skipped.
- Selection is retained after a successful apply so edits chain (categorize, then tag).
- Esc ladder in-mode, one level per press: open bulk-editor draft → discard it; else selection > 0 → clear selection; else exit the mode.
- Record-level bulk (account reassignment, status changes) is available in account registers where records are the row unit.

### Pickers

- Entity pickers are type-ahead comboboxes over hierarchical data with segment-by-segment completion. The input text is the single source of truth: its longest leading segment chain that resolves to a group in the picker's option set (after context type filtering and the active surface's hidden-entity policy) is the committed prefix; the remainder filters. Groups are derived client-side from the pickable leaves and are navigation only — committed values are always leaves; a group with no pickable leaves never appears (pruned, never disabled).
- Flat entity sets such as members bypass segment derivation; punctuation in a flat name, including `:`, remains part of one opaque leaf.
- Two derived modes, never user-toggled: when the committed prefix is non-empty and the remainder has no colon, the popup is a level browser — the committed prefix's children (groups and leaves) filtered by segment name under a breadcrumb header whose crumbs re-root on activation; when the prefix is empty or the remainder still contains colons (e.g. pasted mid-paths), the popup is full-path substring search over leaf FQNs scoped under the prefix, leaves ranked before groups. Typing or pasting an exact leaf FQN selects immediately in every mode.
- Segment keys: Enter or ArrowRight (caret at input end) on a group row commits that segment and re-roots; Enter on a leaf row picks; Tab adopts the active row (group: commit and continue; leaf: complete the name, exact-match select) only when the popup is open with text typed in the current session — otherwise Tab is a native focus move; ArrowLeft with an empty filter and the caret at input end backs up one segment; Backspace deleting a trailing `:` un-commits it into an editable filter; a typed `:` is always literal; Esc closes with the text untouched. Full-path search needs no mode key — it is simply the uncommitted state.
- Eligible entry pickers keep entry unblocked with an inline "Create …": shorthand tabs create categories and flow accounts in merchant/counterparty fields, while tag pickers also create tags; Advanced selects existing categories and accounts. Each shorthand tab derives its sole valid intent — Spend and Refund create `expense` categories, Income creates `income` — so intent is never a question at entry. Creation is a final sticky option offering the full typed path whenever it is FQN-valid, matches no active leaf, and violates no client-checkable prefix-free rule; the server remains the validation authority. Drilling before creating namespaces the new leaf under the committed prefix.
- Multi-select pickers keep the committed prefix in the input after each pick so sibling leaves batch; already-picked leaves drop from the list.
- Account pickers filter intelligently by context: only account types valid for the field being edited (e.g. spend funding and income/refund destination → `owned` or `party`, merchant → `flow`, friend share → `party`), derived from the record rules in `docs/accounting-semantics.md`. This is deterministic filtering; invalid subtrees are absent from the popup, not disabled.
- Account picker options show an account's FQN plus `CODE · Single-currency` for a non-`NULL` currency, or `Multi-currency` for `NULL`. This detail describes the account's record constraint; selecting a single-currency account adopts its currency, while selecting a multi-currency account preserves the record currency. The amount stays unchanged.

### Forms, feedback, states

- Forms validate inline on blur; submit errors from the API map to the offending fields; entered data is never lost on error. Entry drafts persist to IndexedDB so an accidental close is recoverable.
- Destructive actions (tombstone deletes) require a confirmation dialog naming the object and the consequence. Successful mutations show a confirmation toast; mutations refresh affected snapshots per the frontend-architecture refresh rules.
- Empty states explain what the screen will show and offer the primary action. Error states show a plain-language message with the machine-readable API error expandable underneath.

## Screen Inventory

Each screen below lists purpose, layout, behavior, primary data sources, and phase.

### 1. Overview (dashboard) — Phase 2

- Purpose: current balances on main accounts at a glance, plus a pulse of recent activity. The landing page.
- Balances: `owned` and `party` accounts grouped by FQN root prefix (`banks`, `cash`, `people`, …), each group listing accounts with name, currency, and current balance; group subtotal as `≈ USD`. `party` groups read as amounts owed to or by the household, never as household funds. Prominent accounts surface on top. Credit cards show balance and, when known, remaining credit against the current limit.
- Month pulse: current-month spend and income totals as plain numbers (no charts; charts arrive with Phase 3 reporting).
- Recent activity: the latest classified transaction lines, linking into Transactions.
- Later phases add net-worth trend, richer summaries (Phase 3), and budget status (Phase 4) — as additions, not a redesign.

### 2. Transactions — Phase 2 (core screen)

- Purpose: scan, search, slice, and edit all activity.
- One list: classified transaction lines from the shared browser — no separate records mode. Rows expand inline to the records subtable with per-record editing.
- Scope: all-time, paginated, newest first (initiated date descending) by default. A date-jump control navigates to any point in history. The page remembers its last position (anchor, filters) and restores it on return.
- Toolbar: search, go-to-day with icon-only day-step buttons, class dropdown, and the Filter toggle; typed filter chips accumulate in the filter bar beneath the toolbar row.
- Inline quick fixes per the uniformity rule; bulk selection and the bulk action bar per Bulk operations.
- Transaction detail (URL-addressable, side panel over the list): class badge, counterparty title, display amounts, lifecycle strip, record table, metadata (source, created). Record rows show only role glyph, Account, Amount, and the full-path Category chip; account paths link to the account's register page and Category keeps its filter behavior. The panel is read-only: no pointer or keyboard path starts an inline editor. Actions: a labeled Edit button in the panel header — the panel's primary action — plus Duplicate, Split, and Delete in the footer bar. Edit, Duplicate, and Split open the transaction editor modal over the panel; the panel stays open beneath it and refreshes after save. The detail view shows everything the summary line truncates or hides. The lifecycle strip directly under the panel header shows `Initiated` plus the civil `initiated_date`, followed only by a lowercase `expected`, `pending`, or `cancelled` status word; a mixed transaction reads pending, while simply posted shows no status word. It never shows lifecycle timestamps, stages, dashes, ranges, or qualifiers. Row activation (click, Enter, or Space; `aria-expanded`) toggles a read-only plain-text per-record disclosure listing the full Initiated/Expected civil date, exact local-time Pending/Posted timestamps, posting status, role, source, tag FQNs, member name, and the untruncated memo — every per-record value is at most one row activation away, and the disclosure never edits. Created stays in metadata.

### 3. Transaction entry — Phase 2

- Surface: one centered modal editor, app-shell-owned and route-independent — the single surface for create, edit, split, and duplicate, opened in place from every entry point with no navigation. Stable stage frame, wide enough for the full journal grid at near-full viewport height; header and submit footer always pinned; the body is the single scroll region; content growth and validation errors never resize or move the frame. The underlying page stays visible behind the scrim and live-updates as entries save.
- Entry points (all open the same modal): page-header "New transaction" everywhere; the app-shell sidebar action; the global new-transaction shortcut; command-palette entry commands and template-name prefills; browser empty-state action; detail-panel and row Edit / Duplicate / Split; "Edit as journal" escalation from expanded records. Opening forces bulk-edit mode off; opening over an active inline-editor draft discards it per the inline-editing rules.
- Template type-ahead start: the modal opens with a smart field — type a template name to prefill everything, or skip past it to a blank form. The palette offers the same entry points.
- Type tabs: Spend, Income, Refund, Transfer, Exchange, Advanced. Shorthand forms render in a centered narrow column; Advanced fills the body width; the frame never changes between tabs.
  - Spend: date, currency, funding account (`owned` or `party`), one or more merchant rows (`flow`, inline-creatable) each with its own amount and category (`expense`), optional tags/member/memo, optional friend-split rows (member or `party` account + share) that produce the transfer support records. The funding amount is the sum of merchant-row amounts and friend-split party shares; multiple merchant rows against one unchanged funding record are the ordinary case, not a split-only affordance.
  - Income: date, amount, destination account (`owned` or `party`), source (`flow`), category (`income`), optional extras.
  - Refund: like income with an `owned` or `party` destination, a merchant counterparty, and an `expense` category, entered as money coming back; the negative counterparty amount is what makes it a refund.
  - Transfer: date, one amount in one currency, from account, to account (`owned` or `party`), optional charge row (`flow` + `expense` category).
  - Exchange: date, from account with the sold amount and currency, to account with the bought amount and currency, optional tags/member/memo. A single-currency account supplies and locks its side's currency; a multi-currency account requires an explicit currency. The effective rate is read-only feedback; Mina supplies the `system:exchange` records, so no counterparty is ever picked.
  - Each tab maps to its shorthand endpoint; when a form's options exceed what a shorthand payload expresses, either the shorthand API is extended or the UI composes the full balanced transaction payload — the user never sees the difference.
- Currency fields are comboboxes over the currencies already present in the data, with free entry for a new code.
- Advanced (full journal editor): a free record grid — account, signed amount, currency, category, tags, member, memo, dates, statuses per row — with a per-currency balance meter pinned to the footer. The category cell is available only on `flow` rows and is blank and inert elsewhere, so the grid states the record rule rather than relying on the user to know it. The footer also shows the server's live read of the draft — derived record roles, transaction shapes, class, and display amount — from the dry-run classify endpoint; the browser never derives classification itself. Save stays disabled until every currency sums to zero; validation errors, including the exchange exclusivity rules, map onto the offending rows.
- Escalation: "Edit as journal" from any tab converts the current form contents into records with nothing lost.
- Create vs edit: create shows all six tabs, "Save and add another" as the default submit (`Cmd+Enter`) plus "Save and close" (`Cmd+Shift+Enter`), sticky fields (date, account, type) carrying into the next entry, the session tally, and the modal rail. Edit/split show "Update transaction" only (closes on success), the fitting shorthand tab plus Advanced, and a "Replacing transaction" footer note; the detail panel stays open beneath the modal and refreshes after save. Editing reopens the shorthand shape when records still fit; "Split" always opens the journal editor with the transaction's records loaded, ready to divide across categories, counterparties, or member/person shares. Duplicate opens the create path prefilled.
- Batch ergonomics: batched entry works from any page. The modal rail (wide screens, create mode) shows THIS SESSION — this sitting's saved entries, each with an Edit action that relaunches it — and RECENT — the launch context's transaction rows captured at open. The rail is read-only and adds no tab stops. Below the rail breakpoint a one-line footer recap of the last save sits beside the session tally. Saves fan out immediately to the visible list behind the modal; deeper recall closes the modal (drafts persist), checks the list, and reopens.
- Deep links: one `?entry=` param valid on every route — `new[:spend|income|refund|transfer|exchange|journal]` (`journal` opens Advanced), `edit:<id>`, `split:<id>`, `duplicate:<id>`. Opening pushes one history entry (browser Back closes); in-app close strips the param; composes with the transaction-detail param; missing ids show the standard error state in the modal body; `new` restores the persisted draft. Bulk-edit mode stays never-URL.
- Close / Esc / drafts / focus: Esc ladder inside the modal — open picker → close it; confirmation dialog open → it handles Esc; otherwise close the modal. Create closes without prompting (per-tab drafts persist to IndexedDB and restore on reopen); edit/split with modifications require the discard confirmation. On close, focus restores to the invoking control, falling back first to the list-region restore target and then to the app-shell New transaction action; initial focus is the template type-ahead (create) or the first field of the active tab (edit).
- Validation: inline on blur; API errors map onto the offending fields/rows; the pinned footer shows the general error strip and, when errors sit off-screen, a compact attention strip that scrolls to and focuses the first offending field. Advanced save stays disabled until every currency balances. Errors never close the modal or lose entered data.
- Responsive: wide screens — centered stage with gutters and the rail; medium — stage without the rail (footer recap); narrow — full-screen takeover with header/footer pinned and the Advanced grid scrolling horizontally inside the body only.

### 4. Account and group pages — Phase 2

- Purpose: one account's (or account group's) activity and standing; the drill-down target from Overview, the balance strip, and Accounts.
- Account page header: FQN path, account type badge, currency mode, labeled flat favorite toggle, current balance and posted-only balance, credit limit with history (when present), external link metadata, hidden marker. Fixed system accounts replace mutation controls with a read-only indicator.
- The currency appears in the header exactly once as a compact chip next to the type badge (sized like it): an ISO/crypto code for single-currency, or `Multi-currency` for `NULL`. Balance figures carry each amount's own currency marker — labels stay plain ("Current", "Posted", "Credit limit") — and the balances block right-aligns with the content edge on wide screens, mirroring the account name's left margin.
- Register: the shared browser in records shape — the account's records with date, transaction counterparty, category, memo, statuses, signed amount, defaulting to newest first. Selecting a record opens the side peek panel showing the full containing transaction; arrow keys walk rows while the panel follows; "Open transaction" jumps to full detail/edit.
- Running balance: a per-record running balance column, shown in date-ordered views in either direction and hidden whenever filters, search, or non-chronological sort would make it misleading.
- Group pages: every non-leaf FQN node is a page — subtotal balances of child `owned` and `party` accounts plus a combined register across the whole prefix (e.g. `banks:Chase:*`), which naturally includes the group's `flow` accounts (fees, interest) per the prefix-grouping semantics.

### 5. Accounts (chart of accounts) — Phase 2

- Purpose: manage the unified chart of accounts and enter registers.
- Layout: tree table grouped by FQN hierarchy; columns: name (path-indented), type badge, currency (ISO/crypto code for single-currency, a clear `Multi-currency` chip for `NULL`), balance (`owned` and `party` accounts), and the trailing actions column. Hidden state renders as the standard eye-off indicator on the row, not as its own wide column. Rows link to account/group pages.
- Row actions (trailing column, per the affordance-class rule): move/rename and delete as button-class actions — delete disabled with an explanatory tooltip when the node cannot be deleted; hide/unhide and featured (star) as persistent flat toggle icons. Leaf and group rows carry the actions that apply to them; fixed system accounts and the `system` group carry none.
- Toolbar: search, type filter, include-hidden toggle. Create/edit in a side panel: FQN, type, explicit single-/multi-currency mode, currency code when single-currency, external id/system, hidden. Edit follows the account-currency transition rules in `docs/accounting-semantics.md`.
- Restructuring: rename a node or move it to a new parent from the tree; the whole subtree follows with an FQN prefix rewrite.
- Credit-limit history for eligible card accounts is managed from the account's edit panel or page header. It is available only for single-currency accounts, and every history value displays in the owning account's currency without a limit-currency field. Until an account has its first credit-limit entry, the section renders as a single "Add credit limit" button; activating it reveals the full credit-limit editor. Any account with existing history exposes its rows and Delete controls even when it is not eligible to add entries. Account currency controls are unavailable with an explanation while active credit-limit history exists and return after the final active row is deleted.
- Accounts with credit-limit history show a small credit-card icon immediately right of the account name — in the name area, never the actions column — in the chart of accounts and on the account page header. The icon is a pure indicator (no press or hover affordance).

### 6. Reference data: Categories, Tags, Members, Templates — Phase 2

- One shared pattern: searchable tree list (flat list for Members) + side-panel editor; include-hidden toggle where applicable; tombstone delete with confirmation; rename/move with subtree rewrite (same restructuring capability as accounts).
- Members and Tags render as compact left-aligned lists with a bounded maximum width instead of stretching a near-single-column table across the viewport; the trailing actions column stays narrow. Categories keeps the wider two-column layout (name + intent badge).
- Row actions follow the accounts affordance philosophy: rows that can be deleted carry a delete quick action in the trailing actions column (always visible per the row-actions rule), disabled with an explanatory tooltip when the listing reports the entity as not deletable; activation opens the standard confirm dialog naming the entity and calls the existing delete endpoint, with API errors surfaced as the fallback. Group-only rows carry no delete while no group delete operation exists. The side-panel editor keeps its delete.
- Category and Tag leaf rows expose featured and hidden flat toggles in the shared fixed trailing slots.
- Every dictionary entity is a drill-down target with its own page embedding the shared browser pre-filtered to it, with the same peek panel:
  - Category and tag pages roll up descendants by default (`Food` includes `Food:Restaurants`), with a "this level only" toggle; hidden descendants stay excluded from the rollup, consistent with hidden entities being excluded from default lists everywhere.
  - Member pages show the transactions attributed to that member through the same shared-browser embedding.
  - Category, tag, and member pages include a `View all transactions` action that opens the Transactions page with the drill-down scope as URL filters.
- Categories: economic-intent badge per row (`expense` or `income`); the editor requires intent and explains its classification effect in one line.
- Templates: template tree with record-default summaries; editor manages the partial record defaults (all optional: account, category, member, currency, amount, tags, memo, statuses); primary row action "Use" opens the transaction editor modal prefilled. Templates are reachable by type-ahead from the entry modal and the command palette.

### 7. Status & Settings — Phase 2

- Status: backend health, database location/schema, background operations (exchange-rate loading, backups) with recent runs and manual trigger buttons.
- Operation navigation: an operation selector drills into a shared runs table showing the common run envelope — paged, newest first; columns: started, finished/duration, outcome, trigger. Selecting a run opens its detail.
- Shared building blocks (selector, envelope runs table, run-detail frame) are common to all operations; each operation type ships a dedicated frontend module owning its run-detail rendering and operation-specific controls through that operation's named concrete APIs. There are no generic fallback renderers.
- Module completeness is enforced statically: the module registry is keyed by the generated operation-id union, so a newly added operation type fails typecheck until its module exists.
- Settings is a server-driven read-only view of the operational configuration loaded for the running process. It renders backend-provided groups, labels, help, active values, and the resolved config-file location without setting-key-specific UI code. Bare indicators beside each label mark non-default values and identify CLI or environment overrides; config-file origin is implicit.
- Status reports whether database encryption is active as a labeled health card; the encrypted state includes a supporting lock icon.
- Configuration is loaded once at startup; this screen does not mutate runtime state, write the config file, or predict values for a later process.
- Browser-local UI preferences remain persisted per `docs/frontend-architecture.md` and do not appear in the server settings manifest; they include table density, default landing screen, and theme selection.

### 8. Recurring occurrences — Phase 2

- Recurring occurrences — confirmed, overdue, and upcoming EXPECTED — render inline in the Transactions page (and register embeddings) by default. The UI explicitly requests expected occurrences even though API listings omit them by default; per `docs/recurring-transactions-semantics.md`, showing them never changes their exclusion from balances, aggregates, and reports.
- Loading a transactions view runs the occurrence API's lazy catch-up materialization so the list always reflects occurrences through today.
- Expected rows carry a distinct visual treatment inline; overdue occurrences (scheduled before today) additionally carry the warning-treatment missed marker per the theme.
- The filter direction is hide-based: a standing toolbar icon toggle — same control family as the Filter toggle, sitting with the standing controls beside the class dropdown — lets the user HIDE expected/recurring rows; there is no opt-in Expected posting-status filter. It is a pressed-state toggle (constant accessible name "Hide expected", state via `aria-pressed`, tooltip naming state and action, glyph shape changing with state so meaning never relies on color) and never a chip-backed filter dimension: clearing the filter bar does not touch it.
- Confirm and Dismiss are row actions on expected rows, per the affordance-class rules: Confirm materializes the transaction immediately with the standard toast; Dismiss sits behind the standard named confirmation dialog. Both surface API errors per the standard feedback rules.
- Confirmed occurrences are ordinary transactions and edit through the transaction editor modal; expected occurrences stay read-only — Confirm and Dismiss are their only actions.
- The `/recurring` page hosts recurring definitions management — the configuration surface for recurring transactions; occurrence review lives inline in Transactions per the rules above.

Definitions management screen:

- Content: one compact table of recurring definitions (shared table rules) — columns: definition (hierarchical FQN path rendering), schedule (human-readable rule summary, e.g. "Every 2 weeks" / "Monthly on the 15th" / "Last day of month"), status (active/paused badge), next (next scheduled date computed from the schedule), amount (definition display amount per the amount rules), and the trailing actions column.
- Row activation opens the definition editor panel — a deliberate management-surface exception to the reference row-activation rule, because a definition has no read-only detail page; the editor is its detail.
- Row actions per the affordance-class rules: Confirm next (button; materializes and posts the next occurrence immediately with the standard toast), Pause/Resume (persistent state toggle), Defer (button, interval schedules only, opens a dialog with the offset defaulting to one cadence interval and user-editable), Edit, and Cancel (destructive, behind the standard named confirmation; tombstones the definition, generated history untouched).
- Editor (side panel, create + edit): FQN, schedule class and fields (interval every-N + unit, or date rule day-of-month/last-day), anchor date, paused state, and the definition's complete balanced record grid reusing the transaction editor modal's journal editor pieces — per-currency balance meter, intent-valid account pickers, no partial shapes. Save creates or fully replaces the definition (version increments; records replaced atomically); API shape errors map onto the offending rows.
- Empty state: a quiet "no recurring definitions" presentation with the New definition action.

### 9. Future screens — guidance only

- Reports (Phase 3): saved searches become named views on the Transactions screen; summary reports follow this document's structural language.
- Budgets (Phase 4): category-tree budget editor plus month status; reuses category path rendering and amount rules.
- Import & reconciliation (Phase 5): an inbox pattern — imported records pending match/confirm; reconciliation indicators specified above become active.

## Shared Component Inventory

Mina-specific building blocks every screen composes (names indicative; placement per frontend package boundaries):

- `TransactionBrowser` — the shared browsing system: transaction shape (expandable transaction lines) and records shape (register rows + peek panel), with filtering, selection, inline editing, and keyboard driving.
- `PeekPanel` — side panel previewing the full containing transaction from a record row.
- `EntryModal` — the centered modal transaction editor: template type-ahead, shorthand tabs, journal editor, session tally, modal rail (session + recent context), create/edit/split/duplicate launches, `?entry=` deep links.
- `CommandPalette` — navigation, entry launcher, transaction search, app actions.
- `BalanceStrip` — always-visible prominent-account balances.
- `AmountText` — signed, tabular, currency-code-aware amount with class-aware emphasis.
- `FqnPath` — de-emphasized-ancestors path renderer with truncation and tooltip.
- `ClassIcon` / `StatusIcon` / `RecordRoleIcon` — narrow icon-encoded class, status, and record-role indicators with tooltips; `ClassBadge` chip form remains for detail headers.
- `CategoryChip`, `TagChip`, `MemberChip` — entity chips that add their entity to the active filters; `AccountTypeBadge`, `IntentBadge` — descriptive indicators.
- `RowActions` — the trailing per-row actions cluster: always-visible icon-button actions plus persistent flat toggle icons, collapsing into a single overflow (⋯) button with a floating panel when the actions cell cannot fit the row's full action cluster.
- `EntityPicker` — hierarchical type-ahead combobox with variants for include-hidden on broader surfaces, hidden-excluding inline transaction editing, inline-create, and context-aware account-type filtering.
- `FilterBar` / `FilterChip` — URL-backed typed filters.
- `PageHelp` — header help icon button revealing a hidden-by-default explanation paragraph.
- `DataTable` — server-driven table shell: sticky header, skeletons, selection, pagination, keyboard row focus.
- `BalanceMeter` — per-currency zero-sum indicator for the journal editor.
- `ConfirmDialog`, `EmptyState`, `BulkActionBar`.

## Accessibility & Quality Bar

- WCAG AA contrast in every theme; visible focus rings; full keyboard operability of tables, pickers, and forms.
- Icon-only controls carry accessible labels and tooltips.
- Semantic markup for tables and forms; modal overlays (dialogs) trap focus and restore it on close; non-modal side peek/detail panels follow the Overlays rule instead of trapping focus.

## How to Use This Document

- Plan one screen at a time: this document's screen spec + `docs/frontend-architecture.md` constraints + the OpenAPI contract define the work.
- The design leads and the API follows: when a screen needs a capability the API lacks, extending the API is part of that screen's implementation plan — the UX is never trimmed to fit existing endpoints, and the UI never computes accounting truths client-side as a workaround.
- Track concrete backend/API requirements in Kata issues, `api/openapi.yaml`, or active implementation plans; do not use this UX document as an API backlog.
- Reuse the shared component inventory before inventing new patterns; extend this document first when a new pattern is genuinely needed.
- Anything ambiguous here is decided in favor of: truth-first, progressive disclosure, keyboard speed, and simplicity.
