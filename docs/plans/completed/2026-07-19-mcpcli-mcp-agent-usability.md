# Plan: MCP agent usability — top-level server instructions, curated tool descriptions, agent-workflow audit

Make Mina's MCP surface genuinely agent-usable: the server declares top-level instructions covering Mina's accounting model, preferred workflows, and safety rules; tool descriptions are curated for agent discovery through the config-owned description override the architecture already permits; and the semantic-shortcut and bounded-results properties of the surface are audited with recorded per-operation dispositions.

## Plan Context

- Ground truth: `docs/cli-mcp-architecture.md` (read the MCP Surface and Exposure Policy sections — the instructions, curated-descriptions, bounded-results, and no-router rules are already stated there; the description-override permission is "Descriptions default to OpenAPI text but may be overridden for CLI or agent use"). Also `docs/architecture.md`, `docs/TESTING.md`, `VISION.md` (product character, for instructions content), `docs/data-model.md` and domain semantics docs in `docs/` (accounting model facts). Do not edit any ground-truth document.
- The MCP SDK exposes `mcp.ServerOptions.Instructions`; the initialize result carries it to clients. Both transports funnel through `newServer` in `internal/mcpserver/server.go`, so instructions land on stdio and Streamable HTTP automatically.
- Tool names stay as configured (`<group>_<name>`, already domain-prefixed and unique); renames are in scope only if the audit finds a genuinely ambiguous or undiscoverable name, and each rename must be recorded with its reason.
- `api/openapi.yaml` edits are limited to adding or fixing genuinely missing/weak operation and parameter description text; no path, schema, parameter, response, or operationId changes of any kind. Regenerate all downstream generated code afterward (`just openapi`).
- Typed per-operation tools remain the only surface — do not add a generic operation-router tool, and do not add new validation layers; REST stays the behavior boundary.
- No new test classes or boundaries: e2e additions go into the existing `cmd/mina/cli_smoke_test.go` + `cmd/mina/testdata/script/mina_mcp.txt` boundary.
- `internal/tools` has no tests; validate surfacegen changes via the smoke checks below, compilation, and `just pre-commit`.
- Protect / do-not-regress: exposure decisions in `api/client-surfaces.yaml` (states, names, groups, annotations, run-wait blocks stay untouched); generated exact-set and freshness checks; MCP annotations; origin validation; stdio protocol-clean stdout; the reshaped e2e scripts.

## Tasks

### Task 1: Support per-surface description overrides in the surface config

Implement the description override the architecture permits: an optional `description` field on the `cli:` and `mcp:` exposure blocks in `api/client-surfaces.yaml`, decoded and validated by surfacegen (non-empty when present; rejected on excluded entries), flowing into the generated per-surface catalogs so an override replaces the OpenAPI-derived description for that surface only. CLI help and MCP tool descriptions must pick the surface's effective description up without further changes (they already read the catalog fields).

- [x] Deliver the config field, surfacegen decoding/validation/emission, and regenerated catalogs (no overrides set yet in this task — the mechanism must be a no-op until config uses it, proven by byte-identical regenerated descriptions).
- [x] Smoke-verify: an override on an exposed MCP entry changes only that tool's generated description; an empty `description:` and a description on an excluded entry both fail `-check` with clear findings; revert the smoke edits.
- [x] `just surface-check`, `just test`, and `just pre-commit` pass.
- [x] Commit the task as `Support per-surface description overrides in client surfaces`.

### Task 2: Declare top-level MCP server instructions

`internal/mcpserver` owns a hand-written instructions text set on `mcp.ServerOptions.Instructions` in `newServer`, served identically over stdio and Streamable HTTP. Content requirements (source facts from `VISION.md`, `docs/data-model.md`, and the domain semantics docs — do not invent semantics):

