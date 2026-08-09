# github.com/mishamsk/mina/internal/providers

## Purpose

- Hosts concrete local and external implementations of service-owned provider contracts.

## Implicit Contracts

- Production code imports and constructs concrete providers only in `internal/runtime`; consumers depend on the owning service contract.
- Providers own source or destination representation and I/O; services own Mina domain validation, decisions, and persistence of data crossing the boundary.

## Boundaries

- Owns: provider-specific filesystem or network effects and source/destination format translation.
- Does not own: configuration source loading, SQL persistence, REST or CLI behavior, domain decisions, or runtime composition.
