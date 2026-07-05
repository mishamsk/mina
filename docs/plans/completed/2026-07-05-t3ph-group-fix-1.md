# Plan: Account group pages — operator review fixes (fix plan 1) — Kata issue `t3ph`

Address two LOW findings from the operator architectural audit of branch `t3ph-group-pages`. Narrow, implementation-only cleanup in `frontend/src/features/accounts/accounts-tree.tsx`.

## Plan Context

Do not run review-loop.

Findings to fix (both in `frontend/src/features/accounts/accounts-tree.tsx`):

1. `accounts-tree.tsx:379` — the account-row `<Link>` renders `<FqnPath value={row.fqn} />` with the default `focusable=true`, creating a redundant nested tab stop inside an already-focusable link. Group rows were already fixed (`:404` passes `focusable={false}`); account rows must match.
2. `accounts-tree.tsx:106` — `hasChildren` is computed by scanning `[...visibleNodeFqns]` inside the per-row map, making row-model construction O(n²) in the number of visible nodes. Precompute the set of FQNs that have children in a single pass (e.g. derive each node's parent prefixes once), then do an O(1) lookup per row.

Protect — do not regress:

- Group rows keep `focusable={false}` on their `FqnPath` (`accounts-tree.tsx:404`).
- Row order, depth, and which rows show the Group link must be unchanged: `hasChildren` must be true for exactly the same rows as today.
- Keyboard navigation and focus-visible styling on the tree links.
- All existing unit and e2e suites stay green.

Scope exclusions:

- No changes to `fqn-path.tsx`, group page components, stores, routes, or any backend code.
- No changes to `docs/` other than moving this plan to `docs/plans/completed/`.
- No new dependencies, no refactors beyond the two findings.

## Tasks

- [x] Task 1: Fix both findings in one commit
  - [x] Pass `focusable={false}` to the `FqnPath` rendered inside the account-row `<Link>` (`accounts-tree.tsx:379`)
  - [x] Replace the per-row `hasChildren` scan (`accounts-tree.tsx:106`) with a precomputed has-children set built in one pass over `visibleNodeFqns`
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit

## Final Verification

- [x] Worktree clean, all suites green as recorded above
- [x] Move this plan to `docs/plans/completed/`
