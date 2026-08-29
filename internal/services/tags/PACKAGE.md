# github.com/mishamsk/mina/internal/services/tags

## Purpose

- Owns tag lifecycle, hierarchy behavior, and reference validation.

## Implicit Contracts

- Each service instance keeps a process-local reference snapshot for FQN hierarchy and reference checks. Tag mutations hold the app-wide exclusive reference lease through persistence and cache publication; dependent writes use the corresponding shared lease, and direct persistence changes must invalidate the snapshot.
- Active tag FQNs cannot prefix one another. Restructure atomically rewrites an active subtree, rejecting destination conflicts and moves into a group’s own subtree.
- Both ID and exact-FQN validation require callers to explicitly allow hidden active tags. Returned references retain FQN for dependent projections.
- Groups derive from every active leaf, including hidden leaves; a group is hidden only when all its leaves are hidden.
- Featured state belongs only to leaves; groups neither store nor derive it.
- Path hide/unhide changes active leaves at or below the path and invalidates the reference snapshot.
- Active journal, template, and recurring records block tombstoning. List deleteability uses the same predicate, and tombstoned tags are never deletable.
- Display labels are derived at the service boundary through the shared rule; restructure preserves stored overrides while automatic labels follow rewritten FQNs.
- Picker reads use the reference snapshot, retain active hidden selections and literal exact-FQN matches, derive navigation-only groups from eligible leaves, allow creation only for record assignment, and return at most 20 backend-ranked unselected rows; requested selections are returned separately without consuming the result bound.

## Boundaries

- Owns: tag lifecycle rules, FQN hierarchy validation and derivation, display-label handling, picker contexts and bounds, active-reference validation, and tag error mapping.
- Does not own: fuzzy text primitives, persistence, or transport details.
