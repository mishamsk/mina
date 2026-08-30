# Plan: Reuse entity ranking across discovery and management (Kata pxr9)

## Goal

Replace backend picker use cases with entity-owned ranked search, reuse the same matching policy for canonical Account, Category, Tag, and Member list filtering, and make Web UI pickers, management screens, the command palette, CLI, and MCP consume the appropriate read contract without duplicating ranking or entity eligibility.

## Constraints

- Keep two entity-read concepts: list returns full DTOs in canonical sort with filters, totals, and pagination, while search returns a caller-bounded ranked candidate projection. Do not add a generic entity dispatcher, cross-entity REST union, or generic entity service.
- Search is entity-owned and accepts a required typed context and `limit` from 1 through the existing 500-row entity safety ceiling, plus optional `q`, `include_hidden`, `exclude_ids`, and, for hierarchical entities, `parent_fqn`; Account search retains exchange and bulk-replacement inputs. Add the general `navigation` context to all four entities.
- Search responses contain only ordered leaf/group candidates and `has_more`; they expose neither scores nor selected/current items, creation affordances, or eligible counts. Stable IDs, exact-FQN retention, hidden policy, group derivation, context eligibility, and deterministic ties remain backend-owned.
- List `q` controls membership through the shared normalization, terms, and match tiers but never relevance order. Existing typed filters intersect with `q`, filtered totals precede pagination, and active implicit-group matches include their matching descendants so management trees can reconstruct ancestor context.
- Selected picker values remain frontend/form state and resolve through existing entity reads or owning resource snapshots. `exclude_ids` prevents selected leaves from returning as candidates; hidden current values remain displayable without becoming fresh choices.
- Account, Category, and Tag creation availability is a separate Web-UI-only advisory read for one proposed FQN, with stable false reasons `invalid_fqn`, `path_conflict`, and the Account-only `reserved_namespace`; create mutations repeat the same authoritative validation.
- Transaction templates, recurring definitions, transaction/journal free-text search, transaction-filter DSL semantics, embeddings, and RFM are out of scope.

## Success Criteria

- [x] Account, Category, Tag, and Member REST/service contracts expose list and ranked search semantics, Account/Category/Tag expose creation availability, and no picker-named backend contract or fixed 20-row service policy remains.
- [x] Entity lists combine `q` with their typed filters, report filtered totals and pages, and retain requested canonical FQN/name sorting; hierarchical group matches expand to eligible descendants without relevance-ordering management results.
- [x] Management screens send URL-owned search and typed filters to list APIs, load every filtered page needed by the bounded dataset, and render only matched leaves plus ancestor groups in canonical order without client substring matching.
- [x] The shared `EntityPicker` keeps selected values locally, requests `limit=6`, renders search order unchanged, excludes selected leaves, offers separate availability-backed creation only where enabled, and shows a type-to-narrow affordance instead of a long scrolling result list when `has_more` is true.
- [x] The command palette discovers Account, Category, Tag, and Member leaves/groups through the four navigation searches using a viewport-derived total bound, while CLI and MCP expose ranked search with descriptions that distinguish it from exhaustive list/filter workflows.
- [x] OpenAPI, generated Go and TypeScript clients, generated CLI/MCP catalogs, app/browser coverage, hierarchy and Web UI semantics, package contracts, and `PROJECT_STATE.md` describe only the final list/search/picker composition.
- [x] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-30-pxr9-reuse-entity-ranking.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Before closing the issue, a final read-only implementation subagent audits the completed work against the entire `pxr9` design, including every noted decision, and confirms it was applied consistently; document any deviation and its rationale when implementation-time context reveals that the planned design should change.
- [x] Close Kata issue `pxr9` with the implementation commits and validation evidence.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Reuse shared matching for canonical list filtering

Extend `internal/x/fuzzyrank` with the narrow match-classification/membership capability needed by lists, keeping normalization, effective-title/FQN/segment terms, typo cutoffs, and subsequence behavior in one implementation. Add optional `q` to the four entity list service and OpenAPI inputs; apply typed filters and shared membership before `total_count` and pagination, then retain requested canonical sorting. For hierarchical entities, match active implicit-group terms and union their eligible descendant leaves; tombstoned rows may match their own terms but do not create groups. Make Account type filtering accept repeated values so the existing multi-type management filter can travel through REST, while single-value requests remain valid. Regenerate owned clients/catalogs and update list descriptions and touched package contracts.

- [x] App-boundary coverage proves shared title/FQN/segment and Member-name membership, group-descendant expansion, intersections with visibility and entity-specific filters, canonical ascending/descending sorts, filtered totals, and page boundaries without duplicating the complete ranking matrix per entity.
- [x] Run `just openapi` and `just frontend-openapi`; generated artifacts and explicit list exposure decisions are current.
- [x] Commit as `feat(search): reuse entity matching in list filters`.

### Task 2: Add entity-owned ranked search and creation availability

