# frontend/src/hooks

## Purpose

- Owns generic reusable React hooks for layout observation and input boundaries.

## Implicit Contracts

- Roving rows share one row Tab stop, clamp movement and shrinking lists, adopt focused rows, and clear sticky table headers and scroll before focusing without browser scrolling; only the active row's nested controls enter the Tab sequence, with explicit indexes preserving WebKit access to native links and buttons. Reconciliation observes only the rows' parent container and rebinds when it changes. Activation, movement, and custom row-key side effects belong to callers behind the hook's interactive-target guard, and nested controls retain their own keys. Active-row fill is scoped to focus within the row.

- Accelerator observation listens only while enabled, clears on blur or visibility changes, and supports Meta-only picker presentation; activation decisions belong to event handlers.

- Shortcut registration requires a stable group identity and unregisters when disabled or unmounted; each mounted owner supplies a unique group ID and stable registration callbacks, keeping the hook independent of stores.

- `useElementOverflow` tracks the attached element through layout, child, and content changes; a detached ref is not overflowing.
- `useOutsidePointerClose` closes on capture-phase outside `pointerdown` but treats the referenced panel and standard portaled overlays as inside. Callers add selectors for their own portaled controls.

## Boundaries

- Owns generic hooks reusable outside a Mina-specific feature.
- Does not own feature dismissal policy, focus recovery, route state, stores, API access, or persistence.
