# Plan: Manifest-driven settings page (Kata wk80)

> Superseded by the approved read-only Settings design in `2026-07-20-wk80-read-only-settings-fix.md`. Mutation, live application, and explicit persistence are deferred to Kata `ma8r`.

Add a Settings destination that shows every TOML-backed Mina setting and builds its groups and controls from a backend-owned manifest. Editable changes must validate and persist safely, while static policy, environment/CLI precedence, and pending-restart behavior remain visible and truthful.

## Plan Context

- Add `docs/settings-architecture.md` as the focused cross-cutting source of truth and link it only from affected package docs; do not add it to `AGENTS.md` or make it a routine pre-read.
- The existing nested `fileConfig` structs and their tags are the single definition of persistent settings. Extend those tags with group and field presentation metadata, walk them to build the manifest, and reject incomplete tags; do not add a parallel catalog that can drift from TOML loading.
- The manifest is a purpose-built typed contract, not JSON Schema or arbitrary JSON. Appconfig and OpenAPI expose named group/field/option types plus a finite control-kind enum: `text`, `integer`, `boolean`, and `select`. Groups, ordering, labels, help, constraints, and static editability derive from struct tags; dynamic options and runtime state are joined through typed fields.
- Initial manifest coverage and static UI policy:

  | Group | Settings | Control and static policy |
  | --- | --- | --- |
  | Storage and startup | `db`, `schema`, `startup_validation` | Read-only text; editable select populated from schemas in the selected database; editable select |
  | HTTP server | `serve.host`, `serve.port`, `serve.access_log` | Read-only text, integer, and text |
  | Exchange rates | `exchange_rates.automatic_loading_enabled`, `exchange_rates.load_schedule_utc`, `exchange_rates.startup_provider`, `exchange_rates.frankfurter.base_url` | Editable boolean, text, select, and text |
  | Backups | `backups.file.directory`, `backups.file.retention_count`, `backups.file.schedule_utc` | Editable text, integer, and text |

- Static read-only policy and runtime policy compose: every setting still appears, but any effective environment or CLI override is also read-only and names the overriding source. An unavailable or unwritable config target similarly disables mutation with an actionable reason.
- Track effective source as `default`, `config_file`, `environment`, or `cli_override`. Expose both the active value and the persisted next-start value when they differ, so the page can show pending restart without implying that a browser refresh applies process config.
- Config discovery precedence becomes explicit `--config-file`, then `XDG_CONFIG_HOME/mina/config.toml`, then a platform fallback. macOS deliberately uses `$HOME/.config/mina/config.toml` via `os.UserHomeDir`, while other platforms use `os.UserConfigDir`; isolate this discovery change in the first implementation task.
- Keep definition and state APIs separate: `GET /api/settings/manifest` returns typed groups, fields, controls, constraints, and option definitions; `GET /api/settings` returns current values, sources, editability, and pending-restart state. `PATCH /api/settings` accepts a typed list of `{setting_key, value}` updates using canonical string values, validates one complete candidate, persists it in one atomic write, and returns refreshed settings state.
- `internal/appconfig` is the repository-like settings backend: it owns config-file creation, read/modify/write, TOML serialization, locking, and effective-source tracking. The settings service owns use cases and dynamic option enrichment while reusing runtime's config validation boundary rather than duplicating schedule, provider, retention, or startup-validation rules.
- The settings service receives the accounting-schema store through its service-owned repository interface and supplies those choices to appconfig for mutation validation. Runtime's store involvement is limited to composition, and schema listing has no separate REST endpoint.
- Unknown update keys and invalid candidates return `400`, read-only/write conflicts `409`, and persistence failures `500`; failed requests leave the file and active runtime unchanged.
- Data flow is `appconfig/store backends -> settings service -> OpenAPI/httpapi -> generated frontend client -> generic setting renderers`; updates return through service-supplied options, candidate validation, and locked atomic TOML persistence.
- This issue does not live-reconfigure the process. Editable changes are restart-required and the UI says to restart Mina, not hard-refresh the browser. Kata `ma8r`, blocked by `wk80`, owns replacing restart prompts with safe live config reload.
- Browser-local UI preferences remain owned by IndexedDB and are outside this server manifest. No current persistent setting is secret; adding secret-valued config requires an explicit settings-architecture extension that prevents plaintext disclosure.

