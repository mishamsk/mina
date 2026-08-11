# Mina Web UI Design

This document is the ground truth for the Mina web UI user experience: product stance, page content, structure, interaction rules, domain display rules, and the screen inventory. Implementation plans for individual screens must follow this document.

Ownership boundaries:

- `docs/frontend-architecture.md` owns technical architecture, package boundaries, and data-access rules.
- `docs/accounting-semantics.md` owns transaction classification and display-amount derivation.
- `docs/hierarchy-semantics.md` owns group/leaf hierarchy semantics, invariants, and restructuring rules.
- `SCOPE.md` owns durable product boundaries; Kata owns planned work and sequencing.
- `api/openapi.yaml` owns API contracts.
- Visual styling — themes, color palettes, typography, spacing values, radii, motion aesthetics, iconography — is out of scope and owned by theme specifications; the base theme is `docs/webui-theme-arcade-cabinet.md`. This document stays theme-agnostic, so structure and behavior must not depend on any one visual style.

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

Every transaction surface presents exactly two layers.

- Transaction line: one row per transaction showing the server-derived transaction class and display amount per `docs/accounting-semantics.md`. This is the default everywhere. Multi-part transactions stay single-height (transfer: the moved amount; exchange: the sold-side amount only; more than one shape: one identifiable primary amount or none plus a bare `+` more-parts indicator, with complete amounts in detail and never a synthetic total) — there is no separate shape-summary view between the line and the records.
- Transaction detail: the read-only full balanced record table with accounts, signed amounts, categories, tags, members, statuses, and dates. Row activation opens this URL-addressable side panel; structural editing is an explicit detail or row action through the full transaction editor.

Entry mirrors display:

- Shorthand forms (spend, income, refund, transfer, exchange) are the default entry path, backed by the shorthand REST endpoints.
- The full journal editor is always one action away ("Edit as journal"). Escalation preserves everything already entered.
- Editing an existing transaction reopens the shorthand shape when its records still fit that shape; otherwise it opens the full editor.

Hard rule: the UI never re-derives accounting truths client-side. Transaction class, transaction shapes, record roles, display amounts, and balances are server-derived values; the UI renders them.

### One shared transaction presentation

There is exactly one transaction-line and table vocabulary, built once and reused everywhere:

- On the Transactions page it lists classified transaction lines that open read-only transaction detail.
- On account and group pages it appears pre-filtered to that entity. Account and group registers are the one-sided records view — the only true records-only presentation.
- Category and tag overviews use its fixed, read-only transaction-table variant, then link to the full Transactions browser with the same scope; `docs/household-flow-reporting.md` owns report semantics. Member drill-downs retain the full filtered browser.
- Record rows in registers use a side peek panel to preview the full containing transaction without leaving the list.
- Full browser embeddings share filtering, sorting, transaction Edit mode, keyboard driving, and detail/peek behavior. Fixed report previews reuse row and detail behavior without browser controls.

There are no separate "transaction mode" and "record mode" screens; context determines which shape the shared browser renders.

## Layout & Structure

Structure and navigation only; how any of it looks is owned by the theme specification.

- Fixed left sidebar navigation, collapsible to an icon rail. Sections: Overview, Transactions, Recurring, Accounts, then a Reference group (Categories, Tags, Members, Templates), then Status/Settings pinned at the bottom.
- A compact balance strip of featured accounts is visible from every screen (in or adjacent to the sidebar). Entries use account display labels with full-FQN tooltips and link to account pages; featured is a backend account metadata flag in portable state.
- Generic "New transaction" buttons appear only in the Transactions page header and its empty state; the global `n` shortcut and command-palette entry commands remain available from every screen.
- Content area is fluid; data tables may use the full content width.
- Every page uses one header pattern: title (with optional breadcrumb for detail pages) on the left, primary actions on the right, filter/toolbar row beneath when applicable.
- Pages carry no standing description text. Each page header includes a small help icon button that reveals a short explanatory paragraph on demand (popover or collapsible); the explanation is hidden by default.
- Overlays: side peek panels for previews, the transaction editor modal for all transaction create/edit/split/duplicate, the template editor modal for template create/edit/capture, and centered dialogs only for confirmations.
- Side peek/detail panels are non-modal: no backdrop, no focus trap, no modal semantics; the underlying list stays interactive so row navigation can drive the panel. `Esc` closes the panel and returns focus to the originating row. Clicking outside the panel also closes it — the click still performs its normal action on the underlying content (a click that opens another record simply moves the panel). Transaction and template editor modals are true modals: focus traps, focus restoration to invokers, and no outside-interaction close; backdrop clicks are absorbed with a one-step outline flash and never activate underlying content. Centered dialogs remain modal and trap focus.
- Table density (comfortable/compact) is a persisted UI preference.

## Authentication

- Browser startup checks public authentication status before rendering the app shell. When authentication is disabled, the shell opens unchanged.
- When authentication is enabled without a valid session, a focused login screen requests email and password; failures stay inline and clear the password field.
- A successful login opens the normal shell and survives reload through the server-owned session cookie.
- Authenticated shells expose a global Log out action at the bottom of the sidebar. Logout replaces the shell with login when authentication remains enabled; if authentication becomes disabled, the shell stays visible without the logout action. Any protected-request `401` replaces the shell with login.

## Command Palette

