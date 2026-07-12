# Plan: Advanced entry account picker parity (Kata 7abv)

In advanced record-level entry, the account picker's suggestion set is narrower than what manual FQN typing accepts — a hidden inconsistency. Align the suggestions with the documented rules so both paths agree.

## Plan Context

- Kata issue: `7abv`.
- MANDATORY pre-reads: `docs/webui-design.md` (account pickers "filter intelligently by context: only account types valid for the field being edited … derived from the intent shape rules in docs/accounting-semantics.md. This is deterministic filtering, never record-role guessing"; hidden entities excluded from pickers), `docs/accounting-semantics.md` INTENT SHAPE RULES table (`:90-107`), `docs/TESTING.md`.
- Diagnose FIRST (record findings in the kata comment): compare three sets for an advanced-entry record row —
  1. what the picker suggests (`frontend/src/features/ledger/entity-picker.tsx` account variant + its filter inputs from `entry-panel.tsx`, e.g. intent-derived type filter),
  2. what manual typing accepts client-side,
  3. what the backend accepts at save (the intent shape rules; note fee allows `flow` OR `system`, adjustment/fx involve `system`, exchange combinations, etc.).
- The documented rule (this IS the spec — do not invent a new one): suggestions = active, non-hidden accounts whose type is valid for the row's category intent PER THE FULL intent-shape-rules table. Known likely bug shape: the picker's intent→type mapping is narrower than the semantics table (e.g. omitting `system` where the intent allows it, or over-filtering rows with no category yet — a row with no category should suggest all active non-hidden accounts).
- Fix the picker filter to match exactly; manual typing stays permissive (backend validates at save — do not add client-side rejection that duplicates backend validation).
- Hidden accounts stay excluded from suggestions (documented rule) while typed hidden FQNs remain accepted — that asymmetry is BY DESIGN; note it in the kata close rather than "fixing" it.
- If diagnosis reveals a genuine rule gap the docs don't answer, STOP that sub-question and record it in the kata comment for the operator — do not edit ground-truth docs.
- e2e (`transactions-page.spec.ts` advanced-entry patterns): for a fee-intent row, an account type the semantics allow but the picker previously omitted now appears in suggestions AND saves; a category-less row suggests broadly; hidden account absent from suggestions but typed FQN saves.
- No doc edits beyond feature PACKAGE.md if the picker contract line changes. No PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: Diagnose and align the picker filter

- [x] Diagnosis recorded in kata comment; picker filter aligned with the intent-shape-rules table per Plan Context.
- [x] e2e per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `7abv` (`kata comment 7abv --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Advanced entry account picker parity (kata 7abv): picker suggestions aligned exactly with the accounting-semantics intent-shape-rules table (active, non-hidden, intent-valid types; broad when no category), manual typing stays permissive with backend-owned validation, hidden-account picker exclusion kept as documented asymmetry; e2e proves previously-omitted intent-valid types now suggested and save"`
- [x] Move this plan to `docs/plans/completed/`
