# Plan: Simplified transaction draft persistence (feedback fleet, Brief E)

## Goal

Nothing about a create draft persists across closing the transaction entry modal unless the operator explicitly saves it. Closing a dirty create draft asks "Save draft?" with Discard draft as the default (Enter and Escape both discard) and Save draft as the explicit alternative; `Cmd/Ctrl S` while the modal is open saves the draft and closes. Only an explicitly saved draft is stored in IndexedDB (with its active tab) and restored on the next create launch. Sticky defaults carry only within the open modal session across "Save and add another". Edit, split, and duplicate discard confirmations keep their wording and adopt the same Enter-and-Escape-discard default.

- The baseline-persistence machinery (persist effect, post-save write-backs, baseline envelopes, legacy baseline synthesis, delete-race helpers) is removed.
- The launch-conflict flow survives only for a dirty create draft interrupted by a rail Edit relaunch, and reuses the Save draft dialog.

## Constraints

- No Kata issue; this is Brief E of `docs/plans/2026-09-14-p1-p2-feedback-fleet.md`.
- Target model in `frontend/src/features/ledger/entry-panel.tsx`:
  - Keep: the in-memory draft, `replacement` and its in-memory edit baseline, the session clean baseline for create (rename `ordinaryDraftBaselineRef` to make its session-only lifetime obvious), the session sticky paths (`stickyNextTabDraft`, `stickyNextAdvancedDraft`) which advance that baseline after "Save and add another", the launch date seed refs and `seedDraftDates`, `migrateStoredDraft`, the remembered tab preference (precedence: explicit launch tab, then a saved draft's own tab, then the preference), Clear draft (its confirmation, deletion of the saved draft, and baseline reset), and the existing `requestClose` / `closeRequestRef` / history-close plumbing.
  - Delete: `ordinaryBaselineMustPersistRef`, `ordinaryDraftStoredRef`, `lastStoredDraftFingerprintRef`, `draftFingerprint`, the whole persist effect, the two post-save write-backs (keep the baseline advance and `userChangedDateRef` bookkeeping), `legacyDraftBaseline` and `sharedLegacyDefault` (a legacy bare draft hydrates against `defaultDraft()`), `discardStoredTransactionEntryDraft`, `waitForStoredTransactionEntryDraftDiscard`, `draftDiscardLaunchWaitMs`, the "Discard entry draft" dialog and `cancelPendingLaunch`, and the `discardOrdinaryDraft` field.
  - `requestClose`: edit/split/duplicate keep "Discard transaction changes?" when dirty; a dirty create draft opens "Save draft?"; a clean create draft closes silently. Discard draft deletes any saved draft and closes. Save draft writes `draftForStorage(draft)` (dates seeded by the launch and untouched stay blank; the draft's real active tab is stored, no remembered-tab substitution) then closes; a write failure keeps the dialog open with an error message.
  - `Cmd/Ctrl S` in the panel `onKeyDown` (ahead of the `Mod+Enter` branch, same open-confirmation guard, `preventDefault` to beat the browser save dialog): saves the draft and closes for create launches; no-op for edit launches.
  - Restore: on the next create launch the saved draft becomes the in-memory draft and its own clean baseline, so closing it untouched is silent and keeps the saved copy; editing makes it dirty again and closing re-asks (Save overwrites, Discard deletes the stored copy).
  - Rail Edit relaunch (and any launch arriving while a dirty create draft is live): open the same "Save draft?" dialog with a pending-launch continuation: Discard drops the in-memory draft and adopts the launch; Save writes the draft then adopts the launch. A dirty edit draft replaced by another launch keeps "Discard transaction changes?" wording with the same discard default.
- `frontend/src/components/confirmation-dialog.tsx`: add `escapeAction?: "cancel" | "confirm"` (default `"cancel"`); when `"confirm"`, the existing capture Escape listener calls `onConfirm()` (when not pending or disabled) instead of `onOpenChange(false)`. Apply `initialFocus="confirm"` plus `escapeAction="confirm"` to "Save draft?" and "Discard transaction changes?"; "Clear entry draft?" and "Replace entry draft?" keep the cancel default.
- Save draft dialog design spec (per the existing confirmation treatment): title "Save draft?", body "Keep this unsaved entry for next time, or discard it. Only a saved draft reopens the next time you create a transaction.", cancel slot "Save draft" (outline), confirm slot "Discard draft" (destructive, trash icon, focused on open), pending label "Saving" while writing; standard centered dialog above the entry modal; no new component.
- `frontend/src/services/indexeddb/index.ts`: the stored value becomes `{ draft }` (the draft's `activeTab` is authoritative); drop `baseline` and `persistBaseline`; `writeTransactionEntryDraft(draft)` takes one parameter; reads keep accepting the legacy envelope and bare draft (forward-only value migration, no schema version bump).
- `frontend/src/features/ledger/entry-shortcuts.ts`: add a `Mod S` row "Save the draft and close" after the save rows; renumber ids.
- Docs (targeted rewrites): `docs/webui-design.md` entry bullets on drafts (the "persist to IndexedDB so an accidental close is recoverable" sentence, sticky fields scoped to the open session, the `?entry=new` deep-link sentence, the Close/Esc/drafts/focus bullet including the kp0d sentence, the rail "drafts persist" phrase, and the `EntryModal` inventory line); `frontend/src/features/ledger/PACKAGE.md` draft bullets; `frontend/src/services/indexeddb/PACKAGE.md`; `PROJECT_STATE.md` phrases about baseline-aware draft protection; all via the `write-package-docs` skill for package docs.
- Testing policy (mandatory): `docs/FRONTEND-TESTING.md` governs. Do not add e2e test files or net tests; reviewers must not request coverage. In `frontend/tests/e2e/transactions/entry.spec.ts` (18 tests today) restructure to the new model and reduce the count: rewrite "create drafts recover after closing and can be cleared" as the single Save draft journey (dirty close → Save draft → relaunch restores including the tab; Discard variant → nothing restores; Clear draft path kept); fold "entry retains edited fields but drops launch dates when recovering elsewhere" into "new entry follows the active day without persisting its seed" and cut that journey's repeated close-and-relaunch loops to one Save-draft relaunch; remove or fold the kp0d "entry-draft discard confirmation supports keyboard choices" test (its dialog no longer exists; keep at most one Enter/Escape assertion inside the rail-Edit path of an existing journey); add the Enter-and-Escape-discard assertions to "discarding a dirty edit keeps the original transaction"; rewrite "batched entry keeps sticky baselines clean across entry launches" so sticky survives "Save and add another" but not close, and fold "saving a template replacement keeps cleared tabs clean before edit launches" into it; strip the persistence halves from "palette templates replace sticky defaults and protect modified drafts" keeping only the in-session template-replacement protection. Target 15 or fewer tests. No REST as action or evidence, no matrices, no fixed waits, no `page.reload()` except where a persisted-draft restore is the behavior under test.
- Mina is pre-production with no users: no compatibility shims beyond reading legacy stored shapes.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo`: type into a new spend and press Escape: "Save draft?" appears with Discard draft focused; Enter closes and nothing restores on relaunch; repeat and press Escape in the dialog: same; repeat and click Save draft (and separately press `Cmd/Ctrl S` in the form): the draft including its tab restores on the next create launch, closing it untouched is silent, editing and discarding deletes it; a clean new entry closes silently; "Save and add another" keeps date, account, and type for the next entry but a fresh launch after close starts blank; Clear draft removes a saved draft; editing a transaction and closing with changes shows "Discard transaction changes?" with Enter and Escape discarding; a rail Edit click on a dirty create draft shows "Save draft?" and both choices continue into the edit.
- [x] Screenshot of the "Save draft?" dialog is attached to the completion report.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e` passes (full suite) with the entry spec at 15 tests or fewer and no other spec count increased.
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-draft-persistence.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report. Reviewers must not request added coverage.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Confirmation dialog escape action and storage shape

- [x] `escapeAction` prop exists; the IndexedDB value is `{ draft }` with one-parameter writes and legacy-tolerant reads; package docs updated.
- [x] Commit as `feat(frontend): escape-confirm dialogs and a draft-only entry storage record`.

### Task 2: Explicit-save draft model in the entry panel

- [x] Persist machinery removed; Save draft dialog, `Cmd/Ctrl S`, restore semantics, rail relaunch continuation, and the edit discard default implemented; help row added.
- [x] Commit as `feat(ledger): persist entry drafts only on explicit save`.

### Task 3: Test consolidation and docs

- [x] `entry.spec.ts` restructured to the new model at 15 tests or fewer; design doc, package docs, and PROJECT_STATE.md updated; `just prose-fmt` run.
- [x] Commit as `test(frontend): consolidate entry draft journeys for explicit-save drafts`.
