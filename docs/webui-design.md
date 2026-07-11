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

- Transaction line: one row per transaction showing the server-derived transaction class and display amount per `docs/accounting-semantics.md`. This is the default everywhere. Multi-part classes carry their amounts directly on the line, and lines stay single-height (transfer: moved amount plus attached fee; exchange: the sold-side amount only, with the bought side one expansion away; mixed: compact component amounts with no synthetic total) — there is no separate component-summary view between the line and the records.
- Journal records: the full balanced record table with accounts, signed amounts, categories, tags, members, statuses, and dates. One expansion away, always editable.

Entry mirrors display:

- Shorthand forms (spend, income, refund, transfer) are the default entry path, backed by the shorthand REST endpoints.
- The full journal editor is always one action away ("Edit as journal"). Escalation preserves everything already entered.
- Editing an existing transaction reopens the shorthand shape when its records still fit that shape; otherwise it opens the full editor.

Hard rule: the UI never re-derives accounting truths client-side. Transaction class, component summaries, display amounts, and balances are server-derived values; the UI renders them.

### One shared browser

There is exactly one transactions/records browsing system, built once and embedded everywhere:

- On the Transactions page it lists classified transaction lines that expand inline to journal records.
- On account, group, category, tag, and member pages it appears pre-filtered to that entity. Account and group registers are the one-sided records view — the only true records-only presentation.
- Record rows in registers use a side peek panel to preview the full containing transaction without leaving the list.
- Filtering, sorting, selection, inline editing, keyboard driving, and the peek panel behave identically in every embedding.

There are no separate "transaction mode" and "record mode" screens; context determines which shape the shared browser renders.

## Layout & Structure

Structure and navigation only; how any of it looks is owned by the theme specification.

- Fixed left sidebar navigation, collapsible to an icon rail. Sections: Overview, Transactions, Accounts, then a Reference group (Categories, Tags, Members, Templates), then Status/Settings pinned at the bottom.
- A compact balance strip of featured accounts is visible from every screen (in or adjacent to the sidebar). Featured is a backend account metadata flag in portable state; strip entries link to account pages.
- A prominent "New transaction" action is available from every screen, alongside the command palette.
- Content area is fluid; data tables may use the full content width.
- Every page uses one header pattern: title (with optional breadcrumb for detail pages) on the left, primary actions on the right, filter/toolbar row beneath when applicable.
- Pages carry no standing description text. Each page header includes a small help icon button that reveals a short explanatory paragraph on demand (popover or collapsible); the explanation is hidden by default.
- Overlays: side peek panels for previews, the docked entry panel for transaction entry, centered dialogs only for confirmations.
- Side peek/detail panels are non-modal: no backdrop, no focus trap, no modal semantics; the underlying list stays interactive so row navigation can drive the panel. `Esc` closes the panel and returns focus to the originating row. Clicking outside the panel also closes it — the click still performs its normal action on the underlying content (a click that opens another record simply moves the panel). The docked entry panel never closes on outside interaction. Centered dialogs are modal and trap focus.
- Table density (comfortable/compact) is a persisted UI preference.

## Command Palette

A launcher-style command palette (VS Code / Spotlight pattern) is a core Phase 2 surface, available everywhere via a global shortcut. It serves:

- Navigation: jump to any page and any entity page by typed name — accounts, groups, categories, tags, members, templates.
- Entry: "new spend / income / refund / transfer" commands; typing a template name starts a prefilled entry.
- Transaction search: free-text search across transactions/records (memo, counterparty); results open the transaction peek/detail directly.
- App actions: trigger backup, reload exchange rates, toggle density, open settings.

## Theme-Agnostic Presentation Rules

Rules every theme must satisfy:

- Meaning is never carried by color alone; signs, labels, and badges always accompany it.
- Money semantics stay visually distinct: money entering the household (income, refund) reads differently from spend; ordinary spend never reads as an error or alarm; error/destructive treatment is reserved for errors and destructive actions, not for negative amounts.
- Each transaction class has a distinguishable badge treatment.
- Monetary amounts use tabular numerals and right-align in tables.
- Loading uses skeletons shaped like the final content, never centered spinners; previous data stays visible while refetching; loading causes no layout shift.
- Motion is functional, not decorative; `prefers-reduced-motion` is respected.
- Icons accompany labels; controls are never icon-only except in the collapsed rail and table row actions with tooltips.
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
- Display amounts per transaction class follow the display table in `docs/accounting-semantics.md`: spend negative, income/refund positive, transfer/exchange neutral with movement amounts shown separately, mixed shows component amounts and no synthetic total.

