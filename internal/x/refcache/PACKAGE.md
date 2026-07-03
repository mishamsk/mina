# internal/x/refcache

## Purpose

- Owns small in-process cache helpers for app-agnostic reference snapshots and values.

## Implicit Contracts

- Loaded entries are never evicted except by full invalidation.
- Absence in a loaded `Dictionary` snapshot is authoritative.
- `Dictionary` write-through mutations no-op while unloaded.
- Coalesced loads run under the first caller's context.
- `Value.Get` returns the loaded value without copying; callers must not mutate reference types reachable from it.
- `Dictionary.Modify` runs its callback under the dictionary lock; callbacks must not call back into the `Dictionary`.

## Boundaries

- Owns: in-memory cache state and load coalescing.
- Does not own: app domain validation, persistence, transport mapping, or side effects beyond caller-provided loaders.

## Testing Notes

- Covered through app-tests of package consumers; no package-specific unit tests.
