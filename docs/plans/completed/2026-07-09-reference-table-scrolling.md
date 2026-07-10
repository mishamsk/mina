# Plan: Restore reference-table internal scrolling and bottom inset (`efrg`)

Constrain the Accounts, Categories, Tags, and Members table surfaces to the remaining viewport so long datasets scroll inside the bright data surface and every table frame keeps the designed bottom inset. Preserve the Arcade Cabinet presentation and all existing table interactions.

## Plan Context

- Ground truth: `docs/webui-design.md` requires the browser/table body to fill available viewport height with its bottom edge aligned to the sidebar bottom-control inset; `docs/webui-theme-arcade-cabinet.md` requires a bright framed data surface with sticky sky header, ink outline, and hard shadow.
- Current defect: the flex height chain reaches each page content slot, but the loaded table frame/scroller does not consume the bounded height. Long rows therefore expand the document (observed at 2,822px for Accounts and 2,057px for Categories at 1440×900).
- Apply one layout contract to loaded data tables on Accounts, Categories, Tags, and Members. Long bodies scroll internally; short bodies keep the full-height framed surface and bottom inset without stretching rows.
- Preserve sticky headers, horizontal-overflow behavior, keyboard row focus, row actions, empty/error/skeleton states, side panels, responsive column collapse, current typography/colors/shadows, and URL-backed filters.
- Prefer the smallest reusable flex/min-height correction in existing page/content/table boundaries; do not add brittle fixed pixel heights, JavaScript resize measurement, a second table shell, or global document-scroll suppression that breaks other pages.
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `efrg`.

## Tasks

### Task/Commit 1: Establish and verify the bounded reference-table layout

Repair the height propagation and loaded-table wrapper classes so each reference table consumes the page's remaining flex space. Add browser regression coverage that measures observable geometry and scrolling across all four pages.

- [x] Make the loaded Accounts table frame and its `accounts-table-scroll` region consume the bounded content height with internal vertical scrolling and no page-height growth.
- [x] Apply the same full-height/min-height/scroller contract to the shared category/tag `ReferenceTree` and the flat Members list, reusing shared classes/components where that reduces drift without inventing a redundant abstraction.
- [x] Keep short datasets inside a full-height framed data surface whose bottom border/shadow remains at the standard main-content inset; do not stretch table rows or introduce a horizontal scrollbar.
- [x] Preserve sticky table headers and keyboard/focus behavior while the body scrolls; the document/root scroll position must remain unchanged during table scrolling.
- [x] Add frontend e2e coverage for Accounts, Categories, Tags, and Members at 1440×900 (and a representative narrower desktop width where useful): long datasets have `scrollHeight > clientHeight`, scrolling changes the internal container rather than `window.scrollY`, and the table frame bottom aligns with the sidebar/main bottom inset within a small geometry tolerance.
- [x] Cover a short/filtered dataset on each page: the frame retains the same bottom alignment while its scroller does not report unnecessary vertical overflow.
- [x] Keep test fixtures and assertions at browser/API boundaries; do not add unit tests or test implementation-specific Tailwind class strings.
- [x] Update `PROJECT_STATE.md` concisely to note the shared internally scrolling reference-table behavior.
- [x] Update package docs only if implementation introduces a non-obvious ownership or layout invariant not already explicit in the ground-truth design docs.
- [x] Add Kata `efrg` progress and verification evidence.
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
- [x] Run `just review-loop "Restore bounded internal scrolling for Accounts, Categories, Tags, and Members; preserve Arcade Cabinet frames and sticky headers; verify long and short dataset geometry"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `efrg` only after the plan is moved to completed
