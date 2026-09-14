# frontend/src/hooks

## Purpose

- Owns generic reusable React hooks for layout observation and input boundaries.

## Implicit Contracts

- Accelerator observation listens only while enabled, clears on blur or visibility changes, and supports Meta-only picker presentation; activation decisions belong to event handlers.

- Shortcut registration requires a stable group identity and unregisters when disabled or unmounted; each mounted owner supplies a unique group ID and stable registration callbacks, keeping the hook independent of stores.

- `useElementOverflow` tracks the attached element through layout, child, and content changes; a detached ref is not overflowing.
- `useOutsidePointerClose` closes on capture-phase outside `pointerdown` but treats the referenced panel and standard portaled overlays as inside. Callers add selectors for their own portaled controls.

## Boundaries

- Owns generic hooks reusable outside a Mina-specific feature.
- Does not own feature dismissal policy, focus recovery, route state, stores, API access, or persistence.
