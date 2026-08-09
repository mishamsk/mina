# frontend/src/features

## Purpose

- Owns Mina-specific product workflows and workflow-local UI behavior composed by route pages.

## Implicit Contracts

- Mutations invalidate or refresh every affected feature snapshot and lookup consumer; browser snapshots are disposable views, never accounting truth.
- URL-owned workflow state preserves unrelated query parameters so independently composed route and feature interactions coexist.
- Closing or mutating an overlay restores focus to its opener or a surviving, package-defined fallback.

## Boundaries

- Owns: feature components, feature hooks, and feature helpers for one workflow area.
- Does not own: route registration or route-level parameter validation (`pages`), shared API setup, global store wiring, persistence, or generic reusable UI.
