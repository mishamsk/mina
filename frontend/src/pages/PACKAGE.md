# frontend/src/pages

## Purpose

- Owns top-level route screens and route-local coordination.

## Implicit Contracts

- The Status route registers tab-navigation keyboard help; the active feature owns its additional row shortcuts.

- The browser data router renders every page through the AppShell layout outlet and rethrows route render errors to the application error boundary for its status panel and logging; routes do not own loaders or actions.
- Single-account registers link to Transactions using an exact stable account-ID filter in a fresh URL, independent of register pagination and detail state.
- Roomy single-account summaries use a capped, keyboard-accessible scroller with compensated shadow padding to align cards with the register and an inward focus outline to avoid page-frame clipping; arbitrary currency balances and expanded header errors remain reachable while reserving space for register rows and pagination. Compact summaries stay in document flow.
- Route-local query updates preserve parameters owned by other layers; transaction sorting resets pagination while preserving filters and overlays.
- Categories owns the optional typed `economic_intent` query parameter; omitting it represents the All selection, while a selected intent seeds new-category creation.
- Management routes retain an opened Account, Category, Tag, or Member independently of filtered resource snapshots so a mutation or toolbar change that removes it from current membership cannot invalidate the editor or its focus lifecycle; Categories may reconcile refreshed API deleteability without replacing its draft.
- Account, Category, Tag, and Member routes pass their URL-owned normalized search, hidden visibility, and applicable typed filters to keyed management resources; only Accounts keeps its nonzero balance presentation filter local.
- Transaction-filter changes keep an open transaction or entry overlay visible: synchronously replace its background URL before writing the overlay URL, so the browser never renders an overlay-less intermediate state.
- The Transactions route composes ledger's recurring projection confirm/load/defer adapters; applicability and dialog behavior remain feature-owned.
- The Recurring route launches new and existing definitions in the app-shell editor with drafts bound to the launch pathname; it owns its search query, preserves a definition fragment while that query changes, passes the query to the backend-filtered next-due snapshot, re-resolves restored history fragments into fresh drafts from that snapshot or an exact read when filtered out, treats only exact-read missing responses as unavailable, preserves the fragment with Retry after transient failures before handing linked edits to the app-shell editor, and restores Clear-filter focus to the visible search field or compact Controls trigger; user-visible resolution, overlay ordering, close, and focus behavior follow [Recurring transactions and definitions](../../../docs/webui-design.md#recurring-transactions-and-definitions).
- Transaction entity-chip actions add an entity FQN or member name only while the URL-backed DSL expression is row-renderable; overlapping entity resolutions accumulate instead of superseding one another, while Clear or browser history cancels unresolved additions. Category, tag, and member activation each re-read the entity by stable ID to obtain its current FQN or name so external renames cannot submit stale filter values; lookup failure warns without changing the current URL or date anchor. Advanced state leaves all entity chips non-interactive.
- A failed register entity-filter lookup warns without navigating, while an intervening register URL change or page unmount aborts and discards its delayed result.
- A page that coordinates a local panel or restructure dialog retains its opener and restores focus on close; use a visible page control or the compact Controls trigger as the fallback when that opener no longer exists.
- Category and Tag group routes use canonical `/categories/group?prefix=FQN` and `/tags/group?prefix=FQN` forms; leaf routes retain numeric IDs.
- The member drill-down reads the exact member by stable route ID before applying its current name as a transaction scope; route changes abort obsolete reads without reacting to query-only list-state changes.
- Status owns the `tab` query parameter, places its Background operations and Audit log feature views directly below the header, and exposes REST-backed runtime, database, and development-build metadata through the Server info popup.
- Status tabs use roving focus with arrow, Home, and End navigation and label their shared tab panel.
- Roomy fixed routes use `fixedPageClassName`: Transactions, Accounts, account/account-group registers, Categories, Tags, Members, member drill-down, Templates, and Recurring. Their designated table/list/register owns vertical scrolling, including bounded loading, error, and empty states; compact layouts keep headers/actions and rows in document flow.
- Overview and Category/Tag leaf/group reports scroll the document. Status also scrolls the document while capping its audit table internally; Settings is hybrid, retaining its own bounded route-level internal scroller in every shell.

## Boundaries

- Owns: route registration, route-local URL and overlay coordination, route parameter validation, and screen composition.
- Does not own: app-shell startup or route-independent transaction entry, feature resource/cache lifecycles, generated API setup, shared stores, or reusable browser-side-effect adapters.
