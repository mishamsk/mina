# github.com/mishamsk/mina/internal/services/demo

## Purpose

- Seeds deterministic demo accounting data through app service use cases.

## Implicit Contracts

- Demo seeding does not call store repositories or SQL directly.
- Demo data is deterministic and covers April-May 2026.
- Demo seeding assumes callers provide a new empty accounting schema.
- Demo seeding expects runtime to provide one atomic persistence boundary around the full seed.

## Boundaries

- Owns: demo fixture shape, deterministic transaction generation, and service-call ordering.
- Does not own: persistence, runtime composition, HTTP mapping, or CLI output.

## Testing Notes

- Verify through runtime/API flows once exposed by CLI or REST.
