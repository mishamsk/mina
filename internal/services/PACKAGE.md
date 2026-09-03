# github.com/mishamsk/mina/internal/services

## Purpose

- Provides shared service-layer errors, timestamp ETags, list values, creation-availability values, display-label rules, and fully qualified name (FQN) hierarchy helpers.

## Implicit Contracts

- Expected invalid-request, missing-resource, conflict, and precondition-failure outcomes must be returned as `*services.Error`; `internal/httpapi` maps only that type to stable API errors, so services translate repository sentinel errors before returning them to adapters.
- Timestamp ETags are canonical quoted UTC `updated_at` values; malformed strong validators are invalid requests, while well-formed noncanonical or stale validators are failed preconditions.
- FQN containment and conflicts respect colon-segment boundaries, not arbitrary string prefixes; changing that matching would merge unrelated paths.
- Shared FQN search helpers treat an omitted parent as unscoped, an explicit empty parent as root-only, and a nonempty parent as direct-child scope; they remove the active parent prefix before ranking and derive final-segment labels for entity-owned candidates.
- FQN validation permits literal asterisks.
- FQN group state is derived from the supplied active leaves: groups are hidden only when all leaves below them are hidden, hidden groups are omitted unless requested, and results are lexically ordered.
- Explicit display labels are non-empty and whitespace-exact; account, category, and tag services derive the shared final-one-or-two-FQN-segments fallback only at their service boundaries.
- `PaginatedList.TotalCount` is populated only when `ListOptions.IncludeTotalCount` is true; a zero value otherwise does not indicate an empty result.
- Service-owned filtering may request a canonically sorted unpaged repository result, then apply shared pagination so totals describe the filtered membership rather than the persistence predicate alone.

## Boundaries

- Owns: shared service-layer error vocabulary, list and creation-availability values, and pure FQN and display-label helpers.
- Does not own: domain-specific use cases, provider contracts, persistence, transport mapping, or cache lifecycle.
