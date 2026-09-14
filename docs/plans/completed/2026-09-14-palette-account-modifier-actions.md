# Plan: Modifier-aware account actions in the command palette (Kata r1yn)

## Goal

Account and account-group results in the command palette communicate and offer two actions: Enter opens the register (today's behavior), and Enter with the platform accelerator held (`Cmd` on macOS, `Ctrl` elsewhere) opens the Transactions page pre-filtered to that account or group. The active result shows an Alfred-style subtitle describing what Enter will do right now, and the subtitle flips while the accelerator is held, including while navigating results with the arrow keys. Everything stays keyboard accessible and is announced to assistive technology.

- One shared accelerator-held hook; one shared account-to-Transactions filter URL builder reused by the account page.
- The keyboard shortcuts help lists the palette modifier action.

## Constraints

- Kata issue: `r1yn`.
- Accelerator semantics follow the existing app convention: `metaKey || ctrlKey` is the accelerator, labeled through `Kbd` as `Mod` (renders `Cmd/Ctrl`). No platform sniffing. Read the modifier from the activating event (Enter keydown, click) for the decision; use hook state only for the subtitle.
- Shared hook: `frontend/src/hooks/use-accelerator-held.ts` (generic; subscribe to window `keydown`/`keyup`/`blur`/`visibilitychange`, derive from `event.metaKey || event.ctrlKey` on every key event, only set state on change, accept an `enabled` flag so it listens only while the palette is open). Offer a Meta-only option and migrate the private `useMetaKeyPressed` in `frontend/src/features/ledger/entity-picker.tsx` to it without changing picker behavior; document in `frontend/src/hooks/PACKAGE.md`.
- Shared URL builder: extract the account filter expression built in `frontend/src/pages/account-page.tsx` (`writeTransactionFiltersToSearchParams` with `account:#<id>`) into one helper (in `frontend/src/models/transaction-filters.ts` or the ledger feature, whichever owns the neighbors) and use it from both the account page and the palette. For groups, widen `withTransactionFilterEntityScope` to accept `"account"` and build the scoped `account:"<prefix>:*"` term. Leaf URL: `/transactions?filter=account:#<id>` (plus the builder's default page param) exactly as the account page's Transactions action produces today.
- Command model in `frontend/src/features/command-palette/command-palette.tsx`: add an optional alternate-action descriptor to `CommandItem` (label plus `to`) and a default-action label; populate both for account leaves and groups in `accountCommands`. `activateCommand` takes an `alternate` flag and resolves the target before the existing current-route check and navigation; Enter and click pass the modifier state from their events. Commands with `action` are unaffected.
- Subtitle: on the active option only, render a second line under the label (muted, small; follow the two-line active transaction-result pattern in the same file) reading, by default, "Enter opens register · Cmd/Ctrl Enter opens Transactions filtered to this account" with the `Kbd` chips for the keys, and while the accelerator is held, the emphasis flips to the alternate action. Keep arrow navigation ignoring modifiers so `Cmd/Ctrl` plus arrows moves the selection and the subtitle follows. Note the viewport row-limit estimate (`entityResultRowHeightPx`) is a floor and comment it.
- Accessibility: each account option gets `aria-describedby` to an `sr-only` description carrying its current action text; one `sr-only` polite `role="status"` region in the palette announces the action clause when the active row or the accelerator state changes (pattern from the entity picker's live region); guard against double announcements on plain arrow navigation.
- Palette rows stay `button role="option"`; do not convert them to links (the new-tab link rule does not apply, and links would conflict with it).
- Help catalog: add a static "Command palette" group in `frontend/src/features/app-shell/global-shortcuts.ts` (rendered between Global and Transaction entry in `keyboard-shortcuts-dialog.tsx`) with one row: `Mod` `Enter` "Open Transactions filtered to the account" with detail "On an account or account-group result; Enter alone opens its register."
- Preserve: all other palette behaviors (transaction search, template commands, app actions, focus restoration, the `?` action), the account page Transactions header action URL, and the existing e2e suites.
- Browser coverage per `docs/FRONTEND-TESTING.md`, in `frontend/tests/e2e/command-palette.spec.ts` (7 tests): one journey that types an account name, asserts the active result's subtitle mentions the register and the filtered Transactions action, holds `ControlOrMeta` via `page.keyboard.down`, asserts the subtitle flips, presses Enter, and asserts the URL is `/transactions` with `filter=account:#<id>`; plus one shallow check that plain Enter still opens the register (may reuse the existing account test). Add one assertion to `frontend/tests/e2e/keyboard-shortcuts.spec.ts` for the new help row. Stable hooks: a `data-testid` on the subtitle.
- Docs: add a Command Palette bullet in `docs/webui-design.md` describing the modifier-aware account actions and subtitle; update the `CommandPalette` primitive bullet and the keyboard-help bullet if the static group list is named there; `PROJECT_STATE.md` one phrase; package docs for command-palette, app-shell, hooks, models (if widened), ledger (picker hook migration) via the `write-package-docs` skill. Do not change `docs/architecture.md`, `docs/frontend-architecture.md`, `docs/webui-theme-arcade-cabinet.md`, `VISION.md`, or `SCOPE.md`.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo`: search an account in the palette; the active result shows the subtitle; holding `Cmd` (macOS) flips it; `Cmd+Enter` lands on `/transactions?filter=account:#<id>` with the account chip applied; plain Enter opens the register; the same works for an account group with a scoped filter; `Cmd`+arrow keys move the selection with the subtitle following; the shortcuts help lists the palette row.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e` passes (full suite: palette and shared filter builder changed).
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-palette-account-modifier-actions.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report.
- [x] Close Kata `r1yn` with the commits and validation evidence (`kata close r1yn --done --message "..." --commit <sha> --test "<suites>" --agent`).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Shared accelerator hook and account filter URL builder

- [x] Hook and builder exist; the account page and the entity picker use them with no behavior change.
- [x] Commit as `refactor(frontend): share the accelerator-held hook and account filter builder`.

### Task 2: Modifier-aware account actions and subtitle in the palette

- [x] Alternate actions, subtitle, live announcement, and event-driven activation work for leaves and groups.
- [x] Commit as `feat(command-palette): add modifier-aware account actions with an action subtitle`.

### Task 3: Help catalog row, coverage, and docs

- [x] Static Command palette help group added; e2e journeys pass on chromium and webkit; docs and package docs updated; `just prose-fmt` run.
- [x] Commit as `feat(app-shell): document palette account actions in shortcuts help with coverage`.
