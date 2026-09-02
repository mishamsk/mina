# frontend/src/features/app-shell

## Purpose

- Owns the route-independent application frame, navigation, global overlays, and cross-route entry orchestration.

## Implicit Contracts

- Conflict close and discard refresh the current transaction page before publishing detail; the final fetched version invalidates every account register it introduces, while a failed final detail lookup leaves the refreshed page snapshot authoritative.
- Saved-entry deep links enforce the same lifecycle availability as visible row and detail actions; cancelled transactions must be restored before Edit is available.
- Route-level entry closure falls back to the visible Transactions navigation link in roomy shells or the compact Navigation trigger when no launch control or transaction-list target is available.
- Recurring-definition drafts opened from source actions or backlinks are route-independent overlays; saves refresh a mounted recurring-definition list and invalidate transaction/register snapshots, the Recurring route stays inert while its global draft is open but navigation remains interactive, and closing off-route consumes the backlink when its history entry returns without overriding newer navigation. Closure restores a visible connected opener (including definition rows and template actions), monitors a pending transaction refresh for row removal, re-resolves remounted transaction actions, or falls back to a visible transaction surface or the current route heading.
- The shell owns the complementary compact/roomy breakpoint, mounts the shared table-controls and Edit-panel providers, and renders the compact full-width Navigation/Controls toolbar with a conditional Edit action and safe-area page inset. Navigation reuses the sidebar sections in a non-modal sheet without reserving content width, consumes Escape before underlying route editors, closes after every nested navigation link including featured accounts, hands one-tap interaction to sibling toolbar surfaces, and hands focus between the compact trigger and visible roomy navigation whenever the shell mode changes; the toolbar yields to global modal surfaces, while page headers retain stable trailing spacing and register toolbar content without owning overlay state or compact-surface styling.

## Boundaries

- Owns: app-shell layout, global overlay composition, and cross-feature refresh sequencing.
- Does not own: route screens, ledger cache implementation, generated API setup, or accounting behavior.
