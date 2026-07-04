Detect over-engineered and overcomplicated frontend code - code that works but is more complex than necessary. YAGNI ruthlessly.

## Excessive Abstraction

- Wrapper components or hooks that add nothing - just forward props or wrap a single call
- Custom hook for one call site - logic used once that could live in the component
- Context/provider where props suffice - global plumbing for one or two consumers
- HOCs or render props where plain composition with children works

## Premature State Lifting

- Global store modules for state one component owns - local `useState` suffices
- Same state duplicated across URL, store, and component state without one owner
- Draft/preference persistence for state nobody needs across sessions

## Premature Generalization

- Prop or variant explosion with no second caller - components configurable for uses that do not exist
- Config objects for 2-3 options - direct props suffice
- Generic "system" components built for a single concrete screen

## Unnecessary Effects and Optimization

- `useEffect` that only computes values derivable during render, or mirrors props into state
- `useMemo`, `useCallback`, or `React.memo` without a measured problem
- Virtualization, debouncing, or custom caching for small bounded data
- Hand-rolled cache/invalidation layers on top of the documented refetch-after-mutation rules

## Dependency Creep

- New libraries for what React, existing dependencies, or documented patterns already provide
- A second data-fetching or server-state layer alongside the documented API entry points

## Unnecessary Fallbacks

- Fallback UI or code paths that can never trigger
- Dual implementations - old + new rendering paths when the old one has no callers

Do not flag patterns mandated by `docs/frontend-architecture.md` or the design docs as over-engineering - URL query state, refetch-after-mutation, Zustand module conventions, and the single shared tooltip/overlay treatments are required, not optional complexity.

Report problems only - no positive observations.