- The first ~512 characters are a self-contained summary for clients that truncate: what Mina is (local-first double-entry personal finance for one household), what the tools operate on (accounts, categories, tags, members organized as `:`-separated FQN hierarchies; transactions made of balanced journal records), and the one safety headline (prefer read/list tools; destructive tools are annotated and tombstone or permanently alter household state).
- The remainder covers preferred workflows: search/list before creating or mutating; use the shorthand transaction tools (spend, income, refund, transfer) for simple entries and the full transaction tools for multi-record journals; use server-computed totals and balances tools instead of client-side aggregation; keep list/search calls bounded with limits and server-side filters; amounts are decimal strings and dates are ISO 8601; the recurring-occurrence review queue is the confirm/dismiss workflow for expected transactions.
- Safety rules: never call destructive or bulk-mutating tools without explicit user intent; respect hidden-resource defaults (hidden entities are excluded unless explicitly included).

Also update `internal/mcpserver/PACKAGE.md` (instructions ownership) and add a one-line `PROJECT_STATE.md` entry under implemented client surfaces.

- [x] Deliver the instructions wired through `newServer`, the PACKAGE.md and PROJECT_STATE.md updates, and an e2e assertion in the existing MCP boundary proving the initialize result carries the instructions (a stable distinctive phrase asserted from the script or checked as a system-level fact in the connect helper — keep it non-brittle, not a full-text match).
- [x] `just test`, `just test-integration`, and `just pre-commit` pass.
- [x] Commit the task as `Declare top-level MCP server instructions`.

### Task 3: Curate MCP tool descriptions and record the agent-workflow audit

Audit every exposed MCP operation's effective description as an agent would see it (`group_name` + description + parameter descriptions from the generated schema) and fix weaknesses:

- Similar tools must carry clear use-when distinctions — at minimum disambiguate: transaction `list` vs `search` vs register/journal-record queries; `get` vs `list`; shorthand spend/income/refund/transfer vs full transaction creation; totals vs balances; template vs recurring-definition vs transaction tools; background-operation status/run/trigger tools. Prefer `mcp.description` overrides in `api/client-surfaces.yaml`; fix text in `api/openapi.yaml` only where the OpenAPI description itself is missing or wrong for every consumer.
- Parameter descriptions: sweep the generated MCP schemas for parameters with empty or unhelpful descriptions and fix them at the OpenAPI source (description text only).
- List/search tools: descriptions must steer agents toward bounded queries — mention the limit/filter parameters and defaults where they exist. Where a list operation genuinely lacks server-side bounding, record it as a finding; do not change REST behavior.
- Record the audit in this plan file before archiving it: a per-group disposition table or list covering every exposed MCP operation — kept-as-is / override-added / openapi-text-fixed — plus the semantic-shortcut confirmation (spend, income, refund, transfer, totals, balances exposed on both CLI and MCP with discoverable names) and any bounded-results findings.

#### Recorded agent-workflow audit

All 83 exposed MCP operations were reviewed as `<group>_<name>` plus effective description and generated input schema. Every tool received a surface-specific override; OpenAPI edits below are parameter/property description text only.

