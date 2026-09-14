# Plan: Palette account action subtitle polish (Kata r1yn, fix pass 1)

## Goal

The active account result's action subtitle reads cleanly at the palette's width without stranding a key chip away from its clause, and three review nits are cleaned up.

## Constraints

- Do not run review-loop.
- Implementation-only; do not edit completed plans, `docs/architecture.md`, or `docs/frontend-architecture.md`.
- Subtitle (operator-observed at 1280×800): "Cmd/Ctrl Enter opens Transactions filtered to this account · Enter alone opens register" wraps after the second `Enter` chip, leaving it stranded on line one. Fix in `frontend/src/features/command-palette/command-palette.tsx`: render each clause (keys plus its verb phrase) as an unbreakable unit (`inline-flex items-center gap-1 whitespace-nowrap`) so wrapping happens only between clauses at the separator, and shorten the copy so both clauses usually fit on one line: default "Enter opens register · Cmd/Ctrl Enter opens filtered Transactions"; held "Cmd/Ctrl Enter opens filtered Transactions · Enter opens register" (group rows say "filtered Transactions" too). Keep the `sr-only` description and live-region clauses in sync with the new copy.
- Nits: use `toBeHidden()` instead of `not.toBeVisible()` at the flagged line in `frontend/tests/e2e/command-palette.spec.ts`; move the new Command Palette bullet in `docs/webui-design.md` into the section's bullet list (after the Navigation or entity-discovery bullet) instead of above the lead paragraph; change `useAcceleratorHeld` to take an options object (`{ enabled, metaOnly }`) and update its two picker call sites and the palette call site plus `frontend/src/hooks/PACKAGE.md` if the signature is described there.
- Protect, do not regress: every behavior verified by the operator (Enter opens register, accelerator+Enter and accelerator+click open the exact-ID or scoped filter, subtitle flips with the accelerator and follows arrow navigation, help catalog row) and the existing e2e suites.
- Mina is pre-production with no users: no compatibility shims.

## Success Criteria

- [x] With `just dev --demo` at 1280×800, the subtitle for a leaf and for a group shows each clause intact (no chip separated from its phrase) in both the default and held states.
- [x] `just frontend-check` passes with no new lint warnings.
- [x] `just test-frontend-e2e tests/e2e/command-palette.spec.ts tests/e2e/keyboard-shortcuts.spec.ts tests/e2e/transactions/entry-pickers.spec.ts` passes on chromium and webkit.
- [x] `just pre-commit` passes.
- [x] Commit as `fix(command-palette): keep action subtitle clauses intact and tidy review nits`.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.