A launcher-style command palette (VS Code / Spotlight pattern) is available everywhere via a global shortcut. It serves:

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
- Shared transaction tables default to their native display amount and offer a page-local native/USD toolbar toggle; USD mode replaces each native chip with its server-derived USD chip or an accessible `N/A`, while more-parts rows keep their existing `+` fallback. Edit mode always shows authoritative native amount inputs and restores the selected browse mode on exit.
- Display amounts per transaction class follow the class table in `docs/accounting-semantics.md`: spend/clawback negative, income/refund positive, transfer/exchange neutral with movement amounts shown separately. A compact transaction line with more than one shape shows one identifiable primary amount or none plus a bare, non-focusable `+` more-parts indicator; complete amounts stay in detail and delete confirmation, and no synthetic total is shown. Exchanges also show the server-derived effective rate wherever both sides are visible — transaction detail, the account register peek, and the entry form — formatted as a rate with its currency pair and never recomputed in the browser.
- Full transaction detail always stacks a USD chip or `N/A` beneath each non-USD display amount; USD-native amounts remain single-chip. Account-register peeks remain native-only.

### Balances

- A displayed account balance includes posted and pending records; expected and cancelled records are excluded. Account pages additionally show a posted-only figure.
- Accounts with a current effective credit limit use the server-derived remaining credit as their primary standing in the featured-account strip, Overview leaves, Accounts tree, and account page. The account page leads with `Remaining credit` and retains `Full balance`, `Posted balance`, and `Credit limit`; accounts without a current limit retain their existing balance labels and values. Group balance rows and USD subtotals remain signed accounting aggregates and never sum remaining credit.
- Balance semantics follow account type per `docs/accounting-semantics.md`: `owned` and `party` accounts surface balances as household state, presented as separate groupings; `flow` and `system` accounts never appear in balance views.

### Hierarchical names (accounts, categories, tags, templates)

- FQNs render as a segmented path in hierarchy and choice controls: ancestor segments de-emphasized, leaf segment emphasized, e.g. `banks:Chase:` (de-emphasized) `Joint` (emphasized).
- Contextual account mentions use the REST-provided effective display label with the full FQN on hover/tooltip. This includes transaction records and titles, registers, account headers, account-group balance rows, Overview, and featured balances; the Accounts tree uses the chart-specific FQN-first presentation below.
- Account trees remain grouped, searched, and sorted by FQN; group rows and account pickers, filters, editors, restructure controls, and navigation autocomplete render and match FQNs.
- On overflow, truncate middle segments (`banks:…:Joint`); the full path is always available in a tooltip.
- Pickers and trees indent by level and group by parent; typing searches across the full FQN, not the display label.
- In the transaction detail panel and account-register peek, each record's account display label is a single link opening that account's register page. Account-name links navigate: they never filter and never start editing (the mirror of "chips never navigate"); activation never toggles the row's record disclosure. Records reference concrete accounts, so the destination is always an account page, never a group page. An unresolvable account renders as plain text.

### Transaction summary line

- Simple two-sided transactions title as `From → To` using effective account display labels: spend → `Chase:Joint → merchant:TraderJoes` (funding → merchant); income → `Acme:salary → Chase:Joint` (source → destination); refund → `merchant:Target → Chase:Joint`; transfer → `Chase:Joint → Ally:Emergency`; exchange → `USD → EUR`; adjustment → affected account label. Complex/mixed transactions fall back to memo or the dominant counterparty label. Titles are derived server-side.
- Row composition: class icon, initiated date, description (the `From → To` line) with the memo as a truncated second line (full memo in a tooltip) and trailing status indicators, category, tags, member, display amount, and the trailing explicit transaction-actions column. The description column header reads "Description".
- Class is encoded as a distinct icon plus its class color in a narrow leftmost column, with the class name in a tooltip; that column's header is hidden except on very wide screens.
- The date cell is compact: the day (`May 31`) with the year as a de-emphasized second line on every row.
- Expected and cancelled lifecycle indicators take precedence over settlement; active pending and mixed-settlement indicators trail the description text with distinct glyphs, tooltips, and accessible names. Posted and no-balance active rows show nothing, and indicators never change row height.
- Lifted record values (category, tags, member, status) follow the uniformity display rule: identical across all active records → show the value; differing → show a "Mixed" sentinel indicator. Category lifts over categorized records only, so an uncategorized funding record never makes a single-category transaction read as "Mixed"; a transaction with no categorized record shows no category.
- Member uniformity ignores unattributed records (counterparty/flow records rarely carry attribution): exactly one distinct member among attributed records → show it; none attributed → blank (whole-household); multiple distinct → Mixed.
- The memo second line shows the memo when it is uniform across active records (ignoring empty memos); differing memos omit the second line — never a "Mixed" sentinel as prose. When a mixed-class title already falls back to the memo, the second line is omitted.
- Tag chips in lines render at the micro size, showing tag leaf names only, filling up to two chip rows within the standard row height; tags that still do not fit collapse into an overflow indicator chip. Tags never increase row height; the transaction detail view shows the complete set.

### Entity chips

- Category, tag, and member values render as entity chips wherever they appear in transaction lines and detail views, except in the transaction detail's per-record disclosure, where values render as plain undecorated text.
- In browse and read-only surfaces, every entity chip is a filter affordance: activating it adds that entity to the embedding browser's active filters, appearing as a removable typed filter chip in the filter bar — slicing continues in place, preserving list context. In the detail/peek panel, chip activation filters the underlying list. In embeddings without a filter bar (e.g. Overview recent activity), chip activation opens Transactions with that filter applied.
- Chips never navigate to entity pages (those stay reachable by name via the command palette and entity lists) and never start editing. Browse-mode chips filter; Edit-mode transaction chips are inert because the dock owns quick changes.
- Entity chips read as one family and stay visually distinct from indicators and actions per the affordance-class rule; non-entity chip-shaped rendering (e.g. amounts) must not read as interactive.

