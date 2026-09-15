# frontend/src/components

## Purpose

- Provides shared presentational components and UI-wide interaction primitives.

## Implicit Contracts

- Row keyboard and pointer handlers share the interactive-target guard with link activation so nested controls retain their own behavior.

- `fixedPageClassName` in `reference-table-frame` bounds roomy pages to the canvas, establishes the containing block for absolute descendants, and clips overflow with physical padding for pixel shadows/focus outlines; compensating margins preserve the content inset, and compact pages retain document flow. Flexing content slots reserve space for headers and banners.
- `referenceTableFrameClassName` owns the bounded roomy table frame; its inner viewport scrolls beneath sticky headers. `referenceTableStateClassName` bounds non-loaded surfaces and keeps oversized state content reachable without window overflow; `referenceTableShadowReservationClassName` adds compensated roomy shadow padding to loading/error wrappers without shifting their cards.
- Navigable rows mark their primary anchor with `data-row-link`; shared row activation delegates to it and yields to nested controls and native gestures. Navigation side-effect callbacks run only for plain primary activation, following the [web UI link rule](../../../docs/webui-design.md#navigation-links).
- Tooltip Escape dismisses the tooltip, then forwards one Escape to the original target so the active overlay's Escape ladder can continue.
- Persistent forced tooltips ignore hover-close transitions but retain ordinary Escape dismissal and forwarding.
- Focusable tooltip wrapper triggers must supply an accessible trigger label.
- Use `focusWithoutTooltip` for programmatic focus recovery when a focus tooltip must not flash.
- Confirmation dialogs default to cancelling on Escape while idle; `escapeAction="confirm"` invokes the enabled confirm action instead; pending actions keep the dialog open, while an independently disabled confirm action never disables Cancel or the default cancel-on-Escape behavior and can expose its caller-supplied reason through the shared tooltip. They suppress automatic close-focus restoration, so callers recover focus, and keep their title and actions visible while oversized body content scrolls; actions wrap when their labels exceed the available row width. Their action row exposes only its two buttons as tab stops; pending or disabled buttons with tooltips stay focusable with guarded activation. Initial focus defaults to Cancel, supports a confirm-first opt-in, and gives an explicit `initialFocusRef` precedence.
- Preserve `[data-slot='confirmation-dialog-content']` and `[data-page-help-content]`; overlays use them as outside-pointer dismissal exclusions.
- Foldable `RowActions` keeps designated low-frequency buttons in persistent overflow and switches that menu to the complete action set when the direct cluster folds for fit, including while the menu is open; `alwaysOverflow` requires `foldable`, and if unfolding removes the focused action, focus moves to the first remaining action after render.
- Closing `RowActions` restores its overflow trigger only while focus remains in the closing menu; a selected action that moved focus to another surface retains it.
- `MobileTableControls` keeps each control source mounted while moving it between its roomy inline slot and the app-shell compact Controls sheet, exposes a source-aware trigger for the shared bottom toolbar with an explanatory tooltip when unavailable, closes when that trigger leaves the rendered layout, and hands focus between the trigger and visible inline controls whenever the shell mode changes. Compact nested popovers and selects overlay without dismissing their parent Controls or Edit sheet, retain the parent combobox and its draft, reveal the parent on dismissal, and keep iOS form text at 16px to avoid focus zoom. The transaction Edit dock uses the same registered-source contract for its conditional compact toolbar action, closes its compact sheet when returning to the roomy shell, and restores the dock in layout without losing focus. Global toasts clear the compact toolbar.

## Boundaries

- Owns: shared presentation, responsive full-page table frames and controls, and app-specific wrappers around `components/ui` primitives.
- Does not own: route behavior, Mina-specific workflows, API access, URL state, or browser persistence.
