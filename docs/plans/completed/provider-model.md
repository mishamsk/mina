# Provider Package Pattern

## Purpose

Use `internal/providers` for outbound data providers: external or local sources that supply facts to Mina but do not own Mina accounting state.

Examples:

- Exchange-rate feeds.
- Bank import providers.
- Market-price sources.
- File/API-based enrichment sources.

Providers are not repositories. Repositories persist Mina state. Providers fetch or derive candidate data from outside the core accounting model.

## Dependency Direction

Expected flow:

```text
cmd/mina -> internal/runtime
internal/runtime -> internal/providers
internal/runtime -> internal/services
internal/runtime -> internal/store
internal/httpapi -> internal/services
internal/services -> service-owned interfaces only
internal/store -> internal/services
internal/providers -> internal/services
```

Forbidden:

```text
internal/services -> internal/providers
internal/httpapi -> internal/providers
internal/store -> internal/providers
internal/providers -> internal/store
internal/providers -> internal/httpapi
internal/providers -> internal/runtime
internal/providers -> internal/runtime/config
internal/runtime/config -> internal/providers
```

`internal/runtime` is the only package that should see both app config and concrete provider packages.

## Package Layout

Use one provider domain folder per provider category.

```text
internal/providers/
  PACKAGE.md
  doc.go
  exchangerates/
    PACKAGE.md
    doc.go
    ecb/
      PACKAGE.md
      doc.go
      ecb.go
    file/
      PACKAGE.md
      doc.go
      file.go
```

General form:

```text
internal/providers/<domain>/<implementation>
```

Examples:

```text
internal/providers/exchangerates/ecb
internal/providers/exchangerates/openexchange
internal/providers/imports/plaid
internal/providers/prices/coingecko
```

## Interface Ownership

The consuming service owns the provider interface.

For exchange rates, define the interface in:

```text
internal/services/exchangerates
```

Conceptual shape:

```go
type RateSource interface {
    HistoricalRate(ctx context.Context, input RateRequest) (RateQuote, error)
}
```

The interface must use service-owned domain/value types only. It must not expose:

- Provider DTOs.
- HTTP response types.
- SDK types.
- SQL types.
- OpenAPI types.
- Runtime config types.

## Service Responsibilities

The service owns:

- Provider-facing input/output contracts.
- Domain validation.
- Use-case decisions.
- Mapping provider results into Mina-created records.
- Conflict, not-found, invalid-request, and provider-unavailable error semantics.
- Deciding whether fetched data is persisted.

For exchange rates, the service decides:

- Whether a provider lookup is allowed for the requested pair/date.
- Whether an existing persisted rate should be reused.
- Whether a fetched quote should be persisted.
- Whether provider metadata matters to the domain model.
- How provider failures map to service errors.

## Provider Responsibilities

Provider packages own:

- External API request construction.
- External API response parsing.
- Provider-specific authentication.
- Provider-specific constructor/options types.
- Provider-specific validation that requires provider knowledge.
- Provider-specific error normalization.
- Network/file side effects.

Provider packages must not:

- Execute SQL.
- Open Mina databases.
- Know REST/OpenAPI DTOs.
- Make Mina domain decisions.
- Return provider DTOs from service-facing methods.
- Import `internal/runtime`.
- Import `internal/runtime/config`.
- Import `internal/httpapi`.
- Import `internal/store`.

## Config Ownership

Provider configuration is app configuration.

The intended flow is:

```text
config file/env/overrides
  -> internal/runtime/config.Config
  -> internal/runtime.Config or internal/runtime.ServeConfig
  -> internal/runtime composition
  -> concrete provider constructor
  -> service-owned provider interface
```

`internal/runtime/config` owns:

- Config file schema.
- Environment variable schema.
- Source precedence.
- Source-loaded config structs.
- Override structs when CLI/runtime overrides are needed.

`internal/runtime` owns:

- App composition.
- Provider selection.
- Translating app config into provider constructor arguments.
- Passing concrete providers into services.

Providers must not discover, parse, or own nested app config sources.

Do not use:

- Provider-supplied config structs inside `internal/runtime/config`.
- Reflection-based provider config discovery.
- Plugin registration for provider config.
- `init()` registration for Mina-owned providers.
- Blank imports to activate providers.

## Dedicated Config Types

Use explicit app config types that mirror supported providers.

For exchange rates, source-loaded config can look like:

```go
type Config struct {
    DatabasePath     string
    AccountingSchema string
    Serve            ServeConfig
    Providers        ProviderConfig
}

type ProviderConfig struct {
    ExchangeRates ExchangeRateProviderConfig
}

type ExchangeRateProviderConfig struct {
    Source string
    ECB    ECBExchangeRateProviderConfig
    File   FileExchangeRateProviderConfig
}

type ECBExchangeRateProviderConfig struct {
    BaseURL        string
    TimeoutSeconds int
}

type FileExchangeRateProviderConfig struct {
    Path string
}
```

The exact names may change, but the structure should stay explicit and centrally owned by `internal/runtime/config`.

## Config File Shape

Prefer stable, direct TOML sections:

```toml
[providers.exchange_rates]
source = "ecb"

[providers.exchange_rates.ecb]
base_url = "https://example.invalid"
timeout_seconds = 10

[providers.exchange_rates.file]
path = "/path/to/rates.csv"
```

Only the selected provider’s required settings should need to validate for startup. Unselected provider config may be absent.

## Environment Variables

Use explicit env vars on leaf fields only.

Example names:

```text
MINA_EXCHANGE_RATE_SOURCE
MINA_EXCHANGE_RATE_ECB_BASE_URL
MINA_EXCHANGE_RATE_ECB_TIMEOUT_SECONDS
MINA_EXCHANGE_RATE_FILE_PATH
```

