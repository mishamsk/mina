# frontend/src/components/ui

## Purpose

- Owns source-managed shadcn/Radix primitives and Mina-wide visual variants.

## Implicit Contracts

- Treat shadcn-generated files as app source, not replaceable dependencies.
- Preserve overlay portals, stack order, `data-slot` names, and Radix state attributes: feature close logic and global shortcut blocking coordinate through them.
- `SelectItem` keeps `data-testid="select-option-{value}"` for browser automation.
- The shared chart primitive owns Recharts context, semantic color variables, responsive framing, and tooltip presentation; keyboard-driven tooltip changes use a polite live region. Features provide complete datasets and omit Recharts legends.

## Boundaries

- Owns low-level visual and accessible primitive composition.
- App-specific shared components and features own workflow behavior, including overlay state, Escape handling, and focus recovery.
- Does not own routes, REST state, browser persistence, or product behavior.
