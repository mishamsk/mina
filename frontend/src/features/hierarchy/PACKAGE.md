# frontend/src/features/hierarchy

## Purpose

- Owns the reusable side panel for moving or renaming FQN-prefix paths in accounts, categories, tags, and templates.

## Implicit Contracts

- The panel trims the destination and rejects an empty or unchanged path locally; it passes the source path unchanged to the caller. Services remain the authority for FQN validity, subtree rules, and conflicts; callers display their failures through `errorMessage`.
- Initial render focuses and selects the destination input. While a submit is pending, the panel cannot close or submit again. Callers own close state, post-success refresh fan-out, notices, and restoring focus to the opener.
- This is a non-modal dialog that blocks app-shell global shortcuts through its overlay marker. `escapeDisabled` lets a caller defer Escape to an overlapping higher-priority surface.

## Boundaries

- Owns: shared restructure-panel input, local validation, pending state, and accessible labeling.
- Does not own: route or URL state, REST calls, hierarchy semantics, entity-specific refresh/cache lifecycle, notices, or opener-focus recovery.
