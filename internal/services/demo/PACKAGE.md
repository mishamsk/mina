# github.com/mishamsk/mina/internal/services/demo

## Purpose

- Seeds a date-anchored deterministic demo accounting fixture through service use cases.

## Implicit Contracts

- The anchor defaults to the runtime clock's local civil date. A positive requested history window defaults to, and is capped at, the six-month fixture; shorter windows retain only its suffix.
- Recurring definitions and their materialized history begin within the selected window, but definitions remain open-ended and can next fall after it.
- Seeding is an empty-schema initializer: it neither clears nor merges existing fixture data, so conflicting pre-existing records fail the seed.
- The injected atomic boundary must run the entire seed with transaction-scoped services; runtime invalidates reference caches only after that boundary succeeds.

## Boundaries

- Owns: demo fixture shape, date anchoring, and service-call ordering.
- Does not own: persistence, transaction lifecycle ownership, runtime composition, or transport mapping.
