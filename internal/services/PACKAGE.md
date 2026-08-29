# github.com/mishamsk/mina/internal/services

## Purpose

- Provides shared service-layer errors, list values, display-label rules, and fully qualified name (FQN) hierarchy helpers.

## Implicit Contracts

- Expected invalid-request, missing-resource, conflict, and precondition-failure outcomes must be returned as `*services.Error`; `internal/httpapi` maps only that type to stable API errors, so services translate repository sentinel errors before returning them to adapters.
- FQN containment and conflicts respect colon-segment boundaries, not arbitrary string prefixes; changing that matching would merge unrelated paths.
- FQN validation permits literal asterisks.
- FQN group state is derived from the supplied active leaves: groups are hidden only when all leaves below them are hidden, hidden groups are omitted unless requested, and results are lexically ordered.
- Explicit display labels are non-empty and whitespace-exact; account, category, and tag services derive the shared final-one-or-two-FQN-segments fallback only at their service boundaries.
- `PaginatedList.TotalCount` is populated only when `ListOptions.IncludeTotalCount` is true; a zero value otherwise does not indicate an empty result.

## Boundaries

- Owns: shared service-layer error vocabulary, list values, and pure FQN and display-label helpers.
- Does not own: domain-specific use cases, provider contracts, persistence, transport mapping, or cache lifecycle.
