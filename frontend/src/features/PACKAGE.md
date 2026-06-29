# frontend/src/features

## Purpose

- Owns Mina-specific product-area UI and behavior that is not a top-level route.

## Implicit Contracts

- Feature code must use configured API operations instead of handwritten REST paths.

## Boundaries

- Owns: feature components, feature hooks, and feature helpers for one workflow area.
- Does not own: shared API setup, global store wiring, or route registration.

## Testing Notes

- No package-specific testing notes.
