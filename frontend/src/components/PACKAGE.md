# frontend/src/components

## Purpose

- Provides shared presentational components and UI-wide interaction primitives.

## Implicit Contracts

- Tooltip Escape dismisses the tooltip, then forwards one Escape to the original target so the active overlay's Escape ladder can continue.
- Use `focusWithoutTooltip` for programmatic focus recovery when a focus tooltip must not flash.
- Confirmation dialogs close on Escape only while idle; pending actions keep the dialog open. They suppress automatic close-focus restoration, so callers recover focus.
- Preserve `[data-slot='confirmation-dialog-content']` and `[data-page-help-content]`; overlays use them as outside-pointer dismissal exclusions.

## Boundaries

- Owns: shared presentation and app-specific wrappers around `components/ui` primitives.
- Does not own: route behavior, Mina-specific workflows, API access, URL state, or browser persistence.
