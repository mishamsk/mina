# github.com/mishamsk/mina/internal/services/authentication

## Purpose

- Separates online authentication from CLI-only authentication administration.

## Implicit Contracts

- `online` authenticates against an immutable long-running startup snapshot; `administration` mutates authentication state, which takes effect online only after restart.
- The peers do not import one another and own distinct provider contracts.

## Boundaries

- Owns: authentication use cases and the split between online and administrative lifecycles.
- Does not own: concrete authentication-state storage, config, transport authentication policy, CLI rendering, or runtime composition.
