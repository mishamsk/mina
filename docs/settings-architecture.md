# Settings Architecture

## Layers

- Appconfig owns loading, precedence, source-backed attribution, config-file discovery, and settings presentation metadata.
- Runtime resolves mode-specific defaults and their effective attribution, then composes one immutable settings snapshot at startup.
- The settings service owns the application read use case and exposes service-shaped types.
- HTTP maps the service contract to the REST contract; it does not access appconfig or stores directly.
- The browser renders server-provided groups and fields without knowing concrete setting keys.

## Boundaries

- Server settings and browser-local preferences are separate systems.
- Appconfig is the only layer that interprets source configuration structure, discovery, or precedence.
- Runtime is the only layer that connects appconfig to the settings service.
- The settings service retains the immutable startup snapshot and has no filesystem or database behavior.
- Transport contracts define representation, not configuration behavior.

## Contracts

- A settings read is observational and returns the running process's resolved startup values, their effective sources, and the resolved config-file location.
- Values cross service and transport boundaries as canonical strings with typed presentation metadata.