### Balances

- A displayed account balance includes posted and pending records; expected and cancelled records are excluded. Account pages additionally show a posted-only figure.
- Balance semantics follow account type per `docs/accounting-semantics.md`: only `balance` accounts surface balances as household state; `flow` and `system` accounts never appear in balance views.

### Hierarchical names (accounts, categories, tags, templates)

- FQNs render as a segmented path: ancestor segments de-emphasized, leaf segment emphasized, e.g. `banks:Chase:` (de-emphasized) `Joint` (emphasized).
- Dense table cells (transaction lines) show only the leaf name, with the full FQN path on hover/tooltip. Registers, page headers, trees, and pickers use the segmented-path rendering.
- On overflow, truncate middle segments (`banks:…:Joint`); the full path is always available in a tooltip.
- Pickers and trees indent by level and group by parent; typing searches across the full path, not just the leaf.

### Transaction summary line

- Simple two-sided transactions title as `From → To` using the leaf names of both sides: spend → `Joint → TraderJoes` (funding → merchant); income → `AcmePayroll → Joint` (source → destination); refund → `Target → Joint`; transfer → `Joint → Emergency`; exchange → `USD → EUR`; adjustment → affected account leaf. Complex/mixed transactions fall back to memo or the dominant counterparty leaf. Titles are derived server-side or from records as a display convention.
- Row composition: class icon, initiated date, status marker, description (the `From → To` line) with the memo as a truncated second line (full memo in a tooltip), category, tags, member, display amount, and the trailing actions column (open detail). The description column header reads "Description".
- Class is encoded as a distinct icon plus its class color in a narrow leftmost column, with the class name in a tooltip; that column's header is hidden except on very wide screens.
- The date cell is compact: the day (`May 31`) with the year as a de-emphasized second line on every row.
- The status marker is a very narrow, headerless column tight after the date: a marker icon (e.g. clock for pending) with a tooltip appears only when the transaction is not simply posted; posted rows show nothing.
- Lifted record values (category, tags, member, status) follow the uniformity display rule: identical across all active records → show the value; differing → show a "Mixed" sentinel indicator.
- Member uniformity ignores unattributed records (counterparty/flow records rarely carry attribution): exactly one distinct member among attributed records → show it; none attributed → blank (whole-household); multiple distinct → Mixed.
- The memo second line shows the memo when it is uniform across active records (ignoring empty memos); differing memos omit the second line — never a "Mixed" sentinel as prose. When a mixed-class title already falls back to the memo, the second line is omitted.
- Tag chips in lines render at the micro size, showing tag leaf names only, filling up to two chip rows within the standard row height; tags that still do not fit collapse into an overflow indicator chip. Tags never increase row height; the transaction detail view shows the complete set.

### Entity chips

- Category, tag, and member values render as entity chips wherever they appear in transaction lines and detail views.
- Every entity chip is a filter affordance: activating it adds that entity to the embedding browser's active filters, appearing as a removable typed filter chip in the filter bar — slicing continues in place, preserving list context. In the detail/peek panel, chip activation filters the underlying list. In embeddings without a filter bar (e.g. Overview recent activity), chip activation opens Transactions with that filter applied.
- Chips never navigate to entity pages (those stay reachable by name via the command palette and entity lists) and never start inline editing — editing has its own affordance per the inline-editing rule.
- Entity chips read as one family and stay visually distinct from indicators and actions per the affordance-class rule; non-entity chip-shaped rendering (e.g. amounts) must not read as interactive.

### Dates and statuses

- Lists show `initiated_date` as absolute dates: `Jun 30` in the current year, `Jun 30, 2025` otherwise. No relative dates in tables.
- All dates and times display in the browser's local timezone. Civil-date logic — entry default "today", current-year formatting, date grouping and comparisons — uses local time, never UTC calendar dates. Civil dates stay date-only in storage; timestamp fields stay UTC.
- Expected and pending records/transactions carry visible status indicators and de-emphasized amounts; posted needs no marker; cancelled renders struck-through and de-emphasized. In transaction lines the status column is icon-encoded with a tooltip.
- Unreconciled records show a small status indicator (reserved for Phase 5 import workflows; hidden until relevant data exists).

### Hidden entities and members