### Dates and statuses

- Lists show `initiated_date` as absolute dates: `Jun 30` in the current year, `Jun 30, 2025` otherwise. No relative dates in tables.
- All dates and times display in the browser's local timezone. Civil-date logic — entry default "today", current-year formatting, date grouping and comparisons — uses local time, never UTC calendar dates. Civil dates stay date-only in storage; timestamp fields stay UTC.
- Expected transactions and active pending balance records carry visible indicators and de-emphasized amounts; posted needs no marker; cancelled transactions render struck-through and de-emphasized. Mixed settlement is a transaction-level indicator, and active transactions without balance records carry no settlement marker.

### Hidden entities and members

- Hidden accounts, categories, and tags are excluded from pickers and default lists everywhere. Broader pickers, filter menus, and Edit-mode dock pickers offer an explicit "Include hidden" toggle. Inline entry and template editors omit the toggle; the template editor retains active hidden defaults already selected but does not offer them as fresh choices. Hidden items render with an eye-off icon.
- No member attribution means whole-household and renders as nothing. Attributed records show a small member initials chip.

## Interaction Rules

### Keyboard

- Keyboard-complete tables: up/down moves row focus; in the transactions browser click, Enter, and Space open detail in browse mode and toggle selection in Edit mode; open detail/peek, Edit-mode selection, dock editing, and eligible amount editing stay keyboard-driven — batch review sessions never need the mouse.
- Global shortcuts: open command palette, new transaction (opens the transaction editor modal in place on any screen), focus list search, `Esc` closes overlays, `Cmd+Enter` submits forms, `Cmd+Shift+Enter` saves and closes in the entry modal, arrows + `Enter` drive pickers; hierarchical pickers add segment completion per Pickers — Tab/ArrowRight commit a segment, ArrowLeft/Backspace back out.
- Toggling Edit mode is available from the toolbar and the command palette; in-mode selection keys follow Edit mode.

### Tables and filtering

