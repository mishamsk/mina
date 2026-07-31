# github.com/mishamsk/mina/internal/services/demo

## Purpose

- Seeds deterministic demo accounting data through app service use cases.

## Implicit Contracts

- Demo seeding does not call store repositories or SQL directly.
- Demo data accepts any positive requested calendar-month history limit ending at an explicit civil-date anchor; the effective history defaults to and is capped at the full six-month fixture, and the anchor defaults to the runtime clock's current local date.
- Seeded transactions stay within the selected window; shorter windows select an exact suffix of the default deterministic sequence and retain fixture values.
- Recurring anchors and materialized occurrences stay within the selected history window; definitions remain open-ended, and their next due dates may fall after it.
- Demo account FQNs group products and roles under real-world entity prefixes; unnamed merchants share `merchant:unspecified`, and physical cash stores accept multiple currencies.
- Demo transactions use derived semantics: categories only on flow records, fixed-system exchanges, split flow records for multi-merchant and mortgage spending, and uncategorized party-balance movements.
- Demo seeding assumes callers provide a new empty accounting schema.
- Demo seeding expects runtime to provide one atomic persistence boundary around the full seed.

## Boundaries

- Owns: demo fixture shape, deterministic transaction generation, and service-call ordering.
- Does not own: persistence, runtime composition, HTTP mapping, or CLI output.

## Testing Notes

- Verify through runtime/API flows once exposed by CLI or REST.
