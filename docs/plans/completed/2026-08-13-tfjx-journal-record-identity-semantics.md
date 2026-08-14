# Plan: Preserve journal-record identity across transaction updates (Kata tfjx)

## Goal

Implement identity-aware complete transaction replacement across the service, store, REST API, generated clients, CLI/MCP surfaces, and browser so retained journal records keep durable identity and provenance while the transaction remains the atomic validation boundary.

## Decision Context

- The current complete `PUT` is easy to implement by tombstoning every active journal record and inserting replacements, but that turns record IDs into incarnation IDs, resets record timestamps, and can orphan application-level dependants such as raw importer metadata and record links.
- Narrow bulk mutations already preserve record identity, so preserving explicitly supplied record IDs during complete replacement removes the accidental lifecycle asymmetry without introducing generic patch semantics.
- Complete replacement remains useful because callers still submit and validate one prospective transaction aggregate; identity-aware reconciliation changes persistence semantics, not the aggregate boundary.
- Import provenance describes a genuine external record and must stay attached to that record identity. Imported legs therefore cannot be split, merged, omitted, or have their provenance rewritten through ordinary replacement, although their permitted accounting fields may still be edited in place.
- An update may replace a manually entered leg with a new imported leg when an external importer later matches the real-world record. That is a new identity with creation-time provenance, not a provenance mutation of the old manual identity.
- Raw importer metadata and record links are application-enforced referential-integrity relationships rather than database foreign keys. The transaction service owns the decisions, and persistence must apply their checks and mutations atomically with the journal-record change.
- Tombstoned journal rows remain implementation storage for lifecycle integrity, not a supported version-history or audit API.

## Constraints

- Keep `PUT /transactions/{transaction_id}` as a complete desired-state operation; do not add generic JSON Patch, JSON Merge Patch, positional matching, or server-side record matching heuristics.
- Model update records as two mutually exclusive shapes: an existing-record mutation requires a valid `record_id` belonging to the target transaction and excludes `source`, `external_id`, and `external_system`; a new record omits `record_id` and accepts the same writable fields and provenance validation as transaction creation.
- Continue accepting creation-time provenance through full transaction creation and new records in complete update, including `source=imported`, paired external identifiers, and caller-supplied `amount_usd`, across REST, generated clients, CLI, and MCP.
- Require imported records, defined by `source=IMPORTED` or attached active raw importer metadata, to remain one retained record with the same ID. Permit manual legs around them to be added or removed, and never copy or transfer their metadata.
- Reject ordinary removal of a journal record with an active record link. Whole-transaction deletion may tombstone affected record links atomically; raw importer metadata remains attached to its tombstoned source record.
- Keep all existing whole-transaction invariants, including minimum record count, per-currency balance, references, valuation, settlement/lifecycle, and classification checks.
- Preserve stored `amount_usd` for an unchanged retained amount/currency pair; apply the existing initiated-date inference contract to new records and retained records whose amount or currency changes without an explicit valuation.
- Use the canonical transaction `updated_at` value directly as a strong ETag. Complete replacement requires a matching `If-Match`; a missing precondition returns HTTP 428, a mismatch returns HTTP 412, material changes assign the normal current timestamp, and exact no-ops retain the existing timestamp and ETag.
- Keep concurrency control proportional to Mina's coupled database and services in one process: one atomic store comparison is sufficient; do not add a revision field, synthetic monotonic timestamps, logical clocks, distributed locks, or separate idempotency state.
- Preserve timestamp meaning: `created_at` is identity creation, `updated_at` is the last material change, and `tombstoned_at` is identity removal. Exact no-ops do not advance timestamps.
- Do not reconstruct lineage for existing tombstoned records, expose version history, or turn the API audit log into a durable event store.
- Do not add database foreign keys for importer metadata or record links. Enforce these relationships through the transaction service and atomic persistence boundary.
- Keep historical rationale in this plan and durable internal contracts in affected `PACKAGE.md` files. Do not change `docs/accounting-semantics.md` or `docs/architecture.md`; update `docs/webui-design.md` only for observable editor and conflict behavior.

## Success Criteria

