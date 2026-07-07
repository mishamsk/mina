# Hierarchy Semantics

This document defines how hierarchical naming works for accounts, categories,
tags, and transaction templates: what groups and leaves are, which invariants
hold, and how every hierarchy-affecting operation behaves. It does not define
SQL migrations, REST DTO shapes, or UI screens. Table shapes are owned by
`docs/data-model.md`. Members are a flat list and are out of scope.

## Model

Hierarchy is encoded only in the colon-separated FQN string of each stored row.
Tree structure is derived at query time. There are no parent ids and no group
rows.

- A **leaf** is a stored row. Only leaves carry entity state (type, intent,
  currency, hidden, featured, template records) and only leaves can be
  referenced by other entities (journal records, template records, tag
  assignments).
- A **group** is an implicit FQN path prefix shared by one or more active
  leaves. Groups are folders: they have no row, no id, and no state of their
  own. A group exists exactly while at least one active leaf lives under it.
- **Prefix-free rule**: among the active rows of one entity type, no FQN may be
  a path prefix of another FQN. A path prefix means equal segments at a `:`
  boundary (`Food` is a prefix of `Food:Dining`, not of `Foodie`). A stored row
  is therefore always a leaf and never also a group.
- FQN comparison is case-sensitive byte equality. Uniqueness and the
  prefix-free rule apply to active rows only; tombstoned rows are exempt and
  keep their historical FQNs.

Two sanctioned exceptions reference group paths by FQN string instead of
referencing a leaf row: `budget.category_fqn`, and a possible future
featured-groups table. Any such reference is valid while at least one active
leaf of the referenced entity type exists at or under the referenced path.

## Operations and Enforcement

Every rule below is enforced by service-level validation at write time and
reported by `mina db validate` when found violated in stored data. Reference
integrity is never enforced by foreign keys.

- `mina db validate` reports prefix-free violations as errors and dangling
  `budget.category_fqn` group-path references as warnings.

### Create

- The FQN must pass shared FQN validation (non-empty segments, no stray
  whitespace or colons).
- The create is rejected with a conflict when it would violate the prefix-free
  rule: the new FQN equals an active FQN, extends an active FQN (the existing
  leaf would become a group), or is a path prefix of an active FQN (the new row
  would be a group).
- Parent groups never need to exist: creating `banks:Chase:checking` under an
  empty tree creates the `banks` and `banks:Chase` groups implicitly.
- To add a sibling under an existing leaf (e.g. add `banks:Chase:fees:extra`
  while leaf `banks:Chase:fees` exists), first rename the leaf into the group
  (see leaf-to-group below), then create.

### Rename and Move (Restructure)

Rename and move are one primitive: atomically rewrite the FQN path prefix
`from` to `to` on every active row at or under `from`. Because groups are
implicit, the operation addresses paths, not row ids, and works identically for
leaves and groups.

- The moved set is every active row whose FQN equals `from` or lives under it.
  An empty moved set is not found. Hidden leaves move with the subtree.
  Tombstoned rows are never rewritten.
- `to` must pass FQN validation and must differ from `from`. When the moved
  set is more than the single leaf at `from` (i.e. `from` addresses a group),
  `to` must not lie under `from` (a group cannot move inside its own subtree).
  When the moved set is exactly the single leaf at `from`, `to` may lie under
  `from`: that is the leaf-to-group transition.
- The destination must be **fully unoccupied**: the operation is rejected with
  a conflict when any non-moved active row lies at or under `to`, or is a path
  prefix of `to`. This forbids silent subtree merges and mixed leaf/group
  outcomes in one rule; merging subtrees requires explicit per-leaf moves.
- For categories, active `budget.category_fqn` values at or under `from` are
  rewritten in the same transaction so budgets follow the paths they reference.
- The whole operation is one database transaction: it fully succeeds or leaves
  no changes.

### Leaf-to-Group and Group-to-Leaf

- A leaf becomes a group by renaming the leaf to a path under itself
  (restructure `A:B` to `A:B:Other`). The old path remains as an implicit
  group and siblings can then be created under it. References by id follow the
  renamed leaf; nothing dangles.
- A group becomes a leaf by creating a row at its path, which the prefix-free
  rule allows only after the group has no active leaves left (the group no
  longer exists). While a group is occupied, a leaf cannot be created at its
  path.

### Delete

- Tombstoning leaves never violates hierarchy invariants. A group disappears
  when its last active leaf is tombstoned or moved away; this is accepted
  behavior, and restructure makes recreating a path cheap.
- Existing dictionary delete rules (refusing deletes with active dependents)
  are unchanged and are not hierarchy rules.

### Hidden and Featured State

- `is_hidden` and `is_featured` are leaf state. Groups have no stored flags.
- A group's hidden state is derived: a group is hidden when every active leaf
  at or under it is hidden. Hiding a group in the UI means bulk-hiding its
  leaves; leaves created later under the same group default to visible.
- Featuring applies to leaves only. Featuring a group (for grouped balances) is
  unsupported; if needed later it is a dedicated table referencing group paths
  by FQN string, the same exception class as budgets.

### Group Path References (Budget and Future Tables)

- `budget.category_fqn` may target a leaf or a group path. It is valid while at
  least one active category exists at or under that path; `mina db validate`
  reports dangling references as warnings.
- Category restructure rewrites matching budget paths in lockstep. A rewrite
  that would collide with an existing active budget row for the same path and
  month rejects the whole operation with a conflict.

## Known Trade-offs

- Deep creates can spawn unintended sibling trees on typos (`Asets:...`), and
  case variants are distinct paths. Mitigation is picker-driven path entry in
  the UI plus cheap restructure to repair; the API cannot distinguish a typo
  from a new tree.
- Group hidden state is derived, so a group with a mix of hidden and visible
  leaves is visible; there is no way to pin hidden state on the group itself.
- Groups have no identity, so nothing outside the sanctioned FQN-string
  exception tables may durably reference a group.

## Rejected Alternatives

- **Materialized group rows** (`is_group` flag in entity tables): required
  attributes (category economic intent, account type and currency, template
  records) have no honest value for a folder; creation acquires parent-chain
  ceremony; leaf/group conversions become schema state transitions; validation
  and API surface grow across all four entity services.
- **Normalized folder tables or parent-id adjacency**: parent-child structures
  make hierarchical queries cumbersome in a relational store, force a rework of
  the flat-list-with-`parent_fqn` API contract and the whole query layer, and
  the O(1) rename advantage is worthless at household scale where a prefix
  rewrite touches at most hundreds of rows.
- **Mixed leaf/group rows** (a stored row that also has descendants): makes
  every balance and list surface distinguish own-state from rolled-up state,
  invites posting to what the user thinks is a folder, and leaves group state
  ambiguous. The prefix-free rule forbids this outcome entirely.
