# frontend/src/utils

## Purpose

- Owns pure shared frontend helpers.

## Implicit Contracts

- Lifecycle timestamp helpers apply the canonical [day-precision lifecycle-marker rule](../../../docs/webui-design.md#dates-and-statuses); the marker distinction does not apply to non-lifecycle timestamps.

## Boundaries

- Owns: deterministic utility functions.
- Does not own: browser side effects, React state, generated API setup, or route behavior.

## Testing Notes

- No package-specific testing notes.