The current config parser supports string, int, and bool. For durations, prefer source-loaded integer fields such as `TimeoutSeconds`, then convert to `time.Duration` in runtime.

## Runtime Wiring

Runtime should switch on the selected provider name and construct the provider directly.

Conceptual shape:

```go
switch cfg.Providers.ExchangeRates.Source {
case "":
    rateSource = nil
case "ecb":
    rateSource = ecb.New(ecb.Options{
        BaseURL: cfg.Providers.ExchangeRates.ECB.BaseURL,
        Timeout: time.Duration(cfg.Providers.ExchangeRates.ECB.TimeoutSeconds) * time.Second,
    })
case "file":
    rateSource = file.New(file.Options{
        Path: cfg.Providers.ExchangeRates.File.Path,
    })
default:
    return error
}
```

The service receives only the service-owned interface:

```text
exchangerates.NewService(repo, rateSource)
```

If no provider is configured, runtime should pass `nil` or a deliberate no-provider implementation, depending on the service contract.

## Validation

Config loading should stay generic and source-focused.

Runtime/provider construction should validate provider-specific requirements:

- Unknown provider source.
- Required provider fields missing.
- Invalid timeout values.
- Invalid provider base URL.
- Missing local file path.
- Unsupported provider mode.

This keeps `internal/runtime/config` from importing providers while still making startup fail clearly.

## Overrides

Add override structs only when a provider setting is intentionally exposed through CLI flags or another higher-precedence caller.

Do not add overrides just because a provider config field exists.

## Persistence Rule

Provider data is not Mina accounting state until a service accepts and persists it through a repository.

For exchange rates:

```text
provider quote
  -> exchangerates service validation/use-case
  -> ExchangeRate repository
  -> DuckDB
```

Normal reads should use persisted Mina state unless the endpoint/use case explicitly requests provider lookup or backfill.

## Error Model

Provider packages should normalize provider-specific failures into service-consumable errors.

Expected categories:

- Provider unavailable.
- Provider timeout.
- Unsupported pair.
- No rate for date.
- Invalid provider configuration.
- Provider authentication failure.
- Malformed provider response.

The service decides how those errors become Mina behavior. HTTP status mapping still belongs in `internal/httpapi`.

## Depguard Updates

Update `.golangci.yml` when adding `internal/providers`.

Add a provider boundary rule covering:

```text
internal/providers/*.go
internal/providers/**/*.go
**/internal/providers/*.go
**/internal/providers/**/*.go
```

Deny at minimum:

```text
database/sql
github.com/duckdb/duckdb-go/v2
github.com/mishamsk/mina/internal/httpapi
github.com/mishamsk/mina/internal/httpclient
github.com/mishamsk/mina/internal/runtime
github.com/mishamsk/mina/internal/store
github.com/spf13/cobra
github.com/spf13/pflag
```

Update existing rules:

- Service packages must deny importing `github.com/mishamsk/mina/internal/providers`.
- HTTP API packages must deny importing `github.com/mishamsk/mina/internal/providers`.
- Store packages must deny importing `github.com/mishamsk/mina/internal/providers`.
- `cmd/mina` must continue delegating through runtime and must not import providers directly.
- `internal/runtime/config` must deny importing `github.com/mishamsk/mina/internal/providers`.

If provider packages need process I/O such as local files, keep that permission explicit and documented in the provider package docs.

## Architecture Documentation

Update `docs/architecture.md` when introducing providers.

Add `internal/providers` to package boundaries as an outbound data-provider layer.

Document:

- Providers are concrete adapters for external/local data sources.
- Providers implement service-owned interfaces.
- Providers may perform network or file side effects when explicitly configured.
- Providers do not own Mina persistence, REST DTOs, CLI parsing, config source loading, or domain decisions.
- Runtime wires providers manually.
- Services do not import providers.
- Provider config is source-loaded by `internal/runtime/config` and translated by `internal/runtime`.

Keep the architecture doc short and evergreen.

## Package Docs

Add package docs for:

```text
internal/providers/PACKAGE.md
internal/providers/<domain>/PACKAGE.md
internal/providers/<domain>/<implementation>/PACKAGE.md
```

Each doc should state:

- Purpose.
- Side effects.
- Config ownership.
- Boundary rules.
- Provider-specific invariants.

If there are no implicit contracts, say:

```text
No implicit contracts.
```

## Exchange-Rate Implementation Checklist

- [x] Define the provider-facing exchange-rate interface in `internal/services/exchangerates`.
- [x] Define provider request/result types using service-owned value types.
- [x] Update `exchangerates.Service` constructor to accept the provider dependency only if a real use case needs provider lookup/backfill.
- [x] Add explicit provider config structs in `internal/runtime/config`.
- [x] Add TOML/env loading for provider config fields.
- [x] Add overrides only for settings intentionally exposed through CLI flags.
- [x] Add concrete provider package under `internal/providers/exchangerates` for the current routed provider implementation.
- [x] Keep provider DTOs private to the provider package.
- [x] Normalize provider errors before returning to the service.
- [x] Wire the selected provider in `internal/runtime`.
- [x] Keep `internal/httpapi` calling only exchange-rate service methods.
- [x] Keep `internal/store` limited to persisted exchange-rate records.
- [x] Update `.golangci.yml` depguard rules.
- [x] Update `docs/architecture.md`.
- [x] Add package docs for new provider packages.
- [x] Add runtime/API boundary tests for the new behavior.
- [x] Run required `just` checks before committing code changes.