- Hidden accounts, categories, and tags are excluded from pickers and default lists everywhere. Pickers and filter menus offer an explicit "Include hidden" toggle; hidden items render with an eye-off icon.
- No member attribution means whole-household and renders as nothing. Attributed records show a small member initials chip.

## Interaction Rules

### Keyboard

- Keyboard-complete tables: up/down moves row focus, expand/collapse, open peek, start inline edit, toggle selection — batch review sessions never need the mouse.
- Global shortcuts: open command palette, new transaction, focus list search, `Esc` closes overlays, `Cmd+Enter` submits forms, arrows + `Enter` drive pickers.

### Tables and filtering

- Server-driven pagination/sort/filter, sticky header, right-aligned numeric columns, whole-row affordances for expand/peek (a plain disclosure indicator, not a per-row button), leading checkbox column only once bulk actions exist.
- Per-row actions live in one narrow trailing actions column — always the rightmost column, in every table — never mid-row. Button-class actions render as compact icon buttons with tooltips, revealed on row hover and row focus (keyboard reaches them through row focus). State toggles stay persistently visible because they carry state. Actions never collapse into an overflow menu for count reasons; only the narrow-screen column-collapse rule folds them.
- Stable column layout: fixed percentage-based column widths so columns never shift when paging or when row content changes.
- When horizontal space runs out, columns collapse by priority instead of showing a horizontal scrollbar: member first, then the status marker, then row actions fold into a single overflow (⋯) menu, then tags, then category.
- Pagination shows "Page X of Y" from server-provided total counts.
- Moving between pages keeps the current rows visible until the next page arrives — no skeleton flash or flicker for uncached pages (skeletons are for first load only).
- The browser fills the available viewport height: the table body flexes and the pagination footer sits at a small, consistent inset from the viewport bottom, matching the sidebar's bottom-control inset so the two bottom edges align.
- Shareable state: filters, search text, sort, and list position live in the URL (per `docs/frontend-architecture.md`). Detail pages are URL-addressable. Sidebar navigation returns to a page's last-used state.
- Filter bar pattern: a free-text search input plus an "Add filter" menu producing removable typed filter chips. Filter dimensions: account, category, tag, member, amount range, date range (initiated/pending/posted), posting status, reconciliation status, transaction class.

### Inline editing — the uniformity rule

Transaction-level values are editable in place only when the edit maps mechanically onto records:

- Category, tags, member: editable on the transaction row only when the value is identical across all active records; the edit applies to all of them.
- Amount: editable on the transaction row only for simple shapes (minimal two-sided single-currency spend/income/refund/transfer) where the change derives mechanically to both records.
- Everything else is edited per-record in the expanded records view, or through the full form.
- Inline editors are the shared pickers: category search popup, tag search with multi-select, member popup, account picker with context-aware type filtering.
- Inline editing has its own trigger, separate from chip activation: the keyboard edit action on the focused cell, or a hover-revealed edit control on editable cells. Activating an entity chip always filters, never edits.

### Bulk operations

- Selection happens at the transaction level in the shared browser; selecting rows raises a floating action bar (categorize, tag, member) mapped to the record bulk endpoints.
- The uniformity rule applies: a bulk edit targets only transactions whose records are uniform for that field. Non-qualifying selected transactions are skipped and reported in the result toast ("12 updated, 2 skipped: mixed records"). Complex transactions that cannot be mapped mechanically to a uniform record edit are skipped.
- Record-level bulk (account reassignment, status changes) is available in account registers where records are the row unit.

### Pickers

- Entity pickers are type-ahead comboboxes over hierarchical data, searching full FQN paths, with inline "Create …" for categories, tags, and flow (merchant/counterparty) accounts so entry is never blocked by missing reference data.
- Account pickers filter intelligently by context: only account types valid for the field being edited (e.g. funding → `balance`, merchant → `flow`), derived from the intent shape rules in `docs/accounting-semantics.md`. This is deterministic filtering, never record-role guessing.

### Forms, feedback, states

- Forms validate inline on blur; submit errors from the API map to the offending fields; entered data is never lost on error. Entry drafts persist to IndexedDB so an accidental close is recoverable.
- Destructive actions (tombstone deletes) require a confirmation dialog naming the object and the consequence. Successful mutations show a confirmation toast; mutations refresh affected snapshots per the frontend-architecture refresh rules.
- Empty states explain what the screen will show and offer the primary action. Error states show a plain-language message with the machine-readable API error expandable underneath.

## Screen Inventory

Each screen below lists purpose, layout, behavior, primary data sources, and phase.