- A complete update retains supplied active record IDs, rejects foreign or duplicate IDs, creates IDs only for new records, and tombstones only omitted removable records in one atomic operation.
- Existing records keep creation-time provenance and reject provenance input; new records in both create and update requests can supply valid importer provenance through REST, generated clients, CLI, and MCP.
- Imported records cannot be split, merged, omitted, or have raw metadata reassigned, and linked records cannot be removed by ordinary update; whole-transaction deletion leaves the database valid under the documented lifecycle rules.
- Record and transaction timestamps reflect material lifecycle events, and exact no-ops leave timestamps unchanged.
- Transaction responses expose the canonical `updated_at` ETag, complete updates require it through `If-Match`, all material nested mutation paths change the timestamp normally, and missing or stale preconditions return HTTP 428 or 412 without partial effects.
- Existing transaction validation remains authoritative over the complete prospective aggregate, including valuation inference and reference serialization.
- The browser carries record IDs and the transaction's timestamp-backed ETag through shorthand, advanced, split, and row-amount edit paths; it preserves a recoverable draft on stale-write conflict and does not offer imported-leg split/merge actions the backend will reject.
- OpenAPI and all generated Go/TypeScript, CLI, and MCP descriptions express the existing-record/new-record update shapes without removing creation-time importer fields.
- App, integration, concurrency, and browser tests prove identity retention, additions/removals including new imported records, provenance protection, dependency conflicts, deletion cleanup, no-op behavior, and stale-write rejection through supported boundaries.
- Package docs describe the lasting ownership and invariants; `PROJECT_STATE.md` and user-facing web UI documentation reflect the shipped behavior without duplicating this plan's rationale.
- `just test`, `just test-race-concurrency`, `just test-integration`, `just test-frontend-e2e`, and `just pre-commit` pass; `just review-loop --plan "docs/plans/2026-08-13-tfjx-journal-record-identity-semantics.md"` reports no remaining findings.
- Kata issue `tfjx` is closed with the implementation commits and validation evidence, and this plan is moved to `docs/plans/completed/`.

## Tasks

1. **Write the durable package contracts before implementation**
   - Use `write-package-docs` to define identity-aware replacement, provenance ownership, application-level dependency integrity, timestamp preconditions/no-op behavior, and layer ownership in the affected backend and frontend `PACKAGE.md` files, including `internal/services/transactions`, `internal/store`, `internal/httpapi`, `internal/runtime` if its composition changes, and the ledger model/API packages.
   - Keep this plan as the explanation of why the prior replace-all design was rejected; keep package docs short and evergreen, and do not create or modify an accounting-semantics or architecture document.
   - Record only observable editor/conflict rules in `docs/webui-design.md` when the frontend package contract needs them; defer `PROJECT_STATE.md` until the behavior exists.
   - Run `just prose-fmt`, review the documentation diff for scope and consistency, and commit the documentation contract as one self-contained task.

2. **Deliver identity-aware persistence and the public transaction contract as one vertical change**
   - Define the strong ETag as the canonical transaction `updated_at`, expose it on transaction responses, and compare `If-Match` atomically on complete update without a schema migration or monotonic-timestamp machinery.
   - Model update records as either an existing-record mutation with `record_id` and no provenance input or a new record with the same writable shape and provenance rules as creation in the domain/service contract and `api/openapi.yaml`.
   - Replace store-wide tombstone-and-insert behavior with an atomic identity diff: update materially changed retained rows, leave exact matches untouched, create new rows with supplied creation-time provenance, tombstone omitted eligible rows, and assign the transaction timestamp once for a material aggregate change.
   - Enforce imported-metadata and record-link eligibility in the transaction service and atomically with record persistence, including record-link cleanup on whole-transaction deletion.
   - Apply the same transaction-timestamp rule to bulk category, merchant, tag, account/amount, lifecycle, deletion, restoration, and valuation-backfill paths while preserving their existing narrow semantics.
   - Regenerate Go and TypeScript API clients plus CLI/MCP surfaces, retain importer fields and descriptions for creation and new update records, remove claims that replacement always recreates records, and adapt every compiled caller to send IDs and `If-Match`.
   - Add black-box app and integration coverage for retained/new/removed IDs, new and retained provenance, `amount_usd`, no-op retries, missing/stale preconditions, concurrent writes, all transaction-timestamp mutation paths, dependency-bearing records, and atomic failure.
   - Run `just test`, `just test-race-concurrency`, `just test-integration`, `just test-frontend-e2e`, and `just pre-commit`, then commit the complete vertical contract change.

3. **Finish the browser editing experience and close the implementation**
   - Carry `record_id` and the transaction's timestamp-backed ETag through ledger baselines, shorthand drafts, advanced drafts, split allocations, and row-amount helpers; omit IDs only for newly added legs and send provenance only for those new legs.
   - Preserve imported legs as fixed identity anchors in editor transformations, disable their split/merge/removal affordances with concise explanation, and continue allowing edits to permitted accounting fields and allocation of surrounding manual legs.
   - On HTTP 412, preserve the user's recoverable draft, show that the transaction changed elsewhere, refresh the winning transaction state and ETag, and require an explicit reapply/save decision instead of silently overwriting either version.
   - Add browser coverage for retained identities across edit modes, new imported legs, imported-leg restrictions, successful timestamp refresh, and stale-conflict draft recovery; update `docs/webui-design.md`, affected frontend package docs, and `PROJECT_STATE.md` to the final observable behavior.
   - Run `just test`, `just test-integration`, `just test-frontend-e2e`, and `just pre-commit`; then run the plan-wide validation commands and the required review loop once, resolve all findings, move the plan to `docs/plans/completed/`, close Kata issue `tfjx` with evidence, and commit the completed task.