Introduce typed `Search` use cases in the existing Account, Category, Tag, and Member services by extracting the current picker eligibility, hierarchy, hidden/exact-FQN, and candidate mapping behavior rather than layering a second implementation over it. Preserve every current context input, rename transaction-owned Account bulk facts around search, add `navigation`, replace selected IDs with excluded IDs, enforce caller limits, and compute `has_more` without leaking scores. Add Account/Category/Tag creation-availability reads that reuse the same FQN, active prefix-conflict, and reserved-namespace checks as create. Define `/search` and `/creation-availability` operations per entity, expose searches through CLI/MCP with discovery-focused descriptions, exclude availability from those surfaces, and regenerate all owned clients and catalogs. Until Task 5 migrates every picker caller, any compatibility picker path must be a thin adapter over these use cases and must not retain separate ranking or availability rules.

- [x] Replace `internal/apptest/runtime/picker_test.go` with backend-first search/availability coverage: one representative complete tier/order/tie/exact-FQN matrix plus focused per-entity contexts, parent scope, exclusions, hidden behavior, caller limits/`has_more`, Account bulk facts, stable availability reasons, and standard errors.
- [x] App tests prove advisory availability and create mutation validation agree for valid, invalid, conflicting, and reserved Account FQNs.
- [x] Run `just openapi` and `just frontend-openapi`; search is exposed independently in both generated client surfaces and availability has explicit durable exclusions.
- [x] Commit as `feat(search): add ranked entity discovery APIs`.

### Task 3: Move management search to filtered list APIs

Key the Account, Category, Tag, and Member management resources by normalized `q`, visibility, and their URL-owned typed filters, and have the API adapters follow `total_count` across every 500-row filtered page. Keep Account balance/nonzero presentation local after server membership, continue using group-state reads where needed for canonical hidden metadata, and derive displayed ancestor paths only from the returned leaves so no orphan groups appear. Pass backend-filtered leaves into the shared reference/account tree renderers without a second substring filter or relevance sort, preserving cached-snapshot, mutation-refresh, loading, empty-state, focus, and URL behavior.

- [x] Focused browser scenarios for all four screens prove request wiring, typed-filter intersection, multi-page accumulation, effective-title or group matches, ancestor reconstruction, canonical hierarchy/name order, and stale-response handling; they do not duplicate backend matching tiers.
- [x] Remove `accountSearchMatches`, `fqnSearchMatches`, `memberSearchMatches`, and equivalent management-only substring paths, and update the affected frontend package contracts.
- [x] Commit as `feat(frontend): use server-filtered management lists`.

### Task 4: Use ranked entity discovery in the command palette

When a non-transaction query is present, issue the four entity searches with `navigation`, the palette's hidden-discovery policy, and a bound derived from the live results viewport. Group candidates by entity surface, preserve each backend sequence including leaf/group ordering, and apply one deterministic palette-owned total-row policy without rescoring. Route leaves and implicit groups to their existing Account, Category, Tag, and Member destinations, keep static commands/templates/actions and apostrophe transaction search behavior intact, and discard stale search responses. Remove the account-only FQN scorer and account-group lookup dependency while retaining ledger lookups needed only to enrich transaction results.

- [x] Browser coverage proves all four entity kinds and hierarchical groups are wired, backend order is retained, the viewport-derived total bound is supplied and enforced, keyboard/focus behavior remains intact, and loading/empty/error/stale states are coherent.
- [x] Update command-palette, API, and relevant frontend package contracts without moving ranking or eligibility into the browser.
- [x] Commit as `feat(palette): use ranked entity discovery`.

### Task 5: Recompose pickers and remove obsolete picker contracts

Change the entity loaders and shared `EntityPicker`/multi-picker contract so callers provide locally resolved selected options, search inputs, and optional creation-availability composition. Send selected IDs only as `exclude_ids`, never prepend the selected leaf to returned candidates, request six result rows, render backend order unchanged, and show a non-option type-to-narrow message on `has_more` without an internally scrolling result list. Query availability only for creation-enabled Account, Category, and Tag call sites and the complete current FQN; keep creation mutations authoritative and preserve hierarchy navigation, exact-FQN selection, retained hidden values, multi-select batching, request races, keyboard, screen-reader, and focus behavior. Replace bulk Account eligible-count copy and selected-item revalidation with bounded-result wording and ordinary submit-time validation. After every caller uses search, delete picker routes, schemas, service types/helpers, adapters, generated surface decisions, fixed limits, selected-item round trips, and `can_create` coupling, then update `docs/hierarchy-semantics.md`, `docs/webui-design.md`, `PROJECT_STATE.md`, and every touched package contract.

- [x] Focused browser coverage proves the six-row bound and `has_more` narrowing message, local single/multi selections including hidden values, excluded selected candidates, separate availability/create wiring, and representative hierarchy/keyboard behavior; backend ranking matrices remain app-test owned.
- [x] Repository search finds no obsolete picker operation, DTO, selected-item transport, frontend scorer, fixed 20-result policy, or stale picker-owned backend documentation for these four entities.
- [x] Run `just openapi` and `just frontend-openapi`, then perform the plan-wide validation commands from Success Criteria.
- [x] Commit as `refactor(pickers): compose entity search and local selection`.
