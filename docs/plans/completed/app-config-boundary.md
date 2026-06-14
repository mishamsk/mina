# App Config Boundary Refactor

## Plan Context

`internal/runtime/config` currently owns source-loaded configuration while `internal/runtime` also defines overlapping config structs for composition. This refactor introduces `internal/appconfig` for source-loaded app config, keeps `internal/runtime` as the composition root, and keeps CLI parsing in `cmd/mina`.

Architecture decisions:

- Start by updating `docs/architecture.md`; it must name `internal/appconfig` separately from `internal/runtime`.
- `internal/appconfig` owns source loading for app/operator settings: local paths, serve settings, log file destinations, provider settings, schedules, feature switches, defaults, config-file discovery, env parsing, source precedence, explicit overrides, and source metadata for help text.
- `internal/appconfig` does not own invocation-only behavior or live process dependencies: CLI flags, prompts, quiet mode, demo mode, open files, listeners, database handles, clocks, writers, fake providers, database lifecycle policy, service/provider option structs, domain validation, SQL, HTTP DTOs, or background runner mechanics.
- `cmd/mina`, `internal/runtime`, and `internal/apptest` may import `internal/appconfig`.
- Services, store, httpapi, background, and provider packages must not import `internal/appconfig`.
- `internal/appconfig` must not import runtime, store, httpapi, background, providers, services, Cobra, or pflag.
- Services and providers define their own config/options structs in their own packages. Runtime composition converts from `appconfig.Config` into those package-local types.

Config decisions:

- Exported app config should mirror the TOML shape. Do not flatten nested TOML tables into unrelated public fields.
- Keep `CacheDir` as a direct field on `Config`.
- Keep `Serve.AccessLogPath` under `ServeConfig`.
- Keep Frankfurter config nested under exchange-rate config.
- Keep explicit overrides as the boundary between appconfig and callers. `appconfig` should not know whether an override came from Cobra flags, a test helper, or a future presentation layer.
- Do not add alternative config provider abstractions.

Target app config shape:

```go
type Config struct {
	DatabasePath     string
	AccountingSchema string
	CacheDir         string
	Serve            ServeConfig
	ExchangeRates    ExchangeRateConfig
}

type ServeConfig struct {
	Host          string
	Port          int
	AccessLogPath string
}

type ExchangeRateConfig struct {
	AutomaticLoadingEnabled bool
	LoadScheduleUTC         string
	StartupProvider         string
	Frankfurter             FrankfurterConfig
}

type FrankfurterConfig struct {
	BaseURL string
}
```

Target override shape:

```go
type Overrides struct {
	DatabasePath     Override[string]
	AccountingSchema Override[string]
	CacheDir         Override[string]
	Serve            ServeOverrides
	ExchangeRates    ExchangeRateOverrides
}

type ServeOverrides struct {
	Host          Override[string]
	Port          Override[int]
	AccessLogPath Override[string]
}

type ExchangeRateOverrides struct {
	AutomaticLoadingEnabled Override[bool]
	LoadScheduleUTC         Override[string]
	StartupProvider         Override[string]
	Frankfurter             FrankfurterOverrides
}

type FrankfurterOverrides struct {
	BaseURL Override[string]
}
```

CLI decisions:

- Config-backed flags are `--db`, `--schema`, `--host`, `--port`, and `--access-log`; changed values become `appconfig.Overrides`.
- CLI-only flags are `--yes`, `--quiet`, and `--demo`; they do not belong in `appconfig.Config` or `appconfig.Overrides`.
- `--yes` and `--quiet` must retain environment support through `cmd/mina`, not through appconfig. Keep `MINA_YES` and `MINA_QUIET` supported and documented for those flags.
- `cmd/mina` opens access-log files from `cfg.Serve.AccessLogPath` and passes the resulting writer through runtime options. Quiet mode only affects writer selection for the current invocation.
- Port validation and the quiet/access-log conflict belong in `cmd/mina` after app config is loaded.

Runtime decisions:

- Runtime consumes `appconfig.Config` directly.
- Runtime must not define duplicate app config structs.
- Runtime keeps only live process options and test seams, such as writers, operation execution controls, clocks, and provider test seams.
- Runtime owns database lifecycle policy, accounting location derivation, provider construction, background operation registration, HTTP handler composition, and mapping app config into package-local options.

## Tasks

### Commit 1: Clarify Config Architecture Boundary

- [x] Update `docs/architecture.md` before moving code.
- [x] Add `internal/appconfig` to package boundaries as the owner of local app config source loading and source precedence.
- [x] Update `internal/runtime` wording so it owns database lifecycle policy and manual composition, not source-loaded config.
- [x] Update config/store wording so the accounting path and schema come from app config plus explicit CLI overrides, while runtime still derives DuckDB accounting location defaults.
- [x] Keep the architecture doc evergreen; do not describe the old package layout as history.
- [x] Verification
  - [x] Required docs updated.
  - [x] Commit changes.

