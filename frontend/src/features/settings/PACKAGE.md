# frontend/src/features/settings

## Purpose

- Owns the read-only viewer for the server's startup settings snapshot.

## Implicit Contracts

- Treat setting keys, groups, labels, help, ordering, values, and sources as server-owned metadata; dispatch value presentation only on generated `SettingControlKind`.
- Fetch on entry and explicit retry only; keep the failure state in place until retry rather than caching or persisting the snapshot.
- On retry, restore focus to the first loaded group or Retry after the result, unless the command palette currently owns focus.

## Boundaries

- Owns: settings loading, retry/failure behavior, snapshot presentation, and focus recovery.
- Does not own: the `/settings` route, setting definitions or source resolution, mutations, persistence, UI-only preferences, or handwritten REST types.
- See `../../../../docs/settings-architecture.md` for the backend-owned settings contract.
