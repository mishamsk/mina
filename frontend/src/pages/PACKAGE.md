# frontend/src/pages

## Purpose

- Owns top-level route screens and route-local coordination.

## Implicit Contracts

- Route-local query updates preserve parameters owned by other layers; transaction sorting resets pagination while preserving filters and overlays.
- Transaction-filter changes keep an open transaction or entry overlay visible: synchronously replace its background URL before writing the overlay URL, so the browser never renders an overlay-less intermediate state.
- A page that coordinates a local panel or restructure dialog retains its opener and restores focus on close; use the page's primary action as the fallback when that opener no longer exists.
- Category and Tag group routes use canonical `/categories/group?prefix=FQN` and `/tags/group?prefix=FQN` forms; leaf routes retain numeric IDs.
- Status owns the `tab` query parameter and keeps health cards mounted above its Background operations and Audit log feature views.
- Status tabs use roving focus with arrow, Home, and End navigation and label their shared tab panel.

## Boundaries

- Owns: route registration, route-local URL and overlay coordination, route parameter validation, and screen composition.
- Does not own: app-shell startup or route-independent transaction entry, feature resource/cache lifecycles, generated API setup, shared stores, or reusable browser-side-effect adapters.