| Group | Per-operation disposition |
| --- | --- |
| accounts | `accounts_create` (override-added), `accounts_create_credit_limit` (override-added), `accounts_delete` (override-added), `accounts_delete_credit_limit` (override-added), `accounts_get` (override-added), `accounts_get_credit_limit` (override-added), `accounts_list` (override-added), `accounts_list_balances` (override-added), `accounts_list_credit_limits` (override-added), `accounts_list_groups` (override-added), `accounts_restructure` (override-added), `accounts_set_hidden` (override-added), `accounts_update` (override-added) |
| categories | `categories_create` (override-added), `categories_delete` (override-added), `categories_get` (override-added), `categories_list` (override-added), `categories_list_groups` (override-added), `categories_restructure` (override-added), `categories_set_hidden` (override-added), `categories_update` (override-added) |
| exchange_rates | `exchange_rates_create` (override-added), `exchange_rates_delete` (override-added), `exchange_rates_get` (override-added), `exchange_rates_list` (override-added), `exchange_rates_update` (override-added) |
| members | `members_create` (override-added), `members_delete` (override-added), `members_get` (override-added), `members_list` (override-added), `members_set_hidden` (override-added), `members_update` (override-added) |
| operations | `operations_database_backup_status` (override-added), `operations_exchange_rate_loading_status` (override-added), `operations_get_database_backup_run` (override-added), `operations_get_exchange_rate_loading_run` (override-added), `operations_list` (override-added), `operations_list_runs` (override-added), `operations_start_database_backup` (override-added), `operations_start_exchange_rate_loading` (override-added) |
| records | `records_bulk_categorize` (override-added), `records_bulk_reassign_account` (override-added), `records_bulk_update_statuses` (override-added), `records_bulk_update_tags` (override-added), `records_search` (override-added), `records_search_account` (override-added) |
| recurring | `recurring_confirm_next` (override-added), `recurring_confirm_occurrence` (override-added), `recurring_create_definition` (override-added), `recurring_defer` (override-added), `recurring_delete_definition` (override-added), `recurring_dismiss_occurrence` (override-added), `recurring_get_definition` (override-added), `recurring_list_definitions` (override-added), `recurring_list_occurrences` (override-added), `recurring_pause` (override-added), `recurring_replace_definition` (override-added), `recurring_resume` (override-added) |
| tags | `tags_create` (override-added), `tags_delete` (override-added), `tags_get` (override-added), `tags_list` (override-added), `tags_list_groups` (override-added), `tags_restructure` (override-added), `tags_set_hidden` (override-added), `tags_update` (override-added) |
| transaction_templates | `transaction_templates_create` (override-added), `transaction_templates_delete` (override-added), `transaction_templates_get` (override-added), `transaction_templates_list` (override-added), `transaction_templates_replace` (override-added), `transaction_templates_restructure` (override-added) |
| transactions | `transactions_cancel` (override-added), `transactions_create` (override-added), `transactions_create_income` (override-added), `transactions_create_refund` (override-added), `transactions_create_spend` (override-added), `transactions_create_transfer` (override-added), `transactions_delete` (override-added), `transactions_get` (override-added), `transactions_list` (override-added), `transactions_month_totals` (override-added), `transactions_replace` (override-added) |

- Semantic shortcuts confirmed on both generated surfaces with discoverable names: CLI `transactions create-spend`, `create-income`, `create-refund`, `create-transfer`, and `month-totals` plus `accounts list-balances`; MCP `transactions_create_spend`, `transactions_create_income`, `transactions_create_refund`, `transactions_create_transfer`, `transactions_month_totals`, and `accounts_list_balances`.
- Parameter sweep: every generated MCP input property now has meaningful OpenAPI-owned description text; nullable descriptions are retained on the MCP property rather than only its non-null schema branch.
- Bounded results: pagination-capable list/search tools expose `limit` (1-500), `offset`, and applicable server filters; overrides instruct agents to supply a limit because the REST schemas declare no limit default.
- Unpaginated findings: `accounts_list_groups`, `categories_list_groups`, and `tags_list_groups` return all implicit active groups and can only filter hidden state; `accounts_list_balances` returns all active balance-account currencies but can filter `account_ids`; `operations_list` returns the finite registered-operation catalog. No REST behavior changed.
- Typed per-operation tools remain the only MCP surface; no generic router tool or tool rename was added.

- [x] Deliver the curated descriptions (config overrides and OpenAPI text fixes), regenerated catalogs and OpenAPI artifacts, and the recorded audit in this plan.
- [x] Confirm no exposure state, name, group, annotation, or run-wait block changed in `api/client-surfaces.yaml` (diff shows only added `description` fields), and no OpenAPI structural change (diff shows only description text).
- [x] `just test`, `just test-integration`, and `just pre-commit` pass.
- [x] Commit the task as `Curate MCP tool descriptions for agent discovery`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test`, `just test-integration`, and `just pre-commit` pass on the final state.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "MCP agent usability: top-level server instructions on ServerOptions.Instructions served over both transports with e2e assertion; per-surface description overrides in client-surfaces.yaml implemented in surfacegen and used to curate MCP tool descriptions for agent discovery; OpenAPI edits are description text only; no exposure/name/group/annotation/run-wait changes; no generic router tool; audit dispositions recorded in the plan."`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
