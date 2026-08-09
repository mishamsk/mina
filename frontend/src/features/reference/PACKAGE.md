# frontend/src/features/reference

## Purpose

- Owns reusable reference search, tree presentation, and entity drill-down browser composition.

## Implicit Contracts

- The toolbar owns only URL parameters `q` and `hidden`: trim and omit an empty search, encode enabled hidden items as `hidden=true`, and preserve unrelated parameters.
- Tree rows come from visible matching leaves; group API data supplies group state only. Do not render orphan groups or use a group's hidden state to hide visible descendants.
- A tree activates leaf rows only. Embedded controls must not activate the row, and the supplied opener is returned to the owner for focus recovery.
- Drill-down callers supply the resolved scoped IDs. The shell strips that dimension from browser-controlled URL filters and reapplies it, so its entity filter cannot be cleared or broadened by the transaction toolbar.
- When a drill-down search changes with a transaction or entry overlay open, update the background and overlay URL states synchronously; do not briefly render the overlay-less background.
- Selecting a same-kind entity from a transaction routes to that entity's drill-down and replaces the scoped filter; selecting another kind adds an ordinary transaction filter.
- Category/Tag scope changes that close a transaction detail restore focus to the scope control; other detail closures use the ledger browser's focus recovery.
- Drill-down routes own the identity header and descendant-scope calculation; this shell starts with the scoped transaction toolbar/browser.

## Boundaries

- Owns: reference search URL helpers, FQN tree derivation and presentation, and the shared drill-down browser shell.
- Does not own: entity resource loading, descendant-scope calculation, mutation refresh fan-out, route registration, or ledger resource lifecycle.
