# frontend/src/lib

## Purpose

- Owns small frontend-library support helpers.

## Implicit Contracts

- Compose conditional Tailwind classes with `cn`: it flattens class values and
  resolves conflicting utilities, so supported caller overrides replace a
  component default instead of both classes being retained.

## Boundaries

- Owns: frontend-library helpers, not UI primitives or components.
- Does not own: browser side effects, route behavior, API configuration, or
  product behavior.
