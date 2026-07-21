# frontend/src/features/settings

## Purpose

- Owns the server-driven operational Settings viewer.

## Implicit Contracts

- Fetches one immutable startup snapshot through the generated Settings read operation.
- Dispatches value formatting only on generated `SettingControlKind`; setting keys and group names remain opaque.

## Boundaries

- Owns: settings loading/failure behavior and text/integer/boolean/select value presentation.
- Does not own: setting definitions, source resolution, mutation, persistence, UI-only preferences, or handwritten REST types.
- See `../../../../docs/settings-architecture.md` for the backend-owned settings contract.

## Testing Notes

- Browser coverage lives in `frontend/tests/e2e/settings-page.spec.ts` and uses a server-shaped fixture so presentation stays key-agnostic.
