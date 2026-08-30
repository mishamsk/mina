# frontend/src/features/recurring

## Purpose

- Owns the `/recurring` definition-management UI, editor, and definition snapshot.

## Implicit Contracts

- Load every definition page using backend next-due-date ordering; retry page sets affected by concurrent reordering, and never let stale or unmounted loads replace the current snapshot.
- Every definition mutation refreshes the `/recurring` route's sole mounted definition snapshot when present and invalidates transaction/register views with a fresh occurrence catch-up; the shared posted confirm-next operation coalesces route-overlapping consumers and publishes its pending state through refresh, while its refresh path also updates account headers, featured balances, and Overview because it posts a transaction.
- The five definition row actions use one direct compact outline-button cluster; Confirm and Defer stay unavailable while a definition is paused, and Defer accepts an interval cadence offset or a date-rule period count.
- The shared defer dialog owns schedule-class-specific offset input, keeps its form and focus stable while a projected-row definition loads, renders the canonical definition path, and is reused by `/recurring` and the next-projection action in ledger views.
- The editor writes a complete balanced record set, blocks changed past anchors against the server accounting date when available, submits anchors for authoritative server validation, maps server anchor errors to that field, and exposes categories only for `flow` records; a template-seeded category on a non-flow record remains visible with its full path available as a tooltip only as a clearable invalid default. If its follow-up pause/resume request fails after the write, keep the editor open and report the partial result.
- New-definition drafts may be seeded from complete transaction records or partial template defaults; missing template values remain blank and ordinary inline completeness and balance validation blocks save.
- Per-entity detail reads resolve seeded selected references into caller-retained options even before broader lookups load; ranked-search contexts exclude hidden current values as fresh choices, and returned Account detail immediately reconciles row type and currency without moving eligibility or ordering into the editor.
- Definition records normalize fiat codes and the `C::` prefix to uppercase while preserving the case-sensitive crypto token suffix.
- Definition actions and editor closure resolve and restore their live focus target after closing without overriding newer user focus; reordered action rows are revealed below the sticky table header, the feature restore target remains the fallback, and the editor is an outside-close safe overlay for its source detail panel that lets an open confirmation dialog handle Escape first.
- Definition rows expose `id="definition-<id>"` for route-owned deep links and `data-recurring-definition-id="<id>"` for app-shell focus restoration.

## Boundaries

- Owns definition table/editor behavior, source-record draft mapping, action state, and refresh coordination.
- Does not own recurring-occurrence review or actions, which belong to Transactions; REST endpoint generation, schedule semantics, accounting validation, and lookup persistence belong elsewhere.
