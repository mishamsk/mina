# github.com/mishamsk/mina/cmd/mina

## Purpose

- Composes Mina's process commands, flags, I/O, signals, and product-package entry points into one binary.

## Implicit Contracts

- `mina db schema` prints the embedded current target DDL without loading configuration or opening a database.
- `mina --version` and `mina version` render runtime-owned build metadata without loading configuration or opening an application.
- Local client sessions route REST adapter diagnostics to command stderr before closing their one-shot runtime.

## Boundaries

- Owns: top-level Cobra composition, build-metadata presentation, process I/O, signal handling, and command exit behavior.
- Does not own: application behavior, persistence, REST mapping, generated client catalogs, or runtime lifecycle implementation.
