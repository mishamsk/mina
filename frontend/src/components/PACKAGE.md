# frontend/src/components

## Purpose

- Provides shared presentational components and UI-wide interaction primitives.

## Implicit Contracts

- Tooltip Escape dismisses the tooltip, then forwards one Escape to the original target so the active overlay's Escape ladder can continue.
- Persistent forced tooltips ignore hover-close transitions but retain ordinary Escape dismissal and forwarding.
- Focusable tooltip wrapper triggers must supply an accessible trigger label.
- Use `focusWithoutTooltip` for programmatic focus recovery when a focus tooltip must not flash.
- Confirmation dialogs close on Escape only while idle; pending actions keep the dialog open, while an independently disabled confirm action never disables Cancel or Escape and can expose its caller-supplied reason through the shared tooltip. They suppress automatic close-focus restoration, so callers recover focus, and keep their title and action row visible while oversized body content scrolls.
- Preserve `[data-slot='confirmation-dialog-content']` and `[data-page-help-content]`; overlays use them as outside-pointer dismissal exclusions.
- Foldable `RowActions` keeps designated low-frequency buttons in persistent overflow and switches that menu to the complete action set when the direct cluster folds for fit, including while the menu is open; `alwaysOverflow` requires `foldable`, and if unfolding removes the focused action, focus moves to the first remaining action after render.
- Closing `RowActions` restores its overflow trigger only while focus remains in the closing menu; a selected action that moved focus to another surface retains it.
- `MobileTableControls` keeps each control source mounted while moving it between its roomy inline slot and the app-shell compact Controls sheet, exposes a source-aware trigger for the shared bottom toolbar with an explanatory tooltip when unavailable, closes when that trigger leaves the rendered layout, and hands focus between the trigger and visible inline controls whenever the shell mode changes. Compact nested popovers and selects overlay without dismissing their parent Controls or Edit sheet, retain the parent combobox and its draft, reveal the parent on dismissal, and keep iOS form text at 16px to avoid focus zoom. The transaction Edit dock uses the same registered-source contract for its conditional compact toolbar action, closes its compact sheet when returning to the roomy shell, and restores the dock in layout without losing focus. Global toasts clear the compact toolbar.

## Boundaries

- Owns: shared presentation, responsive full-page table frames and controls, and app-specific wrappers around `components/ui` primitives.
- Does not own: route behavior, Mina-specific workflows, API access, URL state, or browser persistence.