## Tasks

### Task 1: Establish default config-file discovery

Make ordinary local startup resolve a concrete config target before adding settings mutation. Keep this commit limited to discovery, help, package documentation, and its process-boundary proof.

- [x] Resolve config files in precedence order: explicit path, `XDG_CONFIG_HOME`, macOS `$HOME/.config`, then the non-macOS `os.UserConfigDir` result; missing files remain valid and expose the resolved future write target.
- [x] Update appconfig help and `internal/appconfig/PACKAGE.md` with the platform behavior without changing cache discovery or source precedence.
- [x] Add one launched-process integration test covering default discovery on the current platform plus explicit/XDG precedence.
- [x] Run `just pre-commit`, `just test`, and `just test-integration`.
- [x] Commit the task as `feat: add default config file discovery`.

### Task 2: Deliver typed settings manifest, state, and mutation APIs

Extend `internal/appconfig` into the product-owned persistent-settings boundary while preserving its inward dependency rules. Obtain schema choices through a new service, expose separate typed definition and state contracts through OpenAPI, and keep behavioral coverage primarily at the app-test REST boundary.

- [x] Add `docs/settings-architecture.md` and concise affected `PACKAGE.md` links/contracts for struct-tag ownership, typed manifest derivation, source tracking, service-backed dynamic options, validation, and locked atomic persistence; do not change `AGENTS.md`.
- [x] Extend the nested appconfig file structs with complete manifest tags for all 13 TOML-backed fields and derive typed groups, fields, controls, constraints, static options, and static read-only policy directly from them, with construction failing for missing or invalid metadata.
- [x] Track effective and persisted values, pending restart, environment/CLI read-only reasons, and config-target writability; let appconfig own private first-write creation, TOML preservation/serialization, locking, candidate validation, and atomic replacement.
- [x] Add the internal `accountingschemas` service and store repository, wire it through runtime composition as the schema field's dynamic option provider, and exclude system schemas without exposing this internal service over REST.
- [x] Add typed `GET /api/settings/manifest`, `GET /api/settings`, and atomic batch `PATCH /api/settings` contracts and generated Go/frontend clients.
- [x] Cover manifest derivation, all setting states, sources/read-only reasons, schema options, valid batch persistence and re-read, cross-field validation, and rejected read-only/invalid writes through focused app-test REST scenarios.
- [x] Add at most one additional launched-process integration test proving REST mutation persists privately and reports effective versus pending state across restart; together with Task 1, the plan must contain no more than two integration tests.
- [x] Run `just openapi`, `just frontend-openapi`, `just pre-commit`, `just test`, and `just test-integration`.
- [x] Commit the task as `feat: add typed settings APIs`.

### Task 3: Build the manifest-rendered Settings destination

Add a thin `/settings` page and a feature-owned settings workflow. The feature may dispatch only on generated control kind; it must not branch on setting keys, group names, or current manifest contents.

- [x] Add generic setting-group and text/integer/boolean/select field renderers that consume manifest labels, help, constraints, options, values, and read-only/restart metadata while following the shared page-header, loading, form, feedback, accessibility, and Arcade Cabinet rules.
- [x] Fetch and join the separate typed manifest and settings state through generated clients, retain dirty drafts on failure, submit only changed editable fields as one batch, refresh returned state, and clearly show source overrides, read-only reasons, validation failures, saved pending values, and the Mina-restart requirement.
- [x] Enable Settings in the pinned sidebar, register `/settings`, and add the existing command-palette Settings action without introducing handwritten REST paths or DTOs.
- [x] Add focused frontend e2e coverage for navigation, all four generic controls, server-provided grouping/options, static and override-driven read-only states, successful batch save, retained drafts and feedback on failure, and pending-restart presentation; assertions must not encode field-specific rendering logic beyond fixture expectations.
- [x] Update the Settings section of `docs/webui-design.md`, the new settings feature package doc, and `PROJECT_STATE.md` to reflect the delivered server-driven operational settings surface while keeping UI preferences client-owned.
- [x] Run `just pre-commit`, `just test`, and `just test-frontend-e2e`.
- [x] Commit the task as `feat: add manifest-driven settings page`.

