# Plan: Use display labels and shared Go ranking in entity pickers (Kata 8r2c)

## Goal

Make every existing account, category, tag, and member picker show the effective display title, preserve the full FQN for identity and disambiguation, and consume its applicable entity-owned backend picker API backed by a shared Mina-agnostic fuzzy-matching layer and, only if useful, a shared ranking service above it that can later accept richer relevance inputs without changing picker callers.

## Constraints

- Cover the current shared entity-picker consumers in transaction entry and edit, transaction Edit mode, transaction-filter value selection, template editing, and recurring-definition editing; do not expand into command-palette search, transaction free-text search, reference-list search, template picking, other entity inputs reserved for `yebr`, or transaction-filter matching semantics.
- FQNs and stable IDs remain authoritative for identity, hierarchy, exact selection, REST writes, and serialized filter values; `name` remains the FQN leaf, while non-unique display labels affect picker presentation and discovery only.
- The existing `accounts`, `categories`, `tags`, and `members` services each own their picker use case and typed API, including context interpretation, candidate lookup, semantic eligibility, hidden/selected policy, hierarchy-group derivation, entity metadata, result bounds, and entity-shaped errors. Do not add one generic picker service, backend entity-kind dispatcher, picker-owned repository, or shadow entity service.
- Share only text normalization, match-tier classification, and deterministic ordering over entity-neutral candidate inputs. Entity services adapt their qualified domain candidates into that abstraction, invoke the shared logic, and map its ordered output into their own picker results; the shared logic must not load data or know Mina entity kinds, picker contexts, eligibility rules, hierarchy behavior, service state, or transport types.
- A focused `internal/x` package must wrap `github.com/lithammer/fuzzysearch/fuzzy` and own the Mina-agnostic normalization and match primitives. At implementation time, either keep the complete shared tier and ordering policy in that package for entity services to invoke directly or add one narrow shared service-layer ranker above it for any common Mina-aware cutoff, tie-break, or future-relevance policy. An optional shared ranker remains a dependency of the entity services and must not become a generic picker use case or own data access, entity dispatch, picker contexts, eligibility, hierarchy behavior, or transport contracts.
- The frontend owns query interaction, hierarchy navigation, loading/error state, rendering, and selection without filtering or rescoring backend results.
- Use only `github.com/lithammer/fuzzysearch/fuzzy` for subsequence and one-edit behavior, with a small documented normalization, cutoff, tier, and deterministic tie-breaking policy; add no semantic, transaction-history, recency/frequency, cache, or background-refresh work owned by `45bk`.
- Preserve exact-FQN selection, navigable non-selectable groups, inline creation where currently allowed, multi-select batching, selected hidden values, broader-surface hidden toggles, URL/shareable filter state, and existing keyboard and screen-reader behavior.
- Add an upgrade migration for category/tag overrides, regenerate repository-owned API and schema artifacts through `just`, make an explicit CLI/MCP exposure decision for the picker operations, and update `PACKAGE.md` for every touched package; do not hand-edit generated outputs.

## Success Criteria

- [ ] Category and Tag create/get/list/update contracts expose a required effective `display_label` and nullable `display_label_override`; explicit values validate like Account labels, clearing restores the final-one-or-two-FQN-segments fallback, and restructure preserves overrides while recalculating fallbacks.
- [ ] Typed, bounded, entity-owned picker contracts for accounts, categories, tags, and members each return their eligible ordered leaf and group options, including effective title, complete FQN context for hierarchical entities, hidden state, and applicable entity detail; entity errors and invalid contexts use the standard API error path.
- [ ] Matching considers effective title, complete FQN, and every FQN segment, ordering exact matches before prefix, substring, one-edit, and normalized case-folded subsequence matches, then breaking ties deterministically by title, FQN, and ID; matching groups remain navigation-only.
- [ ] Every in-scope picker caller invokes the applicable entity-specific backend contract with its typed current context, current selections, and hidden policy, and no caller or frontend helper duplicates domain eligibility or ranking.
- [ ] Picker rows, selected values, and committed filter chips lead with the effective title and retain the complete FQN as visible, tooltip, and accessible disambiguation where applicable, without changing exact filter serialization.
- [ ] App tests cover category/tag display-label persistence and migration plus shared picker ranking, all four entity APIs, context eligibility, hidden/selected rules, groups, and errors; browser coverage is limited to category/tag control wiring and one representative shared-picker title/FQN/keyboard flow, with redundant matching and caller matrices removed.
- [ ] `docs/hierarchy-semantics.md`, `docs/webui-design.md`, `PROJECT_STATE.md`, and owning package docs describe the final behavior without creating a parallel backlog or future-only abstractions.
- [ ] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [ ] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-29-8r2c-picker-display-ranking.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [ ] Close Kata issue `8r2c` with the implementation commits and validation evidence.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Establish Category and Tag display-label parity

Create the required v17 migration fixture from clean `main` before adding the next migration, then add nullable Category and Tag override storage and carry it through stores, cached service references, REST DTOs, generated clients, and the existing category/tag side-panel forms. Reuse one service-owned validation and fallback rule across Account, Category, and Tag; keep overrides unchanged during FQN restructure and derive effective labels only at the service boundary. Update the canonical schema artifact, migration hash and coverage, hierarchy semantics, and package contracts in the same change.

