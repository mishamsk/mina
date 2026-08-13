# frontend/src/models

## Purpose

- Owns frontend UI-state shapes plus canonical transaction-filter and sorting values that are not generated API DTOs.

## Implicit Contracts

- Normalize transaction filters before REST mapping, URL serialization, or cache-key generation: IDs are positive, unique, and sorted; fiat currency codes and crypto prefixes are uppercase while crypto token case is preserved; currency codes are valid transport shapes, unique, and sorted; enum selections are allowed values in their declared order; blank optional text is absent. Derive signatures from that normalized form so equivalent selections share a snapshot.
- Transaction-filter enum lists are constrained by generated REST types; update them when the supported REST enum set changes.
- Transaction filters carry exact Category and Tag FQN-prefix scopes for group drill-downs alongside leaf ID filters.

## Boundaries

- Owns UI data shapes and transaction-filter canonicalization only.
- Does not own generated API DTOs, transaction URL parsing or writing (ledger), or browser persistence and compatibility handling (services and stores).
