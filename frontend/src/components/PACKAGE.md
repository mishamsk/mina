# frontend/src/components

## Purpose

- Provides shared presentational components and UI-wide interaction primitives.

## Implicit Contracts

- Tooltip Escape dismisses the tooltip, then forwards one Escape to the original target so the active overlay's Escape ladder can continue.
- Focusable tooltip wrapper triggers must supply an accessible trigger label.
- Use `focusWithoutTooltip` for programmatic focus recovery when a focus tooltip must not flash.
- Confirmation dialogs close on Escape only while idle; pending actions keep the dialog open. They suppress automatic close-focus restoration, so callers recover focus, and keep their title and action row visible while oversized body content scrolls.
- Preserve `[data-slot='confirmation-dialog-content']` and `[data-page-help-content]`; overlays use them as outside-pointer dismissal exclusions.
- Foldable `RowActions` keeps designated low-frequency buttons in persistent overflow and switches that menu to the complete action set when the direct cluster folds for fit, including while the menu is open; `alwaysOverflow` requires `foldable`, and if unfolding removes the focused action, focus moves to the first remaining action after render.
- Closing `RowActions` restores its overflow trigger only while focus remains in the closing menu; a selected action that moved focus to another surface retains it.

## Boundaries

- Owns: shared presentation and app-specific wrappers around `components/ui` primitives.
- Does not own: route behavior, Mina-specific workflows, API access, URL state, or browser persistence.
