# internal/x/lease

## Purpose

- Owns app-agnostic context-aware coordination leases and composes ordered acquisition.

## Implicit Contracts

- `Combine` acquires leases in slice order, propagates each ownership scope through context, runs the inner closure once, and unwinds leases in reverse order.
- Each `Lease` owns its mutex and serves as its context identity. Compatible re-entry skips reacquisition; exclusive ownership satisfies nested shared or exclusive requests, while shared-to-exclusive upgrades return `ErrUpgrade`.
- A lease context is valid only during its callback. Callers must join concurrent work that uses it before returning and must not retain it for later use.

## Boundaries

- Owns lock selection, immutable ownership values keyed by exact leases, and ordered closure composition; callers own ordering policy, callback lifetime, and side effects.
