# frontend/src/store

## Purpose

- Owns Zustand store modules, selectors, and persistence wiring.

## Implicit Contracts

- Store modules expose React hooks and imperative accessors.
- Store accessors must work inside and outside React components.
- Store modules expose named helper functions for mutations instead of requiring callers to mutate through React hooks.
- Helper functions use Redux-devtools-compatible action names: `StoreName/actionName`.
- Helper function names use action verbs such as `setX`, `updateX`, `clearX`, `resetX`, `hydrateX`, and `invalidateX`.
- Selector hooks that return object, array, `Map`, or `Set` values use `useShallow`.
- Store updates use immutable replacement or object spreads.
- Browser-state hydration runs before the app body renders.

Example:

```ts
export const useWidgetView = () =>
  useWidgetStore(useShallow((state) => ({ value: state.value })));

export const setWidgetValue = (value: string): void => {
  useWidgetStore.setState({ value }, false, "WidgetStore/setWidgetValue");
};
```

## Boundaries

- Owns: browser UI state stores, transient resource snapshots, selector helpers, and persistence wiring.
- Does not own: backend accounting state or IndexedDB opening/versioning details.

## Testing Notes

- No package-specific testing notes.