### Commit 2: Add App Config Package

- [x] Create `internal/appconfig`.
- [x] Move the current source loader from `internal/runtime/config` to `internal/appconfig`.
- [x] Rename package `config` to `appconfig`.
- [x] Update exported config and override structs to the shapes in this plan.
- [x] Keep existing app config defaults, config-file discovery, env parsing, unknown-key rejection, source precedence, and source metadata behavior.
- [x] Keep `Load(opts LoadOptions, overrides Overrides) (Config, error)`.
- [x] Keep `DefaultConfig` free of filesystem/env lookups; `Load` should resolve `CacheDir`.
- [x] Remove `CommandConfig`, `AssumeYes`, `Serve.Quiet`, `SourceAssumeYes`, and `SourceServeQuiet` from appconfig.
- [x] Do not remove `MINA_YES` or `MINA_QUIET` from CLI behavior in this commit.
- [x] Add `internal/appconfig/PACKAGE.md` and `doc.go`.
- [x] Verification
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just pre-commit` passes.
  - [x] Required docs updated.
  - [x] Commit changes.

### Commit 3: Move CLI Callers To App Config

- [x] Update `cmd/mina` to import `internal/appconfig`.
- [x] Keep all Cobra flag declarations in `cmd/mina`.
- [x] Convert only changed config-backed flags into `appconfig.Overrides`.
- [x] Keep `assumeYes`, `quiet`, and `seedDemo` as command-local values.
- [x] Keep `MINA_YES` and `MINA_QUIET` support in `cmd/mina`.
- [x] Keep env source help for `--yes` and `--quiet`, but make it command-owned rather than appconfig-owned.
- [x] Keep config/env source help for config-backed flags.
- [x] Update CLI smoke scripts for the new ownership boundary.
- [x] Add or update integration coverage proving `MINA_YES` and `MINA_QUIET` still affect their CLI flags.
- [x] Verification
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes.
  - [x] `just pre-commit` passes.
  - [x] Commit changes.

### Commit 4: Split Runtime Options From App Config

- [x] Change runtime constructors and helpers to accept `appconfig.Config` plus `runtime.Options`.
- [x] Remove `runtime.Config`, `runtime.ServeConfig`, and runtime copies of app/exchange-rate config structs.
- [x] Add or keep a runtime helper for deriving `store.AccountingLocationConfig` from `appconfig.Config`.
- [x] Keep runtime-owned validation for exchange-rate schedules and startup provider selection.
- [x] Expose `runtime.Validate(cfg appconfig.Config, opts runtime.Options) error` so command flows can validate runtime-owned settings before prompts.
- [x] Move port and quiet/access-log validation to `cmd/mina`.
- [x] Update runtime composition to map `appconfig.Config` into `httpapi`, service, provider, and background option structs.
- [x] Update `internal/runtime/PACKAGE.md` and `doc.go`.
- [x] Verification
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes.
  - [x] `just pre-commit` passes.
  - [x] Required docs updated.
  - [x] Commit changes.

### Commit 5: Update App Test Helpers And Depguard Rules

- [x] Update `internal/apptest` to build runtime-level apps from `appconfig.Config` plus `runtime.Options`.
- [x] Keep app config knobs, such as database path, schema, cache dir, and exchange-rate settings, on the app config side.
- [x] Keep test seams, such as fake clocks, fake providers, and operation execution controls, on runtime options.
- [x] Ensure apptest does not go through CLI.
- [x] Delete `internal/runtime/config` after all callers are migrated.
- [x] Update `.golangci.yml` depguard config for the new `internal/appconfig` boundary.
- [x] Add an `appconfig-boundaries` depguard rule for `internal/appconfig/*.go` that denies imports of runtime, store, httpapi, background, providers, services, Cobra, and pflag.
- [x] Add or update depguard rules so services, store, httpapi, background, and providers cannot import `internal/appconfig`.
- [x] Remove or update depguard rules that target `internal/runtime/config`.
- [x] Do not update `PROJECT_STATE.md`; this is a boundary refactor, not progress against business requirements.
- [x] Verification
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes.
  - [x] `just pre-commit` passes.
  - [x] Required docs updated.
  - [x] Commit changes.

## Final Verification

- [x] `just init` passes on a clean checkout with required local tools available.
- [x] `just fmt` passes.
- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just pre-commit` passes.
- [x] Commit final changes.
- [x] Run `just review-loop "refactor app config boundary: architecture.md boundary change is intentional; internal/appconfig owns source-loaded app config; internal/runtime owns composition and runtime options; cmd/mina retains CLI env support for --yes and --quiet"`.
