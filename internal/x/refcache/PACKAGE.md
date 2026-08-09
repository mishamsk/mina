# internal/x/refcache

## Purpose

- Owns small, app-agnostic, in-process caches for lazily loaded reference snapshots and values.

## Implicit Contracts

- Load results are never evicted automatically; a failed load is not cached and is retried by a later read.
- A loaded `Dictionary` treats absent keys as authoritative and never loads individual misses.
- Concurrent loads coalesce under the first caller's context and share its result; later callers cannot substitute or cancel that load.
- `Invalidate`, and `Put` or `Modify` while unloaded, discard an in-flight load result; the read retries so it cannot publish a snapshot that predates the change.
- `Put` and `Modify` do not stage entries while unloaded. Callers that need a mutation reflected in cache must first load it or rely on the next full load.
- Returned maps and dictionary loader maps are copied only at the map level; element values, and `Value.Get` results, may alias cached data and must not be mutated.
- `Dictionary.Modify` calls its callback while locked; callbacks must not re-enter that dictionary.

## Boundaries

- Owns in-memory cache state and load coalescing; caller-provided loaders own all external side effects.
- Does not own domain validation, persistence, or transport mapping.
