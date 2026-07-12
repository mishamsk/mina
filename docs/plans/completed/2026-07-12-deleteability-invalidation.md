# Plan: Deleteability invalidation after transaction mutations (Kata 9985)

Fix the stale-deleteability bug: reference-entity `deletable` flags come from list APIs, and the frontend never invalidates those snapshots after transaction mutations, so (repro) deleting `bank:Chase:fees`'s only transaction leaves the account's Delete action blocked until a full reload. Enforce the existing frontend-architecture refresh rule ("after create, update, delete, or bulk operations, refresh or invalidate affected resource snapshots") for transaction mutations against the reference lists.

## Plan Context

- Kata issue: `9985`.
- MANDATORY pre-reads: `docs/frontend-architecture.md` (REST data access / refresh rules / Zustand store conventions), `docs/TESTING.md`.
- Scope: TRANSACTION mutations invalidating REFERENCE-LIST snapshots (accounts, categories, tags, members — all four carry `deletable` in list responses). Deliberately OUT of scope (owned by the next fleet task): the category-picker cache refetch-while-mounted bug (`0wet`) and register-page snapshot write guards (`6kcn`) — do not touch picker caches or register snapshot guard logic here.
- Design direction:
  - Find every transaction-mutating flow: row quick-delete and detail-panel delete (`deleteTransactionById`), entry-panel create/replace (spend/shorthand/advanced/split/duplicate), recurring occurrence confirm/dismiss (they post/tombstone generated transactions), and any bulk endpoints already wired. Prefer ONE central choke point (e.g. the shared api/ledger mutation helpers or a small "transactionsMutated" notifier) over per-page copies.
  - On success, invalidate the accounts/categories/tags/members list snapshots (whatever store modules hold them — follow the `invalidateX` store conventions) so mounted pages refetch and next visits fetch fresh. If those stores lack invalidate actions, add them per the store rules (action helpers usable outside components).
  - Do NOT over-fetch: invalidation should mark stale + trigger refetch for mounted consumers; avoid four eager fetches on every keystroke-level mutation if a lighter existing pattern (refetch-on-mount + notify) fits. Match whatever refresh pattern the codebase already uses after reference-entity mutations (e.g. member hide refetch).
- e2e (acceptance from the issue): on demo data, delete `bank:Chase:fees`'s only transaction (via the transactions page row quick-delete), then WITHOUT reloading: the accounts page row Delete action is enabled and works, and the edit-panel Delete is enabled and works. Audit coverage: one equivalent assertion for a category (or tag/member) whose last referencing transaction is deleted (create the fixture via API per existing spec patterns).
- Docs: update `frontend/src/api/PACKAGE.md` or relevant feature PACKAGE.md if the invalidation contract is non-obvious. No ground-truth doc edits. No PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: Central invalidation of reference snapshots on transaction mutations

- [x] Implement per Plan Context (choke point + store invalidations).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `9985` (`kata comment 9985 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: e2e coverage

- [x] Acceptance e2e per Plan Context (account repro + one category/tag/member audit case).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `9985`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Deleteability invalidation (kata 9985): transaction mutations (delete/create/replace/recurring confirm-dismiss/bulk) invalidate accounts/categories/tags/members list snapshots through one central choke point per frontend-architecture refresh rules, so deletable flags are current without reload; picker caches and register snapshot guards deliberately untouched (0wet/6kcn own those); e2e proves the bank:Chase:fees repro (row + panel delete without reload) plus one category audit case"`
- [x] Move this plan to `docs/plans/completed/`
