# Plan: Do not assign pending timestamps to directly posted manual transactions (Kata `5qah`)

Directly posted manual transactions and their records carry no pending timestamp — the lifecycle reflects only stages that actually occurred. Genuinely pending records keep pending timestamps and transition correctly when posted. The REST contract, schema, persistence, and all generated client surfaces agree on nullable pending timestamps.

## Plan Context

- Kata issue: `5qah` — "Do not assign pending timestamps to directly posted manual transactions" (P2, backend/api, bug). Frontend lifecycle display work is a separate follow-up issue (`e222`) — this plan only makes the backend truth correct and keeps the existing UI rendering tolerant of null pending timestamps.
- Current defect (verified): `fillMissingPendingDates` (`internal/services/transactions/transactions.go:1362`) unconditionally defaults every record's `PendingDate` to the initiated date, so a manual transaction created directly as `posted` is persisted and returned with a pending timestamp for a stage it never passed through. The schema enforces this: `journal_record.pending_date TIMESTAMP NOT NULL` (`internal/store/migrations/00008_create_transaction_and_journal_record.sql`, mirrored in `docs/data-model.md:245`), and `api/openapi.yaml` documents `posted_date` as "use pending_date for manual non-bank records".
- Target semantics (the issue's acceptance, generalized to the lifecycle model): a record's `pending_date` is set only when the record actually has (or had) a pending stage — i.e. the caller supplied a pending timestamp, or the record was created in `pending` posting status (defaulting then to the initiated date as today). Records created directly as `posted` get `pending_date` NULL and a populated `posted_date`. Records that enter `pending` and later post retain their pending timestamp and gain `posted_date` on transition (existing transition behavior preserved). `expected` records have neither. Explicit caller-provided pending timestamps remain accepted on any status that can carry them (a posted record that genuinely passed through pending may carry both).
- Schema change policy: pre-production evergreen migrations — fold the `pending_date` nullability into the original create migration `00008_create_transaction_and_journal_record.sql` in place; never add an ALTER migration. Recompute `PinnedMigrationContentHash` (`internal/store/db_validation.go:23`) via the repository's validation flow.
- Contract propagation: `api/openapi.yaml` (`pending_date` nullable on record read/write schemas; fix the `posted_date` description; check `pending_date_from`/`pending_date_to` filter descriptions — null records simply never match), then regenerate every generated surface through the owning Justfile recipes (`just openapi`, frontend client regeneration, and the CLI/MCP surface generators). Handwritten generated-code edits are forbidden.
- Ripple points to cover (verify each): store row types and mapping (`internal/store/transactions.go`), shorthand entry paths (`internal/services/transactions/shorthand.go`), posting-status transition endpoints, recurring occurrence confirm (`internal/services/recurring/recurring.go`) which materializes posted transactions, demo seed data, and the transaction replace path. Service-layer validation must reject a `pending`-status record without a derivable pending timestamp only if such a state is actually unreachable — prefer deriving, not erroring.
- Frontend scope (minimal): the existing detail-panel/register lifecycle rendering must tolerate `pending_date: null` (rendering its existing "unreached" dash treatment per `docs/webui-design.md`'s lifecycle-strip rule) without crashes or bogus "Invalid Date" output. Full local-time rendering work stays in `e222`.
- Docs to update in the same commits as the changes they describe: `docs/data-model.md` (column definition and comments), `api/openapi.yaml` descriptions, and any package docs stating the old rule (`internal/services/transactions/PACKAGE.md`, `internal/store` docs if they repeat it).
- Read before implementing: `docs/architecture.md`, `docs/TESTING.md` (mandatory before writing/modifying any tests — no unit tests; use the repository's test classes), `docs/data-model.md`, `api/openapi.yaml`, `docs/accounting-semantics.md` for lifecycle vocabulary.
- Validation surface: `just pre-commit`, `just test`, `just test-integration` (REST/JSON behavior changes), `just test-frontend-e2e` (generated frontend client and lifecycle-adjacent rendering change).

## Tasks

### Task 1: Contract and schema — nullable pending timestamps

End state: the OpenAPI contract and DuckDB schema express nullable `pending_date`; all generated surfaces are regenerated; the pinned migration hash is updated; `docs/data-model.md` matches.

- [x] Make `pending_date` nullable in `00008_create_transaction_and_journal_record.sql` (evergreen in-place fold, no new migration), update the column comments to the new lifecycle rule, recompute the pinned migration hash, and update `docs/data-model.md`.
- [x] Update `api/openapi.yaml` record schemas and descriptions; regenerate server, Go client, CLI/MCP surfaces, and the frontend client via the owning Justfile recipes; generated-code freshness checks pass.
- [x] Commit the task as `feat(api): make journal record pending_date nullable`.

### Task 2: Service semantics — assign pending only for real pending stages

End state: creation, shorthand, replace, posting-status transition, and recurring-confirm paths persist pending timestamps only per the target semantics; directly posted manual records round-trip with `pending_date` null and correct `posted_date`; genuinely pending records keep today's behavior.

- [x] Replace the unconditional `fillMissingPendingDates` defaulting with stage-aware assignment per the target semantics in Plan Context, covering create, replace, shorthand, and recurring-confirm paths; update store mapping for nullable values.
- [x] Backend coverage per `docs/TESTING.md` for: direct manual post (no pending timestamp, posted populated), created-pending then posted (pending retained, posted set), explicit caller-provided pending on a posted record (retained), expected records (neither), and pending-date range filters ignoring null records.
- [x] Update `internal/services/transactions/PACKAGE.md` (and any other doc stating the old always-filled rule) in the same commit.
- [x] Commit the task as `fix(transactions): assign pending timestamps only to records with a pending stage`.

### Task 3: Integration and frontend tolerance

End state: REST integration behavior is covered end to end and the existing UI renders null pending timestamps as unreached.

- [x] `just test-integration` covers/passes the manual directly-posted and genuinely-pending lifecycles over real HTTP (add coverage if the existing suite lacks it).
- [x] Verify the transaction detail lifecycle strip and account-register peek render a directly posted transaction with the pending stage as unreached (dash) and no invalid-date artifacts; adjust only what nullability breaks and add/adjust the minimal frontend e2e assertions. `just test-frontend-e2e` passes.
- [x] Commit the task as `test(integration): cover nullable pending lifecycle end to end`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-27-5qah-no-pending-direct-post.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `5qah` with `kata close 5qah --done --message "<summary>" --commit <sha> --test "just test; just test-integration; just test-frontend-e2e" --agent`.