- Server-driven pagination/sort/filter, sticky header, right-aligned numeric columns, and whole-row affordances for detail/peek — no per-row disclosure control or reserved indicator column; the row itself is the affordance. Transaction lines gain a leading checkbox column only in Edit mode.
- Per-row actions live in one narrow trailing actions column — always the rightmost column, in every table — never mid-row. Button-class actions render as compact icon buttons with tooltips and are always visible: no hover- or focus-reveal semantics anywhere. State toggles stay persistently visible because they carry state. Fit decides presentation, never count: when the actions cell fits the full action cluster it shows all buttons; when it cannot, the cluster collapses into a single overflow (⋯) button that opens a floating panel with all actions — by the column-collapse priority in the transactions browser, and per row in reference tables.
- Tables render no Actions column header; the actions column is right-padded so its trailing margin matches the table's leading padding.
- Reference/dictionary row activation (click, Enter, or Space) opens the row's read-only destination: Account leaves and groups open their register, Category and Tag leaves and groups open their drill-down report, and Members open their drill-down page. Rows without a destination do not activate. Edit is a compact trailing row action with a tooltip; all action buttons stop row-activation propagation. In transaction browsers, transaction row activation opens its read-only detail in browse mode, closes it when that row is already active, and switches it directly when another row is active; Edit mode instead toggles selection and makes trailing actions unavailable.
- Stable column layout: fixed percentage-based column widths so columns never shift when paging or when row content changes.
- When horizontal space runs out, columns collapse by priority instead of showing a horizontal scrollbar: member first, then row actions fold into a single overflow (⋯) menu, then tags, then category.
- Pagination shows "Page X of Y" from server-provided total counts.
- Moving between pages keeps the current rows visible until the next page arrives — no skeleton flash or flicker for uncached pages (skeletons are for first load only).
- The browser fills the available viewport height: the table body flexes and the pagination footer sits at a small, consistent inset from the viewport bottom, matching the sidebar's bottom-control inset so the two bottom edges align.
- Report pages are the exception: they scroll at the route level, and their fixed transaction previews grow with the page without internal scrolling.
- Shareable state: filters, search text, sort, and list position live in the URL (per `docs/frontend-architecture.md`). Detail pages are URL-addressable. Sidebar navigation returns to a page's last-used state.
- Shareable-state URL writes that fire while an overlay is open (`?entry=` or the detail panel's `transaction=`) preserve the overlay params — a delayed write (e.g. debounced search) never closes an open surface — and rewrite the overlay's one history entry so Back still closes the overlay onto the updated list state.
- Filter bar pattern: a Filter toggle in the toolbar row opens a dedicated full-width filter bar directly beneath it; the "Add filter" menu and the accumulated removable typed filter chips live in that bar and never inflate the toolbar row. Filter dimensions: account, category, tag, member, amount range, initiated-date range, transaction lifecycle, derived settlement, reconciliation status, transaction class, transaction shape, and record role — all lifecycle, settlement, class, shape, and role values come from the server, including `refund` and `clawback` as their own filterable classes.
- While the filter bar is open, the Filter toggle renders as an X (close) icon button; activating it dismisses the bar and clears every chip-backed filter dimension. Standing toolbar controls — search and the class dropdown — are unaffected by the X and clear only through their own affordances.
- The filter bar opens automatically when a view loads with, or gains, chip-backed filters (deep links, chip activation).
- Day-step controls are square icon buttons with chevrons only, flanking the go-to-day date input, plus a Today shortcut that returns the view to the current day.
- Jumping to a day lands the view on the page containing that day when possible; if the day has no transactions, it falls back to the first transaction at or before that day, clamping at list boundaries as needed, and brings the target row into view with a transient highlight. Day-stepping keeps working after any jump.
- Transaction class is a primary classification: it filters from a standing toolbar dropdown beside search and date jump, not from the Add-filter menu; the dropdown owns the URL-backed class state.

### Transaction Edit mode

- Transaction quick changes are gated behind explicit Edit mode; browse mode renders no selection controls, keeps amount chips read-only, and routes rows to read-only detail.
- Entering swaps the toolbar for a compact `EDIT MODE` header with the live selection count, Select page, Clear, and Done; closes detail; reveals the leading checkbox column; and places a persistent right-side control panel beside the table and pagination.
- The control panel is visible from zero selected and provides Category Replace, Tags Add/Remove, Member Set/Clear, and grouped settlement/reconciliation actions. It expands at most one labeled editor at a time, scrolls internally within the browser's fixed viewport height, and keeps mutation errors with that editor without losing its draft or selection; it never moves below the table or displaces pagination.
- Quick changes target only selected transactions whose active records can accept the requested mechanical edit. Non-qualifying rows are skipped with reasoned result feedback that states the transaction count it describes with singular/plural wording; only transactions with records in the applied mutation count as updated. Selection remains after success so changes can chain.
- Category targets categorizable records; Tags use explicit Add or Remove; Member uses atomic Set or Clear; settlement sets eligible owned/party records Pending or Posted; reconciliation independently Reconciles or Unreconciles. Cancellation, restoration, and structural changes stay explicit per-transaction actions outside Edit mode.
- Filters, search, class, date jump, sorting, detail, row actions, entity-chip activation, and occurrence actions are unavailable while Edit mode is active. Pagination stays live; changing page keeps the mode active but clears selection and dock drafts.
- Selection mechanics: click, Space, or Enter toggles a row; Shift+Click / Shift+Space / Shift+Up/Down range-select from the anchor; the header checkbox and Cmd/Ctrl+A select the page. Expected occurrences are never selectable.
- With a selected row focused, `c`, `t`, and `m` open the Category, Tags, and Member dock editors.
- Every mechanically editable active amount becomes a stable styled input in Edit mode regardless of selection. Eligibility is limited to minimal two-record, single-currency spend, income, refund, or transfer shapes whose balanced replacement is mechanical; other amounts remain read-only chips.
- Amount inputs preserve the current absolute amount while editing; Enter saves, Tab or blur saves before focus advances, Escape restores, and invalid or failed saves remain inline. Saves are isolated per row, use full-transaction replacement, and keep Edit mode and selection active.
- Exiting through Done, the completed Escape ladder, transaction entry, or route navigation clears transient state and restores the normal toolbar. If an amount save is pending, the exit waits for it to succeed; a failed save cancels the requested exit and retains Edit mode and the failed draft. Escape closes the open dock editor, then clears selection, then exits Edit mode. Edit mode is never represented in the URL.
- Account registers retain record-level bulk operations where records are the row unit.

### Pickers

- An open picker option list paints above its owning multi-picker's selected chips and remains unclipped within the active surface.
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
- Empty states explain what the screen will show and offer the primary action when the screen owns one; account registers and reference drill-downs do not repeat generic transaction entry. Error states show a plain-language message with the machine-readable API error expandable underneath.

## Screen Specifications

Each screen below defines its purpose, layout, behavior, and primary data sources.

### Overview

- Purpose: recent household flow and current balances at a glance, plus a pulse of recent activity. The landing page. Report semantics are owned by [household flow reporting](household-flow-reporting.md).
- Flow report: the first content row is the shared configurable household-flow report. Its controls are embedded in the visualization: a small trend selector sits inside the graph's upper-right; the contributor checklist footer places named-series minus/plus controls at left and an arcade-style Accounts/Categories toggle at right; below the x-axis, a Month/Year toggle sits under the y-axis labels and precedes one sliding window whose handles resize the range and move its final-period anchor into the past. Its available bounds come from the separate accounting-history range read. The visualization places the checklist at roughly one quarter width before the graph on wide screens; on narrow screens the graph comes first and the checklist follows beneath it. The browser loads no accounting rows or transaction preview for this report.
- Balances: `owned` and `party` accounts grouped by FQN root prefix (`banks`, `cash`, `people`, …), each group listing account display labels with full-FQN tooltips, currency, and primary standing; group subtotal as `≈ USD`. `party` groups read as amounts owed to or by the household, never as household funds. Prominent accounts surface on top. Accounts with a current credit limit lead with server-derived remaining credit; all others lead with current balance.
- Month pulse: current-month spend and income totals as plain numbers beneath balances.
- Recent activity: the latest classified transaction lines, linking into Transactions.

### Transactions

- Purpose: scan, search, slice, and edit all activity.
- One list: classified transaction lines from the shared browser — no separate records mode. Row activation opens URL-addressable read-only detail.
- Scope: all-time, paginated, newest first (initiated date descending) by default. A date-jump control navigates to any point in history. The page remembers its last position (anchor, filters) and restores it on return.
- Toolbar: search, go-to-day with icon-only day-step buttons, class dropdown, page-local native/USD amount toggle, and the Filter toggle; typed filter chips accumulate in the filter bar beneath the toolbar row.
- Edit mode provides selection-based quick changes through its in-layout dock plus selection-independent eligible amount inputs.
- Transaction detail (URL-addressable, side panel over the list): class badge, counterparty title, display amounts, lifecycle strip, record table, metadata (source, created). Record rows show only role glyph, Account, Amount, and the full-path Category chip; account display labels link to registers and expose their FQNs in tooltips, while Category keeps its filter behavior. The panel is read-only; values change only through explicit footer actions. Row actions and detail footers share one applicability matrix: active transactions offer Edit, Duplicate, and Delete, with Split additionally available for server-classified spend/income; wholly pending active transactions additionally offer adjacent Post and Cancel; cancelled transactions offer Duplicate, Restore, and Delete; expected occurrences offer only Confirm and Dismiss. Active and cancelled transactions additionally offer Create template. Post opens a confirmation with the current local date and time prefilled and editable, then atomically settles every pending balance record at that instant, retains pending timestamps, and refreshes the row, open detail, balances, and references. Transaction rows themselves are the only detail-opening affordance. Edit, Duplicate, and Split open the transaction editor modal over the panel; the panel stays open beneath it and refreshes after save. The detail view shows everything the summary line truncates or hides. The lifecycle strip directly under the panel header shows `Initiated` plus the civil `initiated_date`, followed by `expected` or `cancelled` lifecycle when applicable; otherwise it shows `pending` for pending or mixed active transactions. Posted and no-balance active transactions show no status word. Detail-record activation (click, Enter, or Space; `aria-expanded`) toggles a read-only plain-text disclosure listing the full initiated date, derived Pending/Posted settlement and each stored pending and/or posted timestamp for owned/party records only, role, source, tag FQNs, member name, and the untruncated memo. Flow/system records show no settlement or lifecycle-date affordance, and Created stays in metadata.

### Transaction entry

- Surface: one centered modal editor, app-shell-owned and route-independent — the single surface for create, edit, split, and duplicate, opened in place from every entry point with no navigation. Stable stage frame, wide enough for the full journal grid at near-full viewport height; header and submit footer always pinned; the body is the single scroll region; content growth and validation errors never resize or move the frame. The underlying page stays visible behind the scrim and live-updates as entries save.
- Entry points (all open the same modal): the Transactions page-header and empty-state "New transaction" actions; the global `n` shortcut; command-palette entry commands and template-name prefills; template Use actions; and detail-panel and row Edit / Duplicate / Split. Opening exits transaction Edit mode.
- Template type-ahead start: the modal opens with a hierarchical template picker filtered by server-derived compatible shorthand types. Applying a template to a nonblank create draft requires replacement confirmation; once confirmed, it copies only the template's supplied raw defaults and leaves missing fields blank. A sole compatible type opens automatically, while ambiguous or unmatched Use launches fall back to Advanced. The palette offers the same entry points.
- Type tabs: Spend, Income, Refund, Transfer, Exchange, Advanced. Shorthand forms render in a centered narrow column; Advanced fills the body width; the frame never changes between tabs.
  - Spend: date, currency, funding account (`owned` or `party`), one or more merchant rows (`flow`, inline-creatable) each with its own amount and category (`expense`), optional tags/member/memo, optional friend-split rows (member or `party` account + share) that produce the transfer support records. The funding amount is the sum of merchant-row amounts and friend-split party shares; multiple merchant rows against one unchanged funding record are the ordinary case, not a split-only affordance.
  - Income: date, amount, destination account (`owned` or `party`), source (`flow`), category (`income`), optional extras.
  - Refund: like income with an `owned` or `party` destination, a merchant counterparty, and an `expense` category, entered as money coming back; the negative counterparty amount is what makes it a refund.
  - Transfer: date, one amount in one currency, from account, to account (`owned` or `party`), optional charge row (`flow` + `expense` category).
  - Exchange: date, from account with the sold amount and currency, to account with the bought amount and currency, optional tags/member/memo. A single-currency account supplies and locks its side's currency; a multi-currency account requires an explicit currency. The effective rate is read-only feedback; Mina supplies the `system:exchange` records, so no counterparty is ever picked.
  - Each shorthand create tab offers `Record as pending`; it applies to every `owned`/`party` record produced by either shorthand or a composed journal, persists with an unsaved per-tab draft, and resets unchecked after save. It is absent while editing.
  - Each tab maps to its shorthand endpoint; when a form's options exceed what a shorthand payload expresses, either the shorthand API is extended or the UI composes the full balanced transaction payload — the user never sees the difference.
- Currency fields are comboboxes over the currencies already present in the data, with free entry for a new code.
- Advanced (full journal editor): a free record grid — account, signed amount, currency, category, tags, member, memo, initiated date, and settlement intent per row — with a per-currency balance meter pinned to the footer. Pending/Posted settlement is available only for `owned` and `party` rows and disappears when reassignment changes a row to `flow` or `system`. `Edit pending/posted dates` expands prefilled, editable exact timestamps for eligible rows; omission, preservation, defaulting, and ordering follow [Transaction Lifecycle and Balance Settlement](accounting-semantics.md#transaction-lifecycle-and-balance-settlement). The category cell is available only on `flow` rows and is blank and inert elsewhere, so the grid states the record rules rather than relying on the user to know them. The footer also shows the server's live read of the draft — derived record roles, transaction shapes, class, and display amount — from the dry-run classify endpoint; the browser never derives classification itself. Save stays disabled until every currency sums to zero; validation errors, including the exchange exclusivity and settlement/account rules, map onto the offending rows.
- Escalation: "Edit as journal" from any tab converts the current form contents into records with nothing lost.
- Create vs edit: create shows all six tabs, "Save and add another" as the default submit (`Cmd+Enter`) plus "Save and close" (`Cmd+Shift+Enter`), sticky fields (date, account, type) carrying into the next entry, the session tally, and the modal rail. Edit/split show "Update transaction" only (closes on success), the fitting shorthand tab plus Advanced, and a "Replacing transaction" footer note; the detail panel stays open beneath the modal and refreshes after save. Editing reopens the shorthand shape when records still fit. Split is an active spend/income allocation shortcut: Advanced loads the original records and appends one blank manual/unreconciled row seeded from the first matching REST-role flow record (`expense` or `income`) with account, currency, tags, member, and memo copied. Duplicate opens the create path prefilled.
- Batch ergonomics: batched entry works from any page. The modal rail (wide screens, create mode) shows THIS SESSION — this sitting's saved entries, each with an Edit action that relaunches it — and RECENT — the launch context's transaction rows captured at open. The rail is read-only and adds no tab stops. Below the rail breakpoint a one-line footer recap of the last save sits beside the session tally. Saves fan out immediately to the visible list behind the modal; deeper recall closes the modal (drafts persist), checks the list, and reopens.
- Deep links: one `?entry=` param valid on every route — `new[:spend|income|refund|transfer|exchange|journal]` (`journal` opens Advanced), `edit:<id>`, `split:<id>`, `duplicate:<id>`. Opening pushes one history entry (browser Back closes); in-app close strips the param; composes with the transaction-detail param; missing ids and ineligible Split targets show the standard unavailable state in the modal body; `new` restores the persisted draft. Transaction Edit mode stays never-URL.
- Close / Esc / drafts / focus: Esc ladder inside the modal — open picker → close it; confirmation dialog open → it handles Esc; otherwise close the modal. Create closes without prompting and restores its one draft envelope from IndexedDB; its generic Clear draft action confirms nonblank work, resets every tab and the template picker, deletes persistence, preserves saved session entries, and has no undo. Edit/split with modifications require the discard confirmation. On close, focus restores to the invoking control, falling back first to the list-region restore target and then to the Transactions navigation link; initial focus is the template picker (create) or the first field of the active tab (edit).
- Validation: inline on blur; API errors map onto the offending fields/rows; the pinned footer shows the general error strip and, when errors sit off-screen, a compact attention strip that scrolls to and focuses the first offending field. Advanced save stays disabled until every currency balances. Errors never close the modal or lose entered data.
- Responsive: wide screens — centered stage with gutters and the rail; medium — stage without the rail (footer recap); narrow — full-screen takeover with header/footer pinned and the Advanced grid scrolling horizontally inside the body only.

### Account and group pages

- Purpose: one account's (or account group's) activity and standing; the drill-down target from Overview, the balance strip, and Accounts.
- Account page header: effective display label with a full-FQN tooltip, account type badge, currency mode, labeled flat favorite toggle, account standing, credit limit with history (when present), external link metadata, hidden marker. With a current effective limit, standing leads with `Remaining credit` and retains `Full balance`, `Posted balance`, and `Credit limit`; otherwise it retains `Current` and `Posted`. Fixed system accounts replace mutation controls with a read-only indicator.
- The currency appears in the header exactly once as a compact chip next to the type badge (sized like it): an ISO/crypto code for single-currency, or `Multi-currency` for `NULL`. Balance figures carry each amount's own currency marker; the conditional labels above stay plain, and the balances block right-aligns with the content edge on wide screens, mirroring the account name's left margin.
- Register: the shared browser in records shape — the account's records with date, transaction counterparty, category, memo, statuses, signed amount, defaulting to newest first. Selecting a record opens the side peek panel showing the full containing transaction; arrow keys walk rows while the panel follows; "Open transaction" jumps to full detail/edit.
- Running balance: a per-record `Balance` column, shown in date-ordered views in either direction and hidden whenever filters, search, or non-chronological sort would make it misleading. Individual account registers add a separate `Remaining credit` column only when the API supplies both values; group registers remain unchanged. Both numeric columns are right-aligned and single-line; at phone width, credit-register rows stack identity/date above labeled Amount, Balance, and Remaining values without horizontal panning.
- Group pages: every non-leaf FQN node is a page — subtotal balances of child `owned` and `party` accounts plus a combined register across the whole prefix (e.g. `banks:Chase:*`), which naturally includes the group's `flow` accounts (fees, interest) per the prefix-grouping semantics.

### Accounts

- Purpose: manage the unified chart of accounts and enter registers.
- Layout: tree table grouped by FQN hierarchy; account leaves show their full FQN followed by a custom display-label override in parentheses when set, while implicit groups show their FQN path. Columns: name (path-indented), type badge, currency (ISO/crypto code for single-currency, a clear `Multi-currency` chip for `NULL`), balance (`owned` and `party` accounts), and the trailing actions column. Hidden state renders as the standard eye-off indicator on the row, not as its own wide column. Rows link to account/group pages.
- Row actions (trailing column, per the affordance-class rule): move/rename and delete as button-class actions — delete disabled with an explanatory tooltip when the node cannot be deleted; hide/unhide and featured (star) as persistent flat toggle icons. Leaf and group rows carry the actions that apply to them; fixed system accounts and the `system` group carry none.
- Toolbar: search, type filter, include-hidden toggle. Create/edit in a side panel: FQN, optional display-label override, type, explicit single-/multi-currency mode, currency code when single-currency, external id/system, hidden. A blank display label uses the automatic final-one-or-two-FQN-segments fallback. Edit follows the account-currency transition rules in `docs/accounting-semantics.md`.
- Restructuring: rename a node or move it to a new parent from the tree; the whole subtree follows with an FQN prefix rewrite.
- Credit-limit history for eligible card accounts is managed from the account's edit panel or page header. It is available only for single-currency accounts, and every history value displays in the owning account's currency without a limit-currency field. Until an account has its first credit-limit entry, the section renders as a single "Add credit limit" button; activating it reveals the full credit-limit editor. Any account with existing history exposes its rows and Delete controls even when it is not eligible to add entries. Account currency controls are unavailable with an explanation while active credit-limit history exists and return after the final active row is deleted.
- Accounts with credit-limit history show a small credit-card icon immediately right of the account name — in the name area, never the actions column — in the chart of accounts and on the account page header. The icon is a pure indicator (no press or hover affordance).

### Reference data

- Categories, Tags, and Members share a searchable tree list (flat list for Members) + side-panel editor. Templates uses the same list conventions with its route-independent modal. All support tombstone delete with confirmation and rename/move with subtree rewrite; include-hidden applies where relevant.
- Members and Tags render as compact left-aligned lists with a bounded maximum width instead of stretching a near-single-column table across the viewport; the trailing actions column stays narrow. Categories keeps the wider two-column layout (name + intent badge).
- Row actions follow the accounts affordance philosophy: rows that can be deleted carry a delete quick action in the trailing actions column (always visible per the row-actions rule), disabled with an explanatory tooltip when the listing reports the entity as not deletable; activation opens the standard confirm dialog naming the entity and calls the existing delete endpoint, with API errors surfaced as the fallback. Group-only rows carry no delete while no group delete operation exists. Category, Tag, and Member side-panel editors keep their delete actions.
- Category and Tag leaf rows expose featured and hidden flat toggles in the shared fixed trailing slots.
- Every dictionary entity is a drill-down target with its own page. Category, tag, and member drill-downs use the route-level page header as their sole identity header and have no duplicate identity card.
  - Category and Tag leaf and implicit-group pages place whole-scope top-line cards directly below the header, then the same inline-controlled report visualization used by Overview, followed by a full-width fixed newest transaction preview. The route scrolls normally; cards, graph, checklist, and preview have no internal scroll regions.
  - The graph has no duplicate legend. Its tooltip leads with the selected metric and returned totals, then inflows descending and outflows ascending with `Other` last in each group; Category contributors retain drill-down links. The contributor checklist provides labeled items plus all/none actions.
  - At narrow widths the graph precedes the checklist without changing control or keyboard order. Sparse, empty, filtered, and expanded reports preserve readable labels, tooltip access, and the theme's high-contrast trend line.
  - The fixed preview reuses transaction line/detail behavior without paging, filtering, sorting, Edit mode, row actions, or internal scrolling. Its Transactions action preserves the exact leaf or descendant-group scope.
  - Category and Tag report semantics follow `docs/household-flow-reporting.md`; Member drill-downs retain the full filtered transaction browser.
- Categories: economic-intent badge per row (`expense` or `income`); the editor requires intent and explains its classification effect in one line.
- Templates: `/templates` presents a searchable template tree with record-default summaries, Use, create/edit, move/rename, and delete. Use opens transaction entry in place with the template applied. Its route-independent modal manages date-free partial record defaults (all optional: account, category, member, currency, amount, tags, memo), protects dirty work, and refreshes every template consumer after mutation. Responses carry server-derived compatible shorthand types per the [transaction-template service contract](../internal/services/transactiontemplates/PACKAGE.md). Active and cancelled transaction rows/details can create a blank-named template from their reusable records.

### Status and Settings

- Status: backend health, database location/schema, background operations (exchange-rate loading, backups) with recent runs and manual trigger buttons.
- Operation navigation: an operation selector drills into a shared runs table showing the common run envelope — paged, newest first; columns: started, finished/duration, outcome, trigger. Selecting a run opens its detail.
- Shared building blocks (selector, envelope runs table, run-detail frame) are common to all operations; each operation type ships a dedicated frontend module owning its run-detail rendering and operation-specific controls through that operation's named concrete APIs. There are no generic fallback renderers.
- Module completeness is enforced statically: the module registry is keyed by the generated operation-id union, so a newly added operation type fails typecheck until its module exists.
- Settings is a server-driven read-only view of the operational configuration loaded for the running process. It renders backend-provided groups, labels, help, active values, and the resolved config-file location without setting-key-specific UI code. Bare indicators beside each label mark non-default values and identify CLI or environment overrides; config-file origin is implicit.
- Status reports whether database encryption is active as a labeled health card; the encrypted state includes a supporting lock icon.
- Configuration is loaded once at startup; this screen does not mutate runtime state, write the config file, or predict values for a later process.
- Browser-local UI preferences remain persisted per `docs/frontend-architecture.md` and do not appear in the server settings manifest; they include table density, default landing screen, and theme selection.

### Recurring occurrences and definitions

- Recurring occurrences — confirmed, overdue, and upcoming EXPECTED — render inline in the Transactions page by default. The browser explicitly includes every lifecycle even though API listings omit expected by default; per `docs/recurring-transactions-semantics.md`, showing them never changes their exclusion from balances, aggregates, account registers, and reports.
- Loading a transactions view runs the occurrence API's lazy catch-up materialization so the list always reflects occurrences through today.
- Expected rows carry a distinct visual treatment inline; overdue occurrences (scheduled before today) additionally carry the warning-treatment missed marker per the theme.
- Transaction lifecycle is an ordinary filter dimension. Selecting Expected isolates the occurrence review queue; selecting Active or Cancelled exposes the corresponding lifecycle without a separate include/hide toggle.
- Confirm and Dismiss are row actions on expected rows, per the affordance-class rules: Confirm materializes the transaction immediately with posted balance records and the standard toast; Dismiss sits behind the standard named confirmation dialog. Both surface API errors per the standard feedback rules.
- Confirmed occurrences are ordinary transactions and edit through the transaction editor modal; expected occurrences stay read-only — Confirm and Dismiss are their only actions.
- The `/recurring` page hosts recurring definitions management — the configuration surface for recurring transactions; occurrence review lives inline in Transactions per the rules above.

Definitions management screen:

- Content: one compact table of recurring definitions (shared table rules) — columns: definition (hierarchical FQN path rendering), schedule (human-readable rule summary, e.g. "Every 2 weeks" / "Monthly on the 15th" / "Last day of month"), status (active/paused badge), next (next scheduled date computed from the schedule), amount (definition display amount per the amount rules), and the trailing actions column.
- Row activation opens the definition editor panel — a deliberate management-surface exception to the reference row-activation rule, because a definition has no read-only detail page; the editor is its detail.
- Row actions per the affordance-class rules: Confirm next (button; materializes and posts the next occurrence immediately with the standard toast), Pause/Resume (persistent state toggle), Defer (button, interval schedules only, opens a dialog with the offset defaulting to one cadence interval and user-editable), Edit, and Cancel (destructive, behind the standard named confirmation; tombstones the definition, generated history untouched).
- Editor (side panel, create + edit): FQN, schedule class and fields (interval every-N + unit, or date rule day-of-month/last-day), anchor date, paused state, and the definition's complete balanced record grid reusing the transaction editor modal's journal editor pieces — per-currency balance meter, intent-valid account pickers, no partial shapes. Save creates or fully replaces the definition (version increments; records replaced atomically); API shape errors map onto the offending rows.
- Empty state: a quiet "no recurring definitions" presentation with the New definition action.

## Future

- Reports may add named transaction views and richer summaries that follow this document's structural language.
- Budgets may add a category-tree editor and monthly status that reuse category path rendering and amount rules.
- Import and reconciliation may add an inbox for matching and confirming imported records, with an unreconciled-record status indicator.

## Shared Design Primitives

Mina-specific building blocks used across screens (names indicative; placement per frontend package boundaries):

- `TransactionBrowser` — the shared browsing system: transaction lines with URL-addressable detail and Edit-mode dock/amount controls, plus register rows with peek panels; filtering, pagination, selection, and keyboard behavior stay shared.
- `PeekPanel` — side panel previewing the full containing transaction from a record row.
- `EntryModal` — the centered modal transaction editor: hierarchical template picker, generic clear-draft action, shorthand tabs, journal editor, session tally, modal rail (session + recent context), create/edit/split/duplicate launches, `?entry=` deep links.
- `TemplateEditorModal` — the app-shell-owned date-free partial-record editor for create/edit and transaction capture launches.
- `CommandPalette` — navigation, entry launcher, transaction search, app actions.
- `BalanceStrip` — always-visible prominent-account balances.
- `AmountText` — signed, tabular, currency-code-aware amount with class-aware emphasis.
- `FqnPath` — de-emphasized-ancestors path renderer with truncation and tooltip.
- `ClassIcon` / `StatusIcon` / `RecordRoleIcon` — narrow icon-encoded class, status, and record-role indicators with tooltips; `ClassBadge` chip form remains for detail headers.
- `CategoryChip`, `TagChip`, `MemberChip` — entity chips that add their entity to the active filters; `AccountTypeBadge`, `IntentBadge` — descriptive indicators.
- `RowActions` — the trailing per-row actions cluster: always-visible icon-button actions plus persistent flat toggle icons, collapsing into a single overflow (⋯) button with a floating panel when the actions cell cannot fit the row's full action cluster.
- `EntityPicker` — hierarchical type-ahead combobox with variants for include-hidden on broader surfaces, entry-time leaf creation, and context-aware account-type filtering.
- `FilterBar` / `FilterChip` — URL-backed typed filters.
- `PageHelp` — header help icon button revealing a hidden-by-default explanation paragraph.
- `DataTable` — server-driven table shell: sticky header, skeletons, selection, pagination, keyboard row focus.
- `BalanceMeter` — per-currency zero-sum indicator for the journal editor.
- `TransactionEditDock`, `ConfirmDialog`, `EmptyState`.

## Accessibility & Quality Bar

- WCAG AA contrast in every theme; visible focus rings; full keyboard operability of tables, pickers, and forms.
- Icon-only controls carry accessible labels and tooltips.
- Semantic markup for tables and forms; modal overlays (dialogs) trap focus and restore it on close; non-modal side peek/detail panels follow the Overlays rule instead of trapping focus.

## Document Use

- Read each screen specification with `docs/frontend-architecture.md` and the OpenAPI contract.
- The design leads and the API follows: when a screen needs a capability the API lacks, extend the API instead of trimming the UX or computing accounting truths client-side.
- Track concrete backend/API requirements in Kata issues or `api/openapi.yaml`; do not use this UX document as an API backlog.
- Reuse the shared design primitives before inventing new patterns; extend this document first when a new pattern is genuinely needed.
- Anything ambiguous here is decided in favor of: truth-first, progressive disclosure, keyboard speed, and simplicity.
