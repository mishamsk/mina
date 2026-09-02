# Plan: Make table screens usable on phone-sized viewports

## Goal

Make every full-page table usable below Mina's existing `sm` breakpoint by replacing its inline toolbar and pagination with one fixed button-driven controls overlay and letting the document scroll through table rows. Preserve the current fixed-height, internally scrolling table layout on tablet and desktop viewports.

## Constraints

- Apply one responsive contract to full-page Transactions and transaction drill-downs, account and group registers, Accounts, Categories, Tags, Members, Templates, Recurring definitions, and Status operation/audit tables. Do not change report previews or tables inside side panels, dialogs, editors, and other bounded overlays.
- Treat widths below the existing Tailwind `sm` breakpoint as phone-sized. Keep current layout, sticky-header, table-height, pagination-footer, and internal-scrolling behavior at `sm` and above; do not add JavaScript viewport detection or a second breakpoint system.
- Reuse the existing toolbar and pagination controls, URL state, callbacks, filter/edit-mode behavior, loading/disabled states, and labels in one shared mobile controls surface. Do not duplicate query or workflow state, add persistence, or change backend pagination.
- The mobile trigger stays fixed and reachable without consuming document layout height. Its overlay must fit the visual viewport, scroll internally when its controls are taller than the available space, close by Escape and outside interaction, and restore focus to the trigger.
- On phones, full-page table frames grow with their rows and do not own vertical scrolling. Preserve only horizontal overflow that remains necessary for an existing table or transaction Edit-mode layout, and leave responsive column-collapse behavior unchanged.
- Keep this a frontend presentation fix: no REST, generated-client, backend, data-model, sidebar/navigation, table-content, or workflow changes and no new dependency or abstraction beyond the shared mobile controls/layout seam.
- Add no test cases, fixtures, or new test files. Leave existing coverage unchanged unless a current responsive geometry assertion directly contradicts the new phone-only contract; if so, adjust that assertion in place without expanding coverage.

## Success Criteria

- [x] At phone widths, each in-scope page renders its title, actions, and table in normal document flow without an inline toolbar or pagination footer consuming the table viewport; the window scroll reaches every rendered row.
- [x] A fixed, accessible Controls button opens the page's existing toolbar controls and, for paginated tables, page size, page position, Previous, and Next controls in the same mobile overlay with their existing state and disabled/loading behavior intact.
- [x] Opening, using, and dismissing mobile controls preserves nested popover/select behavior, URL-backed state, transaction filter and Edit-mode semantics, Escape ordering, and trigger focus recovery.
- [x] At `sm` and wider widths, full-page tables retain their current bounded frames, internal vertical scrolling, sticky headers, inline toolbars, and inline pagination-footer geometry.
- [x] Report previews and overlay-owned tables retain their existing route-level or bounded scrolling behavior.
- [x] `docs/webui-design.md`, the Arcade Cabinet theme specification, `PROJECT_STATE.md`, and every touched frontend package contract concisely describe the new mobile-only control and scrolling ownership without duplicating implementation details.
- [x] No new test case, fixture, or test file is added.
- [x] `just prose-fmt`, `just pre-commit`, `just test`, and `just test-frontend-e2e` pass.

- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-01-mobile-table-controls.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Add the shared phone controls and page-scrolling contract

Update the responsive table-page composition so `PageHeader` toolbars and the pagination renderers owned by ledger, account registers, and Status feed one app-shell/shared mobile controls surface while retaining their current inline placement from `sm` upward. Apply the matching phone-only height and overflow changes through the shared reference-table frame and the in-scope transaction, register, recurring, and Status table containers instead of creating screen-specific mobile variants.

- [x] The mobile surface renders each existing control once in the active layout, uses unique form-control IDs, remains above page content without conflicting with Mina's established overlay stack, and adds enough page-end inset that its fixed trigger never makes the final table row unreachable.
- [x] Empty, loading, refresh-error, and filtered-empty states keep normal page scrolling and do not reserve a blank fixed-height table region on phones.
- [x] Existing desktop reference-table geometry and transaction/register pagination behavior remain unchanged; any existing test adjustment is limited to a now-obsolete phone-only layout assertion.
- [x] Update the owning design/theme and package documentation with the `write-package-docs` skill, then update `PROJECT_STATE.md` with only the user-visible mobile capability.
- [x] Run the plan-wide validation commands after formatting; do not add coverage.
- [x] Commit as `fix(webui): make mobile table controls usable`.
