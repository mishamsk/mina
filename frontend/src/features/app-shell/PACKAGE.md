# frontend/src/features/app-shell

## Purpose

- Owns the route-independent application frame, navigation, global overlays, and cross-route entry orchestration.

## Implicit Contracts

- Conflict close and discard refresh the current transaction page before publishing detail; the final fetched version invalidates every account register it introduces, while a failed final detail lookup leaves the refreshed page snapshot authoritative.
- Saved-entry deep links enforce the same lifecycle availability as visible row and detail actions; cancelled transactions must be restored before Edit is available.
- Recurring-definition drafts opened from source actions or backlinks are route-independent overlays; saves refresh a mounted recurring-definition list and invalidate transaction/register snapshots, the Recurring route stays inert while its global draft is open, and closing off-route consumes the backlink when its history entry returns without overriding newer navigation. Closure restores a visible connected opener (including definition rows and template actions), monitors a pending transaction refresh for row removal, re-resolves remounted transaction actions, or falls back to a visible transaction surface or the current route heading.

## Boundaries

- Owns: app-shell layout, global overlay composition, and cross-feature refresh sequencing.
- Does not own: route screens, ledger cache implementation, generated API setup, or accounting behavior.
