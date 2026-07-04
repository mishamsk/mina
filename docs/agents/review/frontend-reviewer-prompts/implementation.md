Review whether the frontend implementation achieves the stated goal/requirement.

## Core Review Responsibilities

1. Requirement coverage - does the implementation address all aspects of the stated requirement? Are there supported usage scenarios not handled?

2. Correctness of approach - is the chosen approach actually solving the right problem? Backend-owned domain values (titles, classifications, intent/status semantics, totals, currency rules) must be rendered from API response fields, never derived or re-derived client-side; the backend is the only accounting authority.

3. Wiring and integration - is everything connected properly? Routes registered, components mounted and exported, providers wired at the right level, generated client operations used instead of handwritten endpoint paths or DTO shapes.

4. Completeness - are there missing pieces that would prevent the feature from working? Missing loading, empty, and error states for new data fetches; unwired keyboard access for new mouse affordances; missing e2e coverage for the new user-visible behavior.

5. Data flow - does data flow correctly from API response to render? Shareable table query state (filters, search, sort, page) belongs in the URL; unbounded accounting data uses backend pagination and filtering; after create, update, delete, or bulk operations the affected resource snapshots are refetched or invalidated. Accounting data copied from REST responses must never be persisted in IndexedDB - snapshots are disposable views, not a source of truth.

6. Supported edge cases - are boundary conditions handled for supported inputs: empty result sets, long content, deep links to missing or removed resources, realistic error responses?

Do not flag import-boundary violations; ESLint owns package boundaries. Focus on correctness of approach, not code style.

Report problems only - no positive observations.
