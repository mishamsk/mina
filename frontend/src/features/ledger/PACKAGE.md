# frontend/src/features/ledger

## Purpose

- Owns shared ledger feature UI used by transaction browsing, transaction detail, and entry.

## Implicit Contracts

- Transaction class, shapes, record roles, display titles, primary amounts, and record amounts come from REST responses; multi-part lines render one primary amount when singular plus a bare, non-focusable `+` more-parts indicator, detail renders every shape amount, and exchange lines render the sold side.
- Shared journal-record tables render each REST-derived role as a leading indicator; read-only record disclosures also name the role in text.
- In browse mode, click, Enter, or Space on a transaction row opens URL-addressable read-only detail; entity chips filter and amount chips remain read-only.
- Shared browser Edit-mode interaction follows the owning [Transaction Edit mode specification](../../../../docs/webui-design.md#transaction-edit-mode).
- Edit mode owns page-local selection and one persistent, internally scrolling right-side panel for Category Replace, Tags Add/Remove, Member Set/Clear, and settlement/reconciliation actions; the table and pagination retain their bounded viewport beside it. Prediction and apply share one reasoned per-transaction predicate; only transactions with records in the applied mutation count as updated.
- Eligible active amounts become stable row-local inputs throughout Edit mode independently of selection. Enter, Tab, or blur saves through atomic transaction replacement; Escape restores; invalid and failed saves stay inline; pending state is isolated per amount.
- After a successful amount save filters out its row, focus falls back in order to the same-index transaction row, an enabled pagination control or its footer, the empty-state action, then the route-level list restore target; browser embeddings preserve the `data-transaction-row`, `transactions-pagination-footer`, `data-transaction-empty-action`, and `data-transaction-detail-restore-target` hooks that define that order.
- Transaction-row lifted member display ignores unattributed records.
- The transaction detail panel is read-only: activating its transaction row again closes it with focus restored, activating another row switches it directly, record rows only toggle inert exact-value disclosures, account display-label links navigate to account registers, editing goes through its Edit/Duplicate/Split modal launches, and entity chips filter the underlying list.
- Transaction detail and account-register peek share the same read-only transaction-detail content component; behavior follows the owning [Transactions specification](../../../../docs/webui-design.md#2-transactions--phase-2-core-screen).
- Shared contextual account mentions render the REST-provided effective display label with a full-FQN tooltip; account selection, assignment, filtering, and navigation controls remain FQN-based.
- Transaction detail panel renders a transaction snapshot passed by the owning page; expected occurrences expose only Confirm/Dismiss, and successful modal edits use the same refresh fan-out as the browser.
- Transaction detail panel owns tombstone confirmation plus cancel/restore controls and delegates each transaction mutation to the owning page.
- `useTransactionBrowserPage` composes shared browser snapshots, page-granular date jumps with a transient row anchor, transaction detail, row tombstones, pagination, and notices; pages supply their URL filter semantics.
- `TransactionBrowserToolbar` owns filter-bar visibility and stable toolbar geometry independent of overlapping detail; pages retain URL-filter ownership and supply chip clearing that preserves standing search and class controls.
- Transaction browsing explicitly requests every lifecycle by default and triggers one occurrence catch-up read per browser mount; account registers retain the API default that excludes expected transactions while including cancelled history.
- Expected and cancelled lifecycle indicators take precedence; active pending and mixed-settlement indicators trail the ellipsizing title/memo region inside the description cell. Posted and no-balance active rows reserve no in-cell indicator space.
- Detail lifecycle strips show only the civil initiated date and the applicable expected, cancelled, or active pending/mixed word. Record disclosures show server-derived settlement and each stored pending and/or posted timestamp for owned/party rows only.
- Transaction-row actions use the shared `RowActions` cluster and follow the owning [table row-action rule](../../../../docs/webui-design.md#tables-and-filtering).
- Ordinary active and cancelled transaction rows and full detail panels can launch the app-shell template editor over their current context; expected occurrences, Edit mode, and account-register peeks cannot. Close preserves the underlying detail and restores the invoking action's focus.
- Expected recurring rows replace the normal delete action with confirm and named-dismiss occurrence actions while retaining transaction detail; successful lifecycle actions use the standard transaction-mutation refresh fan-out.
- `C::` currencies render as crypto-scale values with up to 8 decimals; other currencies render as fiat-scale 2-decimal values.
- Shared FQN picker interaction follows the owning [Pickers specification](../../../../docs/webui-design.md#pickers); an open multi-picker option list stacks above its selected-chip region on every surface.
- Lookup-backed entry pickers use bounded REST lists, exclude hidden entities upstream, and prune empty hierarchy groups. The Edit-mode dock loads hidden entities and filters them locally through its Include hidden control.
- Entry pickers may create client-valid, prefix-free category, tag, and flow-account leaves inline; REST services remain the validation authority, and panel-local ID overlays retain created entities while shared lookups refresh.
- Entry picker instances remount at draft initialization, discard, and post-save reset boundaries; ordinary lookup refreshes preserve their focus and transient queries.
- Edit-mode Category targets categorized `flow` records only; Tags, Member, balance-record settlement, and reconciliation use their narrow record bulk APIs, while eligible simple row amounts use atomic transaction replacement built from the displayed transaction shape. Prediction and result skip reasons always state the transaction count they describe.
- Structural record fields are edited only through the explicit transaction editor modal.
- Entry supports spend, income, refund, transfer, and exchange shorthand endpoints; spend merchant rows share one draft representation, spend/income/refund balance fields accept `owned` and `party` accounts, Transfer may compose an ordinary expense charge, and Advanced previews the server's dry classification. Transaction-entry interaction follows the owning [Transaction entry specification](../../../../docs/webui-design.md#3-transaction-entry--phase-2).
- Saved transactions reopen in shorthand when non-empty memo/member values agree and tag sets are uniform across the shape; unchanged shorthand edits preserve the original per-record placement of those values.
- The app-shell-owned `EntryModal` is the single create/edit/split/duplicate surface on every route; `?entry=` owns its shareable launch state and composes with page URL state.
- Transaction-template responses own their server-derived compatible shorthand types; entry copies supplied raw defaults into a selected compatible tab, opens a sole match automatically, and otherwise falls back to Advanced without reclassifying records in the browser.
- Opening `EntryModal` exits Edit mode and clears its transient selection, dock, and amount state.
- Saved-transaction Edit/Split saves are full replacements owned by `EntryModal`; successful saves fan out to displayed transaction browsers, detail, balances, overview, registers, and reference snapshots.
- Saved-transaction Duplicate reuses entry prefill mapping but stays on the create path.
- Successful transaction mutations trigger shared invalidation for account, category, tag, and member page snapshots so REST-provided `deletable` flags refetch without a reload.
- Successful Edit-mode saves update the displayed page and invalidate sibling page snapshots before balance, overview, register, detail, and reference refreshes settle in the background; the settled page refresh reports row visibility for the latest pending focus recovery on that page. Category and settlement saves publish only a complete server-derived transaction, while a failed settlement refetch retains the prior row until background refresh without reporting the committed mutation as failed.
- A background page response replaces only its unchanged source snapshot and is discarded when a newer source exists; the first failure preserves the displayed snapshot, marks it stale, and lets the mounted resource retry without a table loading state, while a repeated failure keeps the snapshot visible and surfaces its staleness through the page error treatment.
- Entry-modal saves retain the blocking visible-page refresh so stale displayed rows cannot start a conflicting full-replacement edit while the saved transaction refetches.
- Successful Edit-mode mutations use the same transaction, balance, overview, register, detail, and reference-page refresh fan-out as other transaction edits.
- Transaction-entry drafts are per tab, store UI form values only, and persist after real input or a successful save establishes sticky values; initialization defaults alone never persist or trigger discard, and initialization never replaces entered values or steals focus after interaction.
- Legacy bare transaction-entry drafts infer their shared initialization date and currency while preserving per-tab deviations as input; the next write upgrades them to envelopes.
- The active entry tab is a persisted UI preference.

## Boundaries

- Owns: ledger display atoms, transaction browser, transaction detail panel rendering, record tables, tombstone confirmation UI, bounded lookup pickers, entry-modal UI mapping, and shared transaction-mutation refresh and page-cache behavior.
- Does not own: REST endpoint generation, accounting validation, durable accounting persistence, route URL state, missing-detail fetches, or route-specific transaction mutation calls and notices.
- Page routes own URL filter semantics, URL-addressed detail state, and page-specific detail actions; the app shell owns modal launch URL state and entry save fan-out.

## Testing Notes

- Frontend e2e tests cover browse-row detail activation, Edit-mode dock/selection/amount workflows, detail-panel read-only guarantees, detail and entry deep links, pagination, modal create/edit/split/duplicate, per-tab drafts, sticky entry fields, and picker keyboard submission.
