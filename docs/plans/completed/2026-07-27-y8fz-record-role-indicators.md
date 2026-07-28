# Plan: Surface derived journal record roles in the UI (Kata `y8fz`)

Every journal-record table shows each record's server-derived role as a compact, accessible indicator — visually analogous to the transaction-class marker but clearly record-level — so the connection between a transaction's class and its underlying accounting meaning is scannable everywhere records render.

## Plan Context

- Kata issue: `y8fz` — "Surface derived journal record roles in the UI" (P2, frontend). Roles are server-derived per `docs/accounting-semantics.md`: `expense`, `refund`, `income`, `clawback`, `exchange`, `adjustment`, `balance`. The UI renders the server value — never derives roles client-side (`docs/webui-design.md` hard rule). The record read model already carries the derived role; the Advanced editor's dry-run classify response carries per-record roles for draft feedback. If any required surface's response lacks the role, extending the read contract is in scope — verify before assuming.
- Operator design decisions (implement within these; do not relitigate the shape):
  - Presentation: a distinct pixel glyph per role (pixelarticons; Lucide fallback per theme rules), rendered as an **indicator** (bare glyph, no chip frame, no press/hover affordance) in a narrow leading column of each record table — mirroring the transaction line's leading class-icon column so the two read as the same vocabulary at different levels. Each glyph carries a tooltip naming the role and an accessible name; shape alone distinguishes roles, color never carries the meaning.
  - Color: role glyphs render quiet — ink or `--muted-foreground` per the theme's "icons follow text color tokens" default — deliberately subordinate to the class icon's accent ink. No new accent mappings.
  - The per-record disclosure sub-rows (plain undecorated text per the theme) list the role as text (e.g. "Role expense"), keeping every record value one activation away.
  - The Advanced journal editor's server-classified draft feedback keeps its existing textual presentation but uses the same role names; add glyphs there only if it fits the footer without layout shift.
  - Row height must not change anywhere; the records subtable's "plain undecorated table text" theme rule stays true for the other columns — the new indicator column is the analog of the status glyph, not a chip.
- Surfaces to cover consistently (the issue's list): inline expanded transaction rows' records subtable, the transaction detail panel record table, the account-register peek record table, and the Advanced editor's dry-run feedback where applicable. Keep the account register's own rows out of scope unless they already render a record table with the same component (verify; the register row's role is available via the record-role filter dimension and its rows are records — if the shared records-table component covers it for free, include it; do not build a register-specific variant).
- Preserve: table density, fixed column widths (adding the narrow column must not destabilize layout — follow the stable-column-width rule), raw-record truthfulness, existing class display, column-collapse priorities, and all current e2e assertions.
- Ground truth: `docs/webui-design.md` (affordance classes, progressive disclosure, Screen 2 detail spec), `docs/webui-theme-arcade-cabinet.md` (iconography, in-table marker rules, indicator treatment), `docs/accounting-semantics.md` (role meanings — read to pick sensible glyphs), `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Role indicator component and record-table adoption

- [x] Implement the shared role indicator (glyph map for the 7 roles + tooltip + accessible name) and adopt it across the expanded-records subtable, detail record table, and register peek record table; disclosure rows list the role as text; verify each surface against the demo dataset with `just dev --demo` (all 7 roles reachable via demo or REST-created fixtures — exchange, adjustment, and balance included).
- [x] Update `frontend/src/features/ledger/PACKAGE.md` if the record-table contract wording changes.
- [x] Commit the task as `feat(frontend): surface derived journal record roles as row indicators`.

### Task 2: Advanced editor draft feedback and coverage

- [x] Align the Advanced editor's dry-run role feedback with the same role vocabulary (glyphs only if layout-stable); verify against a draft that classifies to multiple roles.
- [x] e2e coverage: role indicators visible with correct accessible names/tooltips in the expanded subtable and detail panel for at least spend (expense+balance), exchange, and adjustment fixtures; row height unchanged (reuse the existing row-height assertions pattern).
- [x] Commit the task as `test(frontend-e2e): cover record role indicators across record tables`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-27-y8fz-record-role-indicators.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `y8fz` with `kata close y8fz --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
