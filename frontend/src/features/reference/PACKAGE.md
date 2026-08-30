# frontend/src/features/reference

## Purpose

- Owns reusable reference search, tree presentation, and entity drill-down browser composition.

## Implicit Contracts

- The toolbar owns only URL parameters `q` and `hidden`: trim and omit an empty search, encode enabled hidden items as `hidden=true`, preserve unrelated parameters, and render feature-supplied standing controls without owning their state.
- Tree rows preserve the canonical order of server-filtered leaves and derive only their ancestors; group API data supplies group state only. Do not perform another substring match, render orphan groups, or use a group's hidden state to hide visible descendants.
- Trees activate leaf rows; Category and Tag indexes also activate groups to canonical FQN-prefix overview routes. Embedded controls must not activate the row, and the supplied opener is returned to the owner for focus recovery.
- Member drill-down callers supply the resolved member name. The shell keeps that scope outside browser-controlled URL filters and reapplies it to each transaction request, so the toolbar cannot clear or broaden it.
- Drill-down transaction sorting uses the shared URL-backed ledger controls and keeps the scoped entity filter intact.
- Drill-down transaction browsers pass through ledger's next-projection Defer operation and refresh coordination without interpreting recurring applicability.
- When a drill-down search changes with a transaction or entry overlay open, update the background and overlay URL states synchronously; do not briefly render the overlay-less background.
- Selecting a member from a transaction routes to that member's drill-down and replaces the scoped filter; selecting another entity kind re-reads it by stable ID through REST to obtain its current FQN before adding an ordinary transaction filter, and only while the browser filter is row-renderable. Delayed entity lookups preserve live URL state such as a newer page-size selection.
- The member drill-down route owns the identity header; Category and Tag leaf/group routes use the household-flow report feature.

## Boundaries

- Owns: reference search URL helpers, FQN tree derivation and presentation, and the shared drill-down browser shell.
- Does not own: entity resource loading, mutation refresh fan-out, route registration, or ledger resource lifecycle.
