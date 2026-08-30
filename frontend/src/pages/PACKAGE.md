# frontend/src/pages

## Purpose

- Owns top-level route screens and route-local coordination.

## Implicit Contracts

- Route-local query updates preserve parameters owned by other layers; transaction sorting resets pagination while preserving filters and overlays.
- Categories owns the optional typed `economic_intent` query parameter; omitting it represents the All selection, while a selected intent seeds new-category creation.
- Management routes retain an opened Account, Category, Tag, or Member independently of filtered resource snapshots so a mutation or toolbar change that removes it from current membership cannot invalidate the editor or its focus lifecycle; Categories may reconcile refreshed API deleteability without replacing its draft.
- Account, Category, Tag, and Member routes pass their URL-owned normalized search, hidden visibility, and applicable typed filters to keyed management resources; only Accounts keeps its nonzero balance presentation filter local.
- Transaction-filter changes keep an open transaction or entry overlay visible: synchronously replace its background URL before writing the overlay URL, so the browser never renders an overlay-less intermediate state.
- The Transactions route composes ledger's recurring projection confirm/load/defer adapters; applicability and dialog behavior remain feature-owned.
- The Recurring route resolves definition fragments from its loaded snapshot and hands linked edits to the app-shell editor; user-visible resolution, overlay ordering, close, and focus behavior follow [Definitions management](../../../docs/webui-design.md#recurring-occurrences-and-definitions).
- Transaction entity-chip actions add an entity FQN or member name only while the URL-backed DSL expression is row-renderable; overlapping entity resolutions accumulate instead of superseding one another, while Clear or browser history cancels unresolved additions. Category, tag, and member activation each re-read the entity by stable ID to obtain its current FQN or name so external renames cannot submit stale filter values; lookup failure warns without changing the current URL or date anchor. Advanced state leaves all entity chips non-interactive.
- A failed register entity-filter lookup warns without navigating, while an intervening register URL change or page unmount aborts and discards its delayed result.
- A page that coordinates a local panel or restructure dialog retains its opener and restores focus on close; use the page's primary action as the fallback when that opener no longer exists.
- Category and Tag group routes use canonical `/categories/group?prefix=FQN` and `/tags/group?prefix=FQN` forms; leaf routes retain numeric IDs.
- The member drill-down reads the exact member by stable route ID before applying its current name as a transaction scope; route changes abort obsolete reads without reacting to query-only list-state changes.
- Status owns the `tab` query parameter and keeps health cards mounted above its Background operations and Audit log feature views.
- Status tabs use roving focus with arrow, Home, and End navigation and label their shared tab panel.

## Boundaries

- Owns: route registration, route-local URL and overlay coordination, route parameter validation, and screen composition.
- Does not own: app-shell startup or route-independent transaction entry, feature resource/cache lifecycles, generated API setup, shared stores, or reusable browser-side-effect adapters.
