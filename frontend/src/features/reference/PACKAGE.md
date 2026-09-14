# frontend/src/features/reference

## Purpose

- Owns reusable reference search, tree presentation, and entity drill-down browser composition.

## Implicit Contracts

- Roomy reference trees use the shared reference table frame and bounded loading/error/empty surfaces; callers provide a shrinking flex slot beneath page headers and banners, and the inner viewport alone scrolls loaded rows. Loading/error wrappers reserve shadow padding without shifting their cards.
- The toolbar owns only URL parameters `q` and `hidden`: trim and omit an empty search, encode enabled hidden items as `hidden=true`, preserve unrelated parameters, allow a caller-owned reset version to discard its focused draft after an external clear, and render feature-supplied standing controls without owning their state.
- The toolbar search field opts out of browser value-history suggestions so Mina's server-filtered search remains the only search experience.
- Tree rows preserve the canonical order of server-filtered leaves and derive only their ancestors; group API data supplies group state only. Do not perform another substring match, render orphan groups, or use a group's hidden state to hide visible descendants.
- Tree navigation uses caller-supplied `rowHref` destinations for name links and shared row shortcuts. Editor actions use `onRowClick` and return the opener for focus recovery; embedded controls never activate the row.
- Member drill-down callers supply the resolved member name. The shell keeps that scope outside browser-controlled URL filters and reapplies it to each transaction request, so the toolbar cannot clear or broaden it.
- Drill-down transaction sorting uses the shared URL-backed ledger controls and keeps the scoped entity filter intact.
- Drill-down transaction browsers pass through ledger's next-projection Defer operation and refresh coordination without interpreting recurring applicability.
- When a drill-down search changes with a transaction or entry overlay open, update the background and overlay URL states synchronously; do not briefly render the overlay-less background.
- Selecting a member from a transaction routes to that member's drill-down and replaces the scoped filter; selecting another entity kind re-reads it by stable ID through REST to obtain its current FQN before adding an ordinary transaction filter, and only while the browser filter is row-renderable. Delayed entity lookups preserve live URL state such as a newer page-size selection.
- The member drill-down route owns the identity header; Category and Tag leaf/group routes use the household-flow report feature.
- Member drill-down loading and error cards own bounded roomy scrolling so expanded details retain access to Retry.
- Full-page reference trees and member transaction drill-downs use the shared compact-shell Controls/document-scrolling contract; report previews and bounded overlay tables do not.

## Boundaries

- Owns: reference search URL helpers, FQN tree derivation and presentation, and the shared drill-down browser shell.
- Does not own: entity resource loading, mutation refresh fan-out, route registration, or ledger resource lifecycle.
