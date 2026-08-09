# github.com/mishamsk/mina/internal/services/members

## Purpose

- Owns household-member use cases, reference validation, and repository contracts.

## Implicit Contracts

- Reference validation uses a process-local snapshot cache; writes keep a loaded snapshot current, and out-of-band changes must invalidate it before later validation.
- Hiding or tombstoning a member is serialized with dependent writes that validate member references, preventing a validation/write race.
- Only active members are valid references; hidden active members require explicit opt-in.
- Default lists omit hidden and tombstoned members, while `Get` can return tombstoned members when requested.
- List results set `Deletable`: tombstoned members and members with active journal-record, template-record, or recurring-definition references are not deletable; Delete rejects the latter and otherwise tombstones.

## Boundaries

- Owns: member lifecycle and name rules, active-reference validation, and deleteability policy.
- Does not own: persistence or dependency-usage queries, the reference-operation serializer implementation, or transport mapping.
