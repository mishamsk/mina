# github.com/mishamsk/mina/internal/services/demo

## Purpose

- Seeds deterministic demo accounting data through app service use cases.

## Implicit Contracts

- Demo seeding does not call store repositories or SQL directly.
- Demo data includes six calendar months of history ending at an explicit civil-date anchor; default seeding uses the runtime clock's current local date.
- Recurring definitions and expected occurrence materialization derive from the same seed anchor.
- Demo account FQNs group products and roles under real-world entity prefixes; unnamed merchants share `merchant:unspecified`, and physical cash stores accept multiple currencies.
- Demo transactions use derived semantics: categories only on flow records, fixed-system exchanges, split flow records for multi-merchant and mortgage spending, and uncategorized party-balance movements.
- Demo seeding assumes callers provide a new empty accounting schema.
- Demo seeding expects runtime to provide one atomic persistence boundary around the full seed.

## Boundaries

- Owns: demo fixture shape, deterministic transaction generation, and service-call ordering.
- Does not own: persistence, runtime composition, HTTP mapping, or CLI output.

## Testing Notes

- Verify through runtime/API flows once exposed by CLI or REST.
