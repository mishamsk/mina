# github.com/mishamsk/mina/internal/services/members

## Purpose

- Owns household-member use cases, reference validation, and repository contracts.

## Implicit Contracts

- Reference validation uses a process-local snapshot cache; writes keep a loaded snapshot current, and out-of-band changes must invalidate it before later validation.
- Member creation, rename, visibility change, and tombstoning hold the app-wide exclusive reference lease through persistence and cache publication; dependent writes use the corresponding shared lease.
- Only active members are valid references; both ID and exact-name validation require explicit opt-in for hidden members. Returned references retain the member name for dependent projections.
- Default lists omit hidden and tombstoned members, while `Get` can return tombstoned members when requested.
- List results set `Deletable`: tombstoned members and members with active journal-record, template-record, or recurring-definition references are not deletable; Delete rejects the latter and otherwise tombstones.
- Member lists intersect visibility and shared name membership before totals and pagination while preserving the requested canonical name or timestamp sort.
- Search reads use the complete active reference snapshot, apply navigation, record-assignment, or transaction-filter context, exclude hidden members unless `IncludeHidden` is set, omit requested leaf IDs, and return caller-bounded flat rows in shared backend rank order with `has_more`.

## Boundaries

- Owns: member lifecycle and name rules, ranked search contexts, active-reference validation, and deleteability policy.
- Does not own: fuzzy text primitives, persistence or dependency-usage queries, the reference-coordinator implementation, or transport mapping.
