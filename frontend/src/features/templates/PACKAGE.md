# frontend/src/features/templates

## Purpose

- Owns transaction-template resource snapshots and management workflows.

## Implicit Contracts

- One transient, complete active-template snapshot is shared by the Templates page, transaction entry, and command palette.
- The snapshot consumes server-derived compatible shorthand types; transaction entry filters by active tab and mechanically copies matching raw record defaults without classifying them in the browser.
- Successful template mutations update an existing snapshot synchronously, then refresh it; failed refreshes preserve previously loaded choices.
- Account type or currency changes invalidate the snapshot so its server-derived shorthand compatibilities are refetched before reuse.
- Client-derived groups follow the prefix-free FQN hierarchy and never become accounting resources.
- The app shell owns one transient template-editor launch; create/edit drafts are never persisted or URL-backed.
- Template records are partial defaults: every field is independently optional, active hidden references already selected on a record remain resolvable, fresh choices exclude hidden references, and tombstoned references are unavailable.
- Transaction capture maps active records in response order and copies only account, category, member, currency, native amount, tags, and memo; dates and transaction-only metadata never enter the draft.
- Edit preserves the FQN; hierarchy changes remain owned by restructure.

## Boundaries

- Owns template management UI, template-specific mutation refresh, and template summaries.
- Does not own transaction entry behavior, generated REST setup, or backend validation.

## Testing Notes

- Frontend e2e covers route navigation, hierarchy workflows, editor validation/focus, partial defaults, and cross-consumer refresh.
