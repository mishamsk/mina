# github.com/mishamsk/mina/internal/services/settings

## Purpose

- Owns the operational-settings read use case and service-shaped domain contract.

## Implicit Contracts

- Receives and retains one immutable startup snapshot.
- Returns groups, active values, effective sources, and the resolved config-file location without reloading configuration.
- See `docs/settings-architecture.md` for the cross-cutting settings flow.

## Boundaries

- Owns: service-shaped types and the settings read use case.
- Does not own: source loading, TOML or filesystem I/O, SQL, runtime composition, mutation, persistence, or HTTP DTOs.

## Testing Notes

- Settings service behavior is covered through app tests at the REST boundary.