### Task 4: Prove writable and durable settings in the supported Docker deployment

Use the existing writable config bind rather than adding a second persistence mechanism. Extend the lifecycle proof so Compose source overrides and restart behavior match the manifest contract.

- [x] Extend `scripts/docker-service-test.sh` to verify all settings remain visible, fixed database/listener fields report their effective override/read-only state, an editable file-backed setting is changed through REST, and the private config-file change survives container restart and recreation before becoming effective.
- [x] Update `docker/PACKAGE.md` only where the settings API adds a durable deployment contract; keep the existing fixed database path, listener environment, read-only root, and independent config bind unchanged.
- [x] Run `just test-docker`.
- [x] Commit the task as `test: cover persisted Docker settings`.

### Task 5: Restore the service-owned settings boundary

Route the completed settings behavior through a normal app-owned service so the REST adapter never reaches into source-loaded app config. Keep appconfig as the file/source backend and let runtime compose the backend with the existing accounting-schema store.

- [x] Add `internal/services/settings` with service-owned manifest, state, update, and error contracts plus narrow config-backend and accounting-schema repository interfaces; the service must own dynamic schema-option enrichment and expose the use cases consumed by HTTP.
- [x] Keep TOML discovery, manifest-tag derivation, source tracking, validation, locking, and atomic persistence in appconfig behind the repository-like backend; adapt and compose it with `store.AccountingSchemaStore` in runtime without making appconfig import services or store.
- [x] Change `internal/httpapi` to depend only on the settings service and its types, remove the now-redundant `accountingschemas` service, and restore the depguard rule forbidding HTTP adapters from importing appconfig.
- [x] Update the affected package and settings architecture docs so the durable flow is store/appconfig backends → settings service → HTTP adapter.
- [x] Preserve the existing REST and frontend behavior through the focused settings scenarios, then run `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e`.
- [x] Commit the task as `refactor: route settings through service`.

## Success Criteria

- [ ] Every task's stated outcome and acceptance conditions are complete.
- [ ] `just openapi-check`, `just frontend-openapi-check`, `just pre-commit`, `just test`, `just test-integration`, `just test-frontend-e2e`, and `just test-docker` pass.
- [x] Every TOML-backed setting carries complete manifest tags, appears exactly once in the derived typed manifest, and renders without setting-key-specific frontend code.
- [ ] Static policy, environment/CLI precedence, validation, atomic persistence, private file creation, schema options, pending restart, and Docker durability match `docs/settings-architecture.md`.
- [ ] Planned commits are present and the worktree is clean.
- [ ] With a clean worktree run `just review-loop "Manifest-driven Settings page (kata wk80): config discovery isolated first; all 13 TOML-backed settings derive a typed manifest from struct tags and render through four generic controls; separate manifest/state APIs; db and HTTP statically read-only; env/CLI overrides dynamically read-only; schema options flow store repository -> settings service while appconfig remains the locked atomic TOML backend; HTTP has no appconfig dependency; at most two integration tests; macOS defaults to ~/.config; live reload deferred to ma8r; Docker persistence covered"`; resolve findings, rerun affected validation, and commit the fixes.
- [ ] Move this plan to `docs/plans/completed/` and commit the move.
- [ ] Close Kata issue `wk80` with the implementation commits and validation evidence; leave follow-up `ma8r` open and unblocked by the closure.
