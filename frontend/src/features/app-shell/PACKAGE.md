# frontend/src/features/app-shell

## Purpose

- Owns the route-independent application frame, navigation, global overlays, and cross-route entry orchestration.

## Implicit Contracts

- Keyboard help renders Global before mounted page/overlay groups, stacks above entry/template modals and below confirmations, initially focuses the catalog without a ring or tooltip, scrolls it with arrow/page keys and Home/End from any dialog focus target, and restores the captured opener or route heading on close.
- Keyboard help marks its backdrop as a modal overlay so outside-pointer dismissal preserves underlying non-modal detail panels.

- Global shortcuts share overlay detection; only the help predicate ignores the entry-modal marker, while editable targets and other blocking overlays still suppress `?`. Shortcut catalogs describe behavior while each surface retains its own handlers.
- Entry chords use an effect-local 200 ms window and capture-phase dispatch ahead of row shortcuts; plain `n` passes no tab so ledger restores the saved tab or opens Spend, pending Escape is consumed to preserve underlying selection and Edit mode, and pending entry cancels on blur, visibility changes, or cleanup and yields to editable targets and blocking overlays.

- The shell is the browser data router layout and renders route content through its outlet and holds the recurring editor navigation-guard ref, blocking pathname changes while dirty or saving; leaving the blocked state clears the editor's deferred navigation and confirmation before paint, including after same-path navigation resets the blocker. Draft comparison, save completion, and discard-dialog focus remain editor-owned.
- Roomy fixed pages own canvas-overflow containment through the shared `fixedPageClassName`; the shell supplies the matching top/bottom insets and leaves document-scrolling reports, Status, and Settings to their route-owned scroll models.
- Conflict close and discard refresh the current transaction page before publishing detail; the final fetched version invalidates every account register it introduces, while a failed final detail lookup leaves the refreshed page snapshot authoritative.
- Create entry, including restored deep links, passes the captured route date through the modal to the entry panel; ledger owns date selection and transient draft application.
- Saved-entry deep links enforce the same lifecycle availability as visible row and detail actions; cancelled transactions must be restored before Edit is available.
- Route-level entry closure falls back to the visible Transactions navigation link in roomy shells or the compact Navigation trigger when no launch control or transaction-list target is available.
- Recurring-definition drafts opened from source actions or backlinks belong to their launch pathname; React Router guards dirty pathname changes, completed pathname changes close the editor before paint, and search/hash-only changes preserve the draft; saves refresh a mounted recurring-definition list and invalidate transaction/register snapshots, the Recurring route stays inert while its global draft is open but navigation remains interactive. Explicit close clears the current Recurring definition fragment; navigation closure leaves the source history entry available for fresh fragment resolution. Navigation closure restores focus to the destination heading when removing the editor or discard dialog leaves focus on the document body, without overriding another focused control. Explicit closure restores a visible connected opener (including definition Edit buttons, definition rows, and template actions), monitors a pending transaction refresh for row removal, re-resolves remounted transaction actions, or falls back to a visible transaction surface or the current route heading.
- The shell owns the complementary compact/roomy breakpoint, mounts the shared table-controls and Edit-panel providers, and renders the compact full-width Navigation/Controls toolbar with a conditional Edit action and safe-area page inset. Navigation reuses the sidebar sections in a non-modal sheet without reserving content width, consumes Escape before underlying route editors, closes after plain primary activation of nested navigation links including featured accounts while leaving native modified gestures alone, hands one-tap interaction to sibling toolbar surfaces, and hands focus between the compact trigger and visible roomy navigation whenever the shell mode changes; the toolbar yields to global modal surfaces, while page headers retain stable trailing spacing and register toolbar content without owning overlay state or compact-surface styling.

## Boundaries

- Owns: app-shell layout, global overlay composition, and cross-feature refresh sequencing.
- Does not own: route screens, ledger cache implementation, generated API setup, or accounting behavior.