### 1. Overview (dashboard) — Phase 2

- Purpose: current balances on main accounts at a glance, plus a pulse of recent activity. The landing page.
- Balances: `balance`-type accounts grouped by FQN root prefix (`banks`, `cash`, `people`, …), each group listing accounts with name, currency, and current balance; group subtotal as `≈ USD`. Prominent accounts surface on top. Credit cards show balance and, when known, remaining credit against the current limit.
- Month pulse: current-month spend and income totals as plain numbers (no charts; charts arrive with Phase 3 reporting).
- Recent activity: the latest classified transaction lines, linking into Transactions.
- Later phases add net-worth trend, richer summaries (Phase 3), and budget status (Phase 4) — as additions, not a redesign.

### 2. Transactions — Phase 2 (core screen)

- Purpose: scan, search, slice, and edit all activity; home of batched entry.
- One list: classified transaction lines from the shared browser — no separate records mode. Rows expand inline to the records subtable with per-record editing.
- Scope: all-time, paginated, newest first (initiated date descending) by default. A date-jump control navigates to any point in history. The page remembers its last position (anchor, filters) and restores it on return.
- Toolbar: search, filter chips, date jump.
- Inline quick fixes per the uniformity rule; bulk selection and the bulk action bar per Bulk operations.
- Transaction detail (URL-addressable, side panel over the list): class badge, counterparty title, display amount, initiated date, full record table, metadata (source, created), actions: Edit, Duplicate, Delete, Split. The detail view shows everything the summary line truncates or hides: complete tag sets, full memos, and all per-record values.

### 3. Transaction entry — Phase 2

- Surface: a docked, non-modal entry panel — the transactions list stays visible and live-updates as entries save, because batched entry constantly references what is already entered. Opened from anywhere (global shortcut, palette, "New transaction"); its home context is the Transactions page.
- Template type-ahead start: the panel opens with a smart field — type a template name to prefill everything, or skip past it to a blank form. The palette offers the same entry points.
- Type tabs: Spend, Income, Refund, Transfer, Advanced.
  - Spend: date, amount+currency, funding account (`balance`), merchant (`flow`, inline-creatable), category (expense/fee intent), optional tags/member/memo, optional friend-split rows (member or person balance account + share) that produce the transfer support records.
  - Income: date, amount, destination account, source (`flow`), category (income intent), optional extras.
  - Refund: like income with a merchant counterparty and refund-intent category.
  - Transfer: date, amount, from account, to account, optional attached fee row.
  - Each tab maps to its shorthand endpoint; when a form's options exceed what a shorthand payload expresses, either the shorthand API is extended or the UI composes the full balanced transaction payload — the user never sees the difference.
- Batch ergonomics: "Save and add another" is the default submit; sticky fields (date, account, type) carry into the next entry; a running tally of this session's entries shows in the panel.
- Currency fields are comboboxes over the currencies already present in the data, with free entry for a new code.
- Advanced (full journal editor): a free record grid — account, signed amount, currency, category, tags, member, memo, dates, statuses per row — with a per-currency balance meter pinned to the footer. No client-side record-role inference: the split of an existing record is inherently ambiguous (merchant side vs. funding side), so the grid stays free-form. The only guidance is deterministic: account pickers filter to intent-valid account types once a row has a category. Save stays disabled until every currency sums to zero; API shape-validation errors map onto the offending rows.
- Escalation: "Edit as journal" from any tab converts the current form contents into records with nothing lost.
- Splitting: from a saved transaction, "Split" opens the journal editor with its records loaded, ready to divide across categories, counterparties, or member/person shares.

### 4. Account and group pages — Phase 2

- Purpose: one account's (or account group's) activity and standing; the drill-down target from Overview, the balance strip, and Accounts.
- Account page header: FQN path, account type badge, currency, current balance and posted-only balance, credit limit with history (when present), external link metadata, hidden marker.
- The currency appears in the header exactly once as a compact chip next to the type badge (sized like it); balance figures carry the currency only as the amount's own marker — labels stay plain ("Current", "Posted", "Credit limit") — and the balances block right-aligns with the content edge on wide screens, mirroring the account name's left margin.
- Register: the shared browser in records shape — the account's records with date, transaction counterparty, category, memo, statuses, signed amount. Selecting a record opens the side peek panel showing the full containing transaction; arrow keys walk rows while the panel follows; "Open transaction" jumps to full detail/edit.
- Running balance: a per-record running balance column, shown only in the default chronological view and hidden whenever filters, search, or non-chronological sort would make it misleading.
- Group pages: every non-leaf FQN node is a page — subtotal balances of child `balance` accounts plus a combined register across the whole prefix (e.g. `banks:Chase:*`), which naturally includes the group's `flow` accounts (fees, interest) per the prefix-grouping semantics.

