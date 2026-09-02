# frontend/src/features/featured-balances

## Purpose

- Loads and renders featured account standings for the active navigation surface.

## Implicit Contracts

- Account-link activation notifies the owning navigation surface so compact overlays close after navigation.
- Navigation consumers coalesce an initial featured-balance load; explicit refreshes supersede pending work. The newest load may publish after its initiating surface unmounts while another consumer remains mounted, while unmounting the last consumer invalidates and releases the load so an authenticated-shell teardown cannot publish stale data.

## Boundaries

- Owns: featured-balance snapshots, refresh behavior, and balance-strip presentation.
- Does not own: account routes, app-shell overlay state, or backend balance semantics.
