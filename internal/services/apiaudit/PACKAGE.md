# github.com/mishamsk/mina/internal/services/apiaudit

## Purpose

- Coordinates portable API audit-entry persistence, bounded newest-first listing, and retention decisions.

## Implicit Contracts

- Missing caller attribution is recorded as `rest`; explicit attribution is limited to `web-ui`, `cli`, and `mcp` by the HTTP boundary.
- Audit preparation and persistence are handed off asynchronously only after a matched mutating REST outcome is determined; reads, compaction, and app shutdown join already-pending bounded inserts without blocking later handoffs behind an in-progress drain.
- Compaction keeps entries on the UTC first-of-month boundary obtained by subtracting the positive retention-month count from the current month; only entries strictly before that cutoff are deleted.

## Boundaries

- Owns audit domain values, list validation, calendar-month retention decisions, and repository contracts.
- Does not own HTTP capture and redaction, SQL, runtime scheduling, or presentation.
