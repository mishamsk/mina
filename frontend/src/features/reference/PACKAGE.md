# frontend/src/features/reference

## Purpose

- Owns reusable reference search, tree presentation, and entity drill-down browser composition.

## Implicit Contracts

- The toolbar owns only URL parameters `q` and `hidden`: trim and omit an empty search, encode enabled hidden items as `hidden=true`, and preserve unrelated parameters.
- Tree rows come from visible matching leaves; group API data supplies group state only. Do not render orphan groups or use a group's hidden state to hide visible descendants.
- Trees activate leaf rows; Category and Tag indexes also activate groups to canonical FQN-prefix overview routes. Embedded controls must not activate the row, and the supplied opener is returned to the owner for focus recovery.
- Member drill-down callers supply the resolved scoped IDs. The shell strips that dimension from browser-controlled URL filters and reapplies it, so its entity filter cannot be cleared or broadened by the transaction toolbar.
- When a drill-down search changes with a transaction or entry overlay open, update the background and overlay URL states synchronously; do not briefly render the overlay-less background.
- Selecting a member from a transaction routes to that member's drill-down and replaces the scoped filter; selecting another entity kind adds an ordinary transaction filter.
- The member drill-down route owns the identity header; Category and Tag leaf/group routes use the household-flow report feature.

## Boundaries

- Owns: reference search URL helpers, FQN tree derivation and presentation, and the shared drill-down browser shell.
- Does not own: entity resource loading, mutation refresh fan-out, route registration, or ledger resource lifecycle.
