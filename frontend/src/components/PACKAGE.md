# frontend/src/components

## Purpose

- Owns generic reusable presentational UI components.

## Implicit Contracts

- Components here have no Mina accounting meaning; if a component could have come from npm, it belongs here.
- Shared tooltips are Esc-transparent: Esc dismisses the tooltip and continues to the active interactive overlay's ladder.
- Confirmation dialogs dismiss on Esc when no action is pending; pending dialogs remain open.
- `ConfirmationDialog` preserves the `[data-slot='confirmation-dialog-content']` hook for outside-pointer exclusions owned by consuming overlays.

## Boundaries

- Owns: shared presentation components and app-specific wrappers around `components/ui` primitives.
- Does not own: route behavior, Mina-specific feature workflows, API configuration, or browser persistence.

## Testing Notes

- No package-specific testing notes.