### 5. Accounts (chart of accounts) — Phase 2

- Purpose: manage the unified chart of accounts and enter registers.
- Layout: tree table grouped by FQN hierarchy; columns: name (path-indented), type badge, currency (ISO code), balance (`balance` accounts), and the trailing actions column. Hidden state renders as the standard eye-off indicator on the row, not as its own wide column. Rows link to account/group pages.
- Row actions (trailing column, per the affordance-class rule): move/rename and delete as button-class actions — delete disabled with an explanatory tooltip when the node cannot be deleted; hide/unhide and featured (star) as persistent flat toggle icons. Leaf and group rows carry the actions that apply to them.
- Toolbar: search, type filter, include-hidden toggle. Create/edit in a side panel: FQN, type, currency, external id/system, hidden.
- Restructuring: rename a node or move it to a new parent from the tree; the whole subtree follows with an FQN prefix rewrite.
- Credit-limit history for card accounts is managed from the account's edit panel or page header.

### 6. Reference data: Categories, Tags, Members, Templates — Phase 2

- One shared pattern: searchable tree list (flat list for Members) + side-panel editor; include-hidden toggle where applicable; tombstone delete with confirmation; rename/move with subtree rewrite (same restructuring capability as accounts).
- Every dictionary entity is a drill-down target with its own page embedding the shared browser pre-filtered to it, with the same peek panel:
  - Category and tag pages roll up descendants by default (`Food` includes `Food:Restaurants`), with a "this level only" toggle.
  - Member pages list the records attributed to that member.
- Categories: economic-intent badge per row; the editor requires intent and explains its classification effect in one line.
- Templates: template tree with record-default summaries; editor manages the partial record defaults (category required; account, member, currency, amount, tags, memo, statuses optional); primary row action "Use" opens the entry panel prefilled. Templates are reachable by type-ahead from the entry panel and the command palette.

### 7. Status & Settings — Phase 2

- Status: backend health, database location/schema, background operations (exchange-rate loading, backups) with recent runs and manual trigger buttons.
- Settings (UI preferences, persisted per frontend-architecture): table density, default landing screen, theme selection (when themes ship).

### 8. Future screens — guidance only

- Recurring transactions (Phase 2, future screen): scheduling, review, and generated-transaction rules follow `docs/recurring-transactions-semantics.md`; screen behavior remains out of scope here until a recurring UI screen is planned.
- Reports (Phase 3): saved searches become named views on the Transactions screen; summary reports follow this document's structural language.
- Budgets (Phase 4): category-tree budget editor plus month status; reuses category path rendering and amount rules.
- Import & reconciliation (Phase 5): an inbox pattern — imported records pending match/confirm; reconciliation indicators specified above become active.

## Shared Component Inventory

Mina-specific building blocks every screen composes (names indicative; placement per frontend package boundaries):

- `TransactionBrowser` — the shared browsing system: transaction shape (expandable transaction lines) and records shape (register rows + peek panel), with filtering, selection, inline editing, and keyboard driving.
- `PeekPanel` — side panel previewing the full containing transaction from a record row.
- `EntryPanel` — docked non-modal entry surface: template type-ahead, shorthand tabs, journal editor, session tally.
- `CommandPalette` — navigation, entry launcher, transaction search, app actions.
- `BalanceStrip` — always-visible prominent-account balances.
- `AmountText` — signed, tabular, currency-code-aware amount with class-aware emphasis.
- `FqnPath` — de-emphasized-ancestors path renderer with truncation and tooltip.
- `ClassIcon` / `StatusIcon` — narrow icon-encoded class and status indicators with tooltips; `ClassBadge` chip form remains for detail headers.
- `CategoryChip`, `TagChip`, `MemberChip` — entity chips that add their entity to the active filters; `AccountTypeBadge`, `IntentBadge` — descriptive indicators.
- `RowActions` — the trailing per-row actions cluster: hover/focus-revealed icon-button actions plus persistent flat toggle icons, folding into an overflow menu per the column-collapse rule.
- `EntityPicker` — hierarchical type-ahead combobox with include-hidden, inline-create, and context-aware account-type filtering variants.
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