- [ ] App-boundary scenarios prove create/read/list/update/clear, whitespace validation, one- and multi-segment fallback, explicit-label preservation, fallback recalculation after restructure, and a v17-to-current migration that preserves existing rows with automatic labels.
- [ ] Minimal category/tag browser scenarios prove each form initializes from the stored override, sends explicit and clear-to-null values, retains invalid input with field feedback, and refreshes returned labels.
- [ ] Commit as `feat(references): add category and tag display labels`.

### Task 2: Expose entity-owned picker APIs with shared ranking

Add picker methods/use cases to the existing `accounts`, `categories`, `tags`, and `members` services. Each entity service owns its typed picker contexts, active-candidate loading, semantic eligibility, hidden/selected exceptions, navigable group candidates, entity metadata, result bounding, and final response mapping. Where a picker context needs facts owned by another service, such as transaction-specific account eligibility, compose that existing capability behind a narrow service-owned contract without moving the picker API out of the entity service.

Add a focused `internal/x` wrapper around `github.com/lithammer/fuzzysearch/fuzzy` for Mina-agnostic normalization, normalized case-folded subsequence matching, and Levenshtein one-edit matching over entity-neutral inputs. Then either keep the complete shared tier and ordering policy in `internal/x` for each entity service to invoke or add one narrow shared service-layer ranker that consumes the `internal/x` primitives and operates on entity-neutral candidate/search interfaces. Choose between those two shapes during implementation based on whether any common cutoff, deterministic tie-break, or future-relevance policy remains meaningfully Mina-aware. In both shapes, implement the exact/prefix/substring/one-edit/subsequence policy once and keep data access, entity fields, picker contexts, eligibility, hierarchy-group construction, service errors, and transport types out of the shared logic.

Define only the entity-specific contexts required by current callers: ordinary record assignment, shorthand account role and category intent, exchange currency exclusion, transaction-filter selection, and bulk account source/replacement. Expose separate generated `GET` REST operations for the four entity-owned picker APIs so type-ahead requests do not enter the non-GET mutation audit path; do not introduce a generic entity-kind request or union context. Responses should distinguish leaf/group rows and provide display-ready title, complete FQN where applicable, hidden state, applicable entity detail, and any creation eligibility needed to preserve existing inline creation. Explicitly exclude these Web-UI support operations from CLI and MCP catalogs while retaining ordinary entity list operations for those surfaces, and keep HTTP mapping free of eligibility or scoring decisions.

- [ ] App-boundary coverage proves the exact/prefix/substring/one-edit/subsequence tiers and deterministic ties through one representative entity API, then exercises entity-specific eligibility, group navigation candidates, current-selection retention, hidden policy, and standard errors across all four APIs without duplicating the ranking matrix per entity.
- [ ] Each participating entity-service package, the required `internal/x` fuzzy-matching package, and any optional shared ranking-service package document their data-serving, context, eligibility, and matching/ordering boundaries, while the entity-specific public contracts leave a narrow seam for `45bk` to add relevance inputs without changing picker callers.
- [ ] Commit as `feat(pickers): add entity-owned ranked APIs`.

### Task 3: Make shared frontend pickers consume backend options

Refactor the shared `EntityPicker`/`EntityMultiPicker` so callers provide an entity-specific typed option loader or adapter, current selections, hidden policy, and existing creation configuration instead of prefiltered option arrays. The shared component must not dispatch an entity-kind union to a generic backend picker; the owning feature adapter invokes the applicable generated entity API. The component should discard stale responses, preserve typed text and hierarchy interaction through loading and errors, render effective titles before full-FQN detail, keep groups navigational, and retain returned selected options for single- and multi-select presentation.

Migrate the existing callers in `entry-panel.tsx`, `transaction-edit-dock.tsx`, `transaction-filter-controls.tsx`, `template-editor-modal.tsx`, and `definition-editor-panel.tsx`; remove their option shaping, account/category eligibility, local ranking/group derivation, and the intent-specific category-picker cache that the entity-owned backend contracts replace. Keep the broader ledger lookup snapshot only for non-picker record rendering and draft transformations, and keep filter values serialized as exact FQNs, member names, or stable-ID literals while displaying effective titles.

- [ ] Transaction entry/edit, bulk edits, filter selection, templates, and recurring definitions preserve creation, hidden/selected behavior, multi-select batching, exact-FQN escape hatches, error recovery, and keyboard/screen-reader interaction while using returned backend order unchanged.
- [ ] Consolidate frontend tests to one representative shared-picker flow for returned title/FQN presentation and keyboard selection plus UI-only creation/layering/focus wiring; remove backend ranking, matching, hidden-policy, and cross-caller repetitions now proven by app tests.
- [ ] Update the owning Web UI contract, frontend/package contracts, and `PROJECT_STATE.md` to make backend eligibility/ranking and effective-title presentation the current documented behavior.
- [ ] Commit as `feat(frontend): use backend-ranked entity pickers`.
