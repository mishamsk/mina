# Plan: 4nmw detail panel polish — operator review fixes (fix plan 1) — Kata issue `4nmw`

Small cleanups from the operator architectural audit of branch `4nmw-detail-panel-polish`. Implementation-only; all five kata behaviors are verified working live (Enter opens detail, Esc restores focus, Space expands, non-modal semantics, no horizontal scroll, toast auto-dismisses) — do not change any observable behavior except the toast text color default.

## Plan Context

- Do not run review-loop.
- Operator decision (do not relitigate): the detail records subtable's stacked label/value reflow below 680px container width is an accepted, intentional deviation from the list-table column-collapse priority rule — the detail surface must show every per-record value. Leave it as is.
- Protect — do not regress: all e2e suites; toast auto-dismiss (~4s) and repeated-notice restart; Enter/Space keyboard split; focus restore on Esc; delete confirmation modality.
- Scope exclusions: only the files/lines below; no new features; no ground-truth doc edits; no PROJECT_STATE.md update.

## Tasks

### Task/Commit 1: Toast genericity and single-source dismiss timing

- [x] `frontend/src/components/toast.tsx:69`: the generic toast hardcodes `text-[var(--color-money-in)]` (Mina money-in/success semantics) for all messages. Default the message color to `text-foreground` and accept an optional tone/variant (or className) so the caller applies the success (mint ink) tone; the transactions page keeps the mint ink look for its save/delete notices.
- [x] Remove the redundant page-level dismiss timer in `frontend/src/pages/transactions-page.tsx` (the effect clearing `saveNotice` after `toastDurationMs`) — the `Toast`'s internal timer plus `onDismiss` → clear already handles it and `key={saveNotice.id}` handles repeats. Source the duration from one shared constant instead of the literal `4000` appearing in the page, the `Toast` default, and the CSS `--toast-duration` fallback.
- [x] Drop the redundant `aria-live="polite"` next to `role="status"` in `toast.tsx` (status implies polite), and remove the belt-and-suspenders CSS visibility keyframe (`styles.css:183-192`, `:473-475`) in favor of the JS unmount — or, if the keyframe is kept for a concrete reason, remove the JS duplication instead and state the reason in the commit message. One mechanism, not two.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
