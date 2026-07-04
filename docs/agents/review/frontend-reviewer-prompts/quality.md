Review frontend code for bugs and quality problems, with React-specific rigor.

## Correctness Review

1. Effect correctness - missing or wrong dependency arrays, stale closures over state or props, missing cleanup for listeners, timers, observers, subscriptions, and in-flight requests.
2. Async races - responses applied out of order, state updated after the owning surface closed or unmounted, fetches fired for ids that were just cleared or deleted, refetch racing navigation. Supported flows must not emit console errors or failed requests.
3. State modeling - derived data stored in state and drifting from its source, duplicate sources of truth, effects that exist only to sync one piece of state to another instead of computing during render.
4. Rendering mechanics - unstable or index list keys where order changes, controlled/uncontrolled input switching, conditional hook calls.
5. Store conventions - object/array/Map/Set selectors without `useShallow`, action helpers unusable outside components, mutations hidden inside React-only hooks (see `docs/frontend-architecture.md` Zustand rules).
6. Error handling - rejected promises surfaced to the user or an error state, no silently swallowed catch blocks, no unhandled rejection paths in event handlers.

## Security

1. User or API content rendered with `dangerouslySetInnerHTML` or interpolated into HTML/URLs without escaping.
2. Secrets, tokens, or non-public endpoints hardcoded into the bundle.

Do not demand memoization or other performance work without a demonstrated problem, and do not flag import-boundary violations; ESLint owns package boundaries.

Report problems only - no positive observations.
